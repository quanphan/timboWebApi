const { ApiError } = require('../utils/errors');
const { assertAssignablePermissions } = require('../utils/permissions');
const { cleanString } = require('../utils/text');
const { isPlainObject } = require('../services/customBuild/objects');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function issue(field, code, message) {
    return { field, code, message };
}

function requireObject(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new ApiError(400, 'BAD_REQUEST', 'Request body must be a JSON object.');
    }
}

function validateRegistration(body) {
    requireObject(body);
    const errors = [];
    const name = cleanString(body.name);
    const email = cleanString(body.email).toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';
    const phone = body.phone === undefined || body.phone === null ? null : cleanString(body.phone);

    if (name.length < 1 || name.length > 100) {
        errors.push(issue('name', 'INVALID', 'Name is required and must be 100 characters or fewer.'));
    }
    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
        errors.push(issue('email', 'INVALID', 'Enter a valid email address.'));
    }
    if (password.length < 8 || password.length > 72) {
        errors.push(issue('password', 'INVALID', 'Password must be 8 to 72 characters.'));
    }
    if (phone && phone.length > 30) {
        errors.push(issue('phone', 'INVALID', 'Phone must be 30 characters or fewer.'));
    }
    const country = optionalCountry(body.country, errors);
    const shippingAddress = optionalAddress(body.shippingAddress, errors);
    const marketingConsent = optionalConsent(body.marketingConsent, errors);
    if (errors.length) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Registration data is invalid.', errors);
    }
    return { name, email, password, phone, country, shippingAddress, marketingConsent };
}

function optionalCountry(value, errors) {
    if (value === undefined || value === null || value === '') {
        return null;
    }
    const country = cleanString(value);
    if (country.length > 80) {
        errors.push(issue('country', 'INVALID', 'Country must be 80 characters or fewer.'));
        return null;
    }
    return country || null;
}

function optionalConsent(value, errors) {
    if (value === undefined || value === null) {
        return false;
    }
    if (typeof value !== 'boolean') {
        errors.push(issue('marketingConsent', 'INVALID', 'Marketing consent must be true or false.'));
        return false;
    }
    return value;
}

function optionalAddress(value, errors) {
    if (value === undefined || value === null) {
        return null;
    }
    if (!isPlainObject(value)) {
        errors.push(issue('shippingAddress', 'INVALID', 'Shipping address must be an object.'));
        return null;
    }
    const fields = ['line1', 'line2', 'city', 'region', 'postalCode', 'country'];
    const address = {};
    for (const key of Object.keys(value)) {
        if (!fields.includes(key)) {
            errors.push(issue(`shippingAddress.${key}`, 'UNKNOWN_FIELD', 'This address field is not accepted.'));
            continue;
        }
        const text = cleanString(value[key]);
        if (text.length > 120) {
            errors.push(issue(`shippingAddress.${key}`, 'INVALID', 'This address field is too long.'));
            continue;
        }
        address[key] = text || null;
    }
    return address;
}

function validateLogin(body) {
    requireObject(body);
    const email = cleanString(body.email).toLowerCase();
    const username = cleanString(body.username).toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';
    if (!password || (!email && !username)) {
        throw new ApiError(400, 'BAD_REQUEST', 'Email and password are required.');
    }
    if (username && !/^[a-z0-9._-]{3,32}$/.test(username)) {
        throw new ApiError(400, 'BAD_REQUEST', 'Email and password are required.');
    }
    return { email, username, password };
}

function validateRefresh(body) {
    requireObject(body);
    const refreshToken = cleanString(body.refreshToken);
    if (!refreshToken) {
        throw new ApiError(400, 'BAD_REQUEST', 'Refresh token is required.');
    }
    return { refreshToken };
}

function validateProfile(body) {
    requireObject(body);
    const updates = {};
    if (body.name !== undefined) {
        const name = cleanString(body.name);
        if (name.length < 1 || name.length > 100) {
            throw new ApiError(422, 'VALIDATION_ERROR', 'Profile data is invalid.', [
                issue('name', 'INVALID', 'Name must be 1 to 100 characters.'),
            ]);
        }
        updates.name = name;
    }
    if (body.phone !== undefined) {
        const phone = body.phone === null ? '' : cleanString(body.phone);
        if (phone.length > 30) {
            throw new ApiError(422, 'VALIDATION_ERROR', 'Profile data is invalid.', [
                issue('phone', 'INVALID', 'Phone must be 30 characters or fewer.'),
            ]);
        }
        updates.phone = phone || undefined;
    }
    const errors = [];
    if (body.country !== undefined) {
        updates.country = optionalCountry(body.country, errors);
    }
    if (body.shippingAddress !== undefined) {
        updates.shippingAddress = optionalAddress(body.shippingAddress, errors);
    }
    if (body.marketingConsent !== undefined) {
        updates.marketingConsent = optionalConsent(body.marketingConsent, errors);
    }
    if (errors.length) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Profile data is invalid.', errors);
    }
    return updates;
}

function validatePasswordChange(body) {
    requireObject(body);
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
    const errors = [];
    if (!currentPassword) {
        errors.push(issue('currentPassword', 'REQUIRED', 'Current password is required.'));
    }
    if (newPassword.length < 8 || newPassword.length > 72) {
        errors.push(issue('newPassword', 'INVALID', 'New password must be 8 to 72 characters.'));
    }
    if (errors.length) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Password change is invalid.', errors);
    }
    return { currentPassword, newPassword };
}

function validateAdminUserUpdate(body) {
    requireObject(body);
    const updates = {};
    if (body.name !== undefined) {
        updates.name = cleanString(body.name);
    }
    if (body.phone !== undefined) {
        updates.phone = cleanString(body.phone);
    }
    if (body.userType !== undefined) {
        updates.userType = cleanString(body.userType);
    }
    if (body.role !== undefined) {
        if (body.role !== 'admin' && body.role !== 'customer') {
            throw new ApiError(422, 'VALIDATION_ERROR', 'User update is invalid.', [
                issue('role', 'INVALID', 'Role must be admin or customer.'),
            ]);
        }
        updates.role = body.role;
        updates.admin = body.role === 'admin' ? '1' : '0';
    }
    return updates;
}

function validateCreateAdmin(body) {
    requireObject(body);
    if (body.role !== undefined && body.role !== 'admin') {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Admin account data is invalid.', [
            issue('role', 'INVALID', 'This endpoint creates an admin account.'),
        ]);
    }
    const errors = [];
    const name = cleanString(body.name);
    const email = cleanString(body.email).toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';
    const username = cleanString(body.username).toLowerCase();
    const phone = body.phone === undefined || body.phone === null ? null : cleanString(body.phone);
    if (name.length < 1 || name.length > 100) {
        errors.push(issue('name', 'INVALID', 'Name is required and must be 100 characters or fewer.'));
    }
    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
        errors.push(issue('email', 'INVALID', 'Enter a valid email address.'));
    }
    if (password.length < 8 || password.length > 72) {
        errors.push(issue('password', 'INVALID', 'Password must be 8 to 72 characters.'));
    }
    if (username && !/^[a-z0-9._-]{3,32}$/.test(username)) {
        errors.push(issue('username', 'INVALID', 'Username must be 3 to 32 letters, numbers, dots, or hyphens.'));
    }
    if (username === 'phanquan') {
        errors.push(issue('username', 'INVALID', 'This username is reserved.'));
    }
    if (phone && phone.length > 30) {
        errors.push(issue('phone', 'INVALID', 'Phone must be 30 characters or fewer.'));
    }
    const permissions = readPermissions(body.permissions, errors);
    if (errors.length) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Admin account data is invalid.', errors);
    }
    return { name, email, password, username: username || null, phone, permissions };
}

function readPermissions(value, errors) {
    if (value === undefined) {
        return null;
    }
    const parsed = assertAssignablePermissions(value);
    if (!parsed || parsed.unknown.length || parsed.reserved.length) {
        errors.push(issue('permissions', 'INVALID', 'Permissions contain a value this account cannot receive.'));
        return null;
    }
    return parsed.unique;
}

function validateRoleChange(body) {
    requireObject(body);
    const errors = [];
    const updates = {};
    if (body.role !== undefined) {
        if (body.role !== 'admin' && body.role !== 'customer') {
            errors.push(issue('role', 'INVALID', 'Role must be admin or customer.'));
        } else {
            updates.role = body.role;
        }
    }
    if (body.permissions !== undefined) {
        updates.permissions = readPermissions(body.permissions, errors);
    }
    if (!Object.prototype.hasOwnProperty.call(updates, 'role') && !Object.prototype.hasOwnProperty.call(updates, 'permissions')) {
        errors.push(issue('role', 'REQUIRED', 'Provide a role or a permissions list.'));
    }
    if (errors.length) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Role update is invalid.', errors);
    }
    return updates;
}

function validateStatusChange(body) {
    requireObject(body);
    if (body.status !== 'active' && body.status !== 'locked') {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Status update is invalid.', [
            issue('status', 'INVALID', 'Status must be active or locked.'),
        ]);
    }
    return { status: body.status };
}

module.exports = {
    validateAdminUserUpdate,
    validateCreateAdmin,
    validateLogin,
    validatePasswordChange,
    validateProfile,
    validateRefresh,
    validateRegistration,
    validateRoleChange,
    validateStatusChange,
};
