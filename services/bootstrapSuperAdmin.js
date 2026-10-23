const bcrypt = require('bcrypt');
const User = require('../models/User');

const USERNAME = 'phanquan';
const DEFAULT_EMAIL = 'phanquan@users.local';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function bootstrapSuperAdmin({
    password,
    email = DEFAULT_EMAIL,
} = {}) {
    if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
        throw new Error('ADMIN_INITIAL_PASSWORD must be 8 to 72 characters.');
    }
    const normalizedEmail = String(email || DEFAULT_EMAIL).trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalizedEmail) || normalizedEmail.length > 254) {
        throw new Error('ADMIN_INITIAL_EMAIL must be a valid email address.');
    }

    const byUsername = await User.find({ username: USERNAME });
    const byEmail = await User.find({ email: normalizedEmail });
    if (byUsername.length > 1 || byEmail.length > 1) {
        throw new Error('The superadmin target is ambiguous. No account was changed.');
    }

    const existing = byUsername[0] || null;
    const emailOwner = byEmail[0] || null;
    if (emailOwner && (!existing || String(emailOwner._id) !== String(existing._id))) {
        const error = new Error('ADMIN_INITIAL_EMAIL already belongs to another account.');
        error.code = 'ADMIN_EMAIL_CONFLICT';
        throw error;
    }

    if (existing) {
        const passwordHash = existing.password;
        let changed = false;
        if (existing.role !== 'superadmin') {
            existing.role = 'superadmin';
            changed = true;
        }
        if (existing.email !== normalizedEmail) {
            existing.email = normalizedEmail;
            changed = true;
        }
        if (changed) {
            await existing.save();
        }
        if (existing.password !== passwordHash) {
            throw new Error('Existing password protection failed. No password was replaced.');
        }
        return {
            created: false,
            skipped: !changed,
            promoted: changed,
            username: USERNAME,
        };
    }

    await User.create({
        username: USERNAME,
        email: normalizedEmail,
        name: 'PhanQuan',
        password: await bcrypt.hash(password, 10),
        role: 'superadmin',
        admin: '0',
    });
    return { created: true, skipped: false, promoted: false, username: USERNAME };
}

module.exports = { DEFAULT_EMAIL, USERNAME, bootstrapSuperAdmin };
