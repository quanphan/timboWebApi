function isSuperAdmin(user) {
    return Boolean(user) && user.role === 'superadmin';
}

function isAdmin(user) {
    if (!user) {
        return false;
    }
    if (user.role === 'admin' || user.role === 'superadmin') {
        return true;
    }
    const flag = user.admin;
    return flag === true || flag === 1 || flag === '1' || flag === 'true';
}

function publicRole(user) {
    if (isSuperAdmin(user)) {
        return 'superadmin';
    }
    return isAdmin(user) ? 'admin' : 'customer';
}

module.exports = { isAdmin, isSuperAdmin, publicRole };
