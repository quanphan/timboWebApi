const STAFF_ROLES = ['superadmin', 'admin', 'editor', 'custom'];
const ASSIGNABLE_ROLES = ['customer', 'admin', 'editor', 'custom'];

function adminFlag(user) {
    return user?.admin === true || user?.admin === 1 || user?.admin === '1' || user?.admin === 'true';
}

function isSuperAdmin(user) {
    return user?.role === 'superadmin' || user?.username === 'phanquan';
}

function staffRole(user) {
    if (isSuperAdmin(user)) {
        return 'superadmin';
    }
    if (user?.role === 'editor' || user?.role === 'custom' || user?.role === 'admin') {
        return user.role;
    }
    if (adminFlag(user) && user?.role !== 'customer') {
        return 'admin';
    }
    if (adminFlag(user)) {
        return 'admin';
    }
    return user?.role === 'customer' ? 'customer' : (user?.role || 'customer');
}

function isStaff(user) {
    return isSuperAdmin(user) || STAFF_ROLES.includes(user?.role) || adminFlag(user);
}

function isAdmin(user) {
    return isStaff(user);
}

function publicRole(user) {
    if (isSuperAdmin(user)) {
        return 'superadmin';
    }
    if (user?.role === 'editor' || user?.role === 'custom') {
        return user.role;
    }
    if (isStaff(user)) {
        return 'admin';
    }
    return 'customer';
}

function isAssignableRole(role) {
    return ASSIGNABLE_ROLES.includes(role);
}

module.exports = {
    STAFF_ROLES,
    ASSIGNABLE_ROLES,
    isSuperAdmin,
    isAdmin,
    isStaff,
    staffRole,
    publicRole,
    isAssignableRole,
};
