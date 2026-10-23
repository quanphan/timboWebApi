const bcrypt = require('bcrypt');
const User = require('../models/User');
const { ApiError } = require('../utils/errors');
const { parsePagination } = require('../utils/pagination');
const { pageMeta } = require('../utils/http');
const { DEFAULT_ADMIN_PERMISSIONS, hasPermission } = require('../utils/permissions');
const { publicUser } = require('../utils/presenters');
const { isAdmin, isSuperAdmin } = require('../utils/roles');
const { escapeRegex } = require('../utils/text');
const {
    validateAdminUserUpdate,
    validateCreateAdmin,
    validatePasswordChange,
    validateProfile,
    validateRoleChange,
    validateStatusChange,
} = require('../validators/authValidators');

function createAccountService() {
    return {
        profile(user) {
            return publicUser(user);
        },

        async updateProfile(user, body) {
            const updates = validateProfile(body);
            Object.assign(user, updates);
            await user.save();
            return publicUser(user);
        },

        async changePassword(user, body) {
            const input = validatePasswordChange(body);
            if (!user.password) {
                throw new ApiError(400, 'BAD_REQUEST', 'This account has no password to change.');
            }
            const matches = await bcrypt.compare(input.currentPassword, user.password);
            if (!matches) {
                throw new ApiError(401, 'UNAUTHORIZED', 'Current password is incorrect.');
            }
            user.password = await bcrypt.hash(input.newPassword, 10);
            user.refreshTokens = [];
            await user.save();
            return { updated: true };
        },

        async listUsers(query) {
            const { page, limit, skip } = parsePagination(query);
            const filter = buildUserFilter(query);
            const [total, users] = await Promise.all([
                User.countDocuments(filter),
                User.find(filter).sort({ createdAt: -1, _id: 1 }).skip(skip).limit(limit),
            ]);
            return {
                users: users.map(publicUser),
                meta: pageMeta(page, limit, total),
            };
        },

        async getUser(userId) {
            const user = await User.findById(userId);
            if (!user) {
                throw new ApiError(404, 'NOT_FOUND', 'User was not found.');
            }
            return publicUser(user);
        },

        async createAdmin(body) {
            const input = validateCreateAdmin(body);
            const existing = await User.findOne({ email: input.email });
            if (existing) {
                throw new ApiError(409, 'CONFLICT', 'Email is already registered.');
            }
            if (input.username) {
                const taken = await User.findOne({ username: input.username });
                if (taken) {
                    throw new ApiError(409, 'CONFLICT', 'Username is already registered.');
                }
            }
            const user = await User.create({
                name: input.name,
                email: input.email,
                username: input.username || undefined,
                phone: input.phone || undefined,
                password: await bcrypt.hash(input.password, 10),
                role: 'admin',
                admin: '1',
                status: 'active',
                emailVerified: false,
                permissions: input.permissions || [...DEFAULT_ADMIN_PERMISSIONS],
            });
            return publicUser(user);
        },

        async updateRole(actor, userId, body) {
            const updates = validateRoleChange(body);
            const user = await User.findById(userId);
            if (!user) {
                throw new ApiError(404, 'NOT_FOUND', 'User was not found.');
            }
            if (isSuperAdmin(user) || String(user._id) === String(actor._id)) {
                throw new ApiError(403, 'FORBIDDEN', 'This account role cannot be changed.');
            }
            if (updates.role) {
                user.role = updates.role;
                user.admin = updates.role === 'admin' ? '1' : '0';
            }
            if (updates.permissions) {
                user.permissions = user.role === 'admin' ? updates.permissions : [];
            } else if (updates.role === 'admin' && storedPermissionsMissing(user)) {
                user.permissions = [...DEFAULT_ADMIN_PERMISSIONS];
            }
            if (user.role === 'customer') {
                user.permissions = [];
            }
            await user.save();
            return publicUser(user);
        },

        async updateStatus(actor, userId, body) {
            const updates = validateStatusChange(body);
            const user = await User.findById(userId);
            if (!user) {
                throw new ApiError(404, 'NOT_FOUND', 'User was not found.');
            }
            if (isSuperAdmin(user) || String(user._id) === String(actor._id)) {
                throw new ApiError(403, 'FORBIDDEN', 'This account status cannot be changed.');
            }
            user.status = updates.status;
            if (updates.status === 'locked') {
                user.refreshTokens = [];
            }
            await user.save();
            return publicUser(user);
        },

        async updateUser(actor, userId, body) {
            const updates = validateAdminUserUpdate(body);
            const user = await User.findById(userId);
            if (!user) {
                throw new ApiError(404, 'NOT_FOUND', 'User was not found.');
            }
            if (updates.role || updates.permissions) {
                if (!hasPermission(actor, 'users.update_role') || isSuperAdmin(user) || String(user._id) === String(actor._id)) {
                    throw new ApiError(403, 'FORBIDDEN', 'This account role cannot be changed.');
                }
            }
            Object.assign(user, updates);
            if (updates.role === 'customer') {
                user.permissions = [];
            }
            await user.save();
            return publicUser(user);
        },

        async deleteUser(actor, userId) {
            if (String(actor._id) === String(userId)) {
                throw new ApiError(400, 'BAD_REQUEST', 'You cannot delete your own account from the admin list.');
            }
            const user = await User.findById(userId);
            if (!user) {
                throw new ApiError(404, 'NOT_FOUND', 'User was not found.');
            }
            if (!hasPermission(actor, 'users.update_status')) {
                throw new ApiError(403, 'FORBIDDEN', 'You do not have permission to perform this action.');
            }
            if (isSuperAdmin(user)) {
                const remaining = await User.countDocuments({ role: 'superadmin', _id: { $ne: user._id } });
                if (remaining < 1) {
                    throw new ApiError(400, 'BAD_REQUEST', 'The last superadmin account cannot be deleted.');
                }
            }
            if (isAdmin(user)) {
                const adminCount = await User.countDocuments({
                    $or: [
                        { role: { $in: ['admin', 'superadmin'] } },
                        { admin: { $in: ['1', 'true', true, 1] } },
                    ],
                });
                if (adminCount <= 1) {
                    throw new ApiError(400, 'BAD_REQUEST', 'The last admin account cannot be deleted.');
                }
            }
            await user.deleteOne();
            return { deleted: true };
        },
    };
}

function storedPermissionsMissing(user) {
    return typeof user.get === 'function' && user.get('permissions') == null;
}

function buildUserFilter(query) {
    const and = [];
    const role = query.role === undefined ? '' : String(query.role).trim();
    const status = query.status === undefined ? '' : String(query.status).trim();
    const q = query.q === undefined ? '' : String(query.q).trim();
    if (role) {
        if (!['customer', 'admin', 'superadmin'].includes(role)) {
            throw new ApiError(400, 'BAD_REQUEST', 'Role filter is not valid.');
        }
        if (role === 'superadmin') {
            and.push({ role: 'superadmin' });
        } else if (role === 'admin') {
            and.push({
                role: { $ne: 'superadmin' },
                $or: [
                    { role: 'admin' },
                    { admin: { $in: ['1', 'true', true, 1] } },
                ],
            });
        } else {
            and.push({
                role: { $nin: ['admin', 'superadmin'] },
                admin: { $nin: ['1', 'true', true, 1] },
            });
        }
    }
    if (status) {
        if (status !== 'active' && status !== 'locked') {
            throw new ApiError(400, 'BAD_REQUEST', 'Status filter is not valid.');
        }
        and.push(status === 'locked'
            ? { status: 'locked' }
            : { $or: [{ status: 'active' }, { status: { $exists: false } }] });
    }
    if (q) {
        if (q.length > 80) {
            throw new ApiError(400, 'BAD_REQUEST', 'Search text must be 80 characters or fewer.');
        }
        const pattern = new RegExp(escapeRegex(q), 'i');
        and.push({
            $or: [
                { name: pattern },
                { email: pattern },
                { username: pattern },
            ],
        });
    }
    return and.length ? { $and: and } : {};
}

module.exports = { createAccountService };
