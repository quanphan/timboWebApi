const { isAdmin, isSuperAdmin } = require('./roles');

const PERMISSIONS = [
    'users.read',
    'users.create_admin',
    'users.update_role',
    'users.update_status',
    'inquiries.read',
    'inquiries.update_status',
    'inquiries.delete',
    'catalog.read',
    'catalog.write',
    'catalog.delete',
    'uploads.write',
];

const SUPERADMIN_ONLY = [
    'users.create_admin',
    'users.update_role',
    'users.update_status',
];

const ADMIN_ASSIGNABLE = PERMISSIONS.filter((permission) => !SUPERADMIN_ONLY.includes(permission));

const DEFAULT_ADMIN_PERMISSIONS = [...ADMIN_ASSIGNABLE];

function storedPermissions(user) {
    if (!user) {
        return null;
    }
    if (typeof user.get === 'function' && user.get('permissions') == null) {
        return null;
    }
    return Array.isArray(user.permissions) ? user.permissions : null;
}

function effectivePermissions(user) {
    if (!user || user.status === 'locked') {
        return [];
    }
    if (isSuperAdmin(user)) {
        return [...PERMISSIONS];
    }
    if (!isAdmin(user)) {
        return [];
    }
    const stored = storedPermissions(user);
    if (stored == null) {
        return [...DEFAULT_ADMIN_PERMISSIONS];
    }
    return stored.filter((permission) => ADMIN_ASSIGNABLE.includes(permission));
}

function hasPermission(user, permission) {
    return effectivePermissions(user).includes(permission);
}

function assertAssignablePermissions(permissions) {
    if (!Array.isArray(permissions)) {
        return null;
    }
    const unique = [...new Set(permissions)];
    const reserved = unique.filter((permission) => SUPERADMIN_ONLY.includes(permission));
    const unknown = unique.filter((permission) => !PERMISSIONS.includes(permission));
    return { unique, reserved, unknown };
}

module.exports = {
    ADMIN_ASSIGNABLE,
    DEFAULT_ADMIN_PERMISSIONS,
    PERMISSIONS,
    SUPERADMIN_ONLY,
    assertAssignablePermissions,
    effectivePermissions,
    hasPermission,
};
