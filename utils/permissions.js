const { isStaff, isSuperAdmin, staffRole } = require('./roles');

const PERMISSION_GROUPS = [
    {
        id: 'users',
        keys: ['users.read', 'users.create', 'users.update', 'users.delete'],
    },
    {
        id: 'catalog',
        keys: ['catalog.read', 'catalog.create', 'catalog.update', 'catalog.delete'],
    },
    {
        id: 'customBuild',
        keys: ['customBuild.read', 'customBuild.manage_options'],
    },
    {
        id: 'enquiry',
        keys: ['inquiries.read', 'inquiries.update_status', 'inquiries.delete'],
    },
    {
        id: 'messages',
        keys: ['messages.read', 'messages.update', 'messages.delete'],
    },
    {
        id: 'brand',
        keys: ['brand.read', 'brand.update'],
    },
    {
        id: 'footerLinks',
        keys: ['footerLinks.read', 'footerLinks.create', 'footerLinks.update', 'footerLinks.delete'],
    },
    {
        id: 'pages',
        keys: ['pages.read', 'pages.update', 'pages.publish'],
    },
    {
        id: 'services',
        keys: ['services.read', 'services.create', 'services.update', 'services.delete'],
    },
    {
        id: 'uploads',
        keys: ['uploads.upload', 'uploads.delete'],
    },
    {
        id: 'roles',
        keys: ['roles.read', 'roles.update'],
    },
];

const LEGACY_PERMISSIONS = [
    'users.create_admin',
    'users.update_role',
    'users.update_status',
    'catalog.write',
    'uploads.write',
];

const CANONICAL_PERMISSIONS = PERMISSION_GROUPS.flatMap((group) => group.keys);

const PERMISSIONS = [...new Set([...CANONICAL_PERMISSIONS, ...LEGACY_PERMISSIONS])];

const SUPERADMIN_ONLY = [
    'users.create',
    'users.create_admin',
    'users.update',
    'users.update_status',
    'users.delete',
    'roles.read',
    'roles.update',
    'users.update_role',
];

const EXPAND = {
    'catalog.write': ['catalog.create', 'catalog.update'],
    'catalog.create': ['catalog.write'],
    'catalog.update': ['catalog.write'],
    'users.create_admin': ['users.create'],
    'users.create': ['users.create_admin'],
    'users.update_status': ['users.update'],
    'users.update': ['users.update_status'],
    'users.update_role': ['roles.update'],
    'roles.update': ['users.update_role'],
    'uploads.write': ['uploads.upload'],
    'uploads.upload': ['uploads.write'],
};

const SATISFIED_BY = {
    'catalog.create': ['catalog.create', 'catalog.write'],
    'catalog.update': ['catalog.update', 'catalog.write'],
    'catalog.write': ['catalog.write', 'catalog.create', 'catalog.update'],
    'users.create': ['users.create', 'users.create_admin'],
    'users.create_admin': ['users.create_admin', 'users.create'],
    'users.update': ['users.update', 'users.update_status'],
    'users.update_status': ['users.update_status', 'users.update'],
    'users.delete': ['users.delete', 'users.update_status'],
    'roles.update': ['roles.update', 'users.update_role'],
    'users.update_role': ['users.update_role', 'roles.update'],
    'roles.read': ['roles.read', 'users.update_role', 'users.read'],
    'uploads.upload': ['uploads.upload', 'uploads.write'],
    'uploads.write': ['uploads.write', 'uploads.upload'],
    'uploads.delete': ['uploads.delete', 'uploads.write'],
    'services.read': ['services.read', 'catalog.read'],
    'services.create': ['services.create', 'catalog.write', 'catalog.create'],
    'services.update': ['services.update', 'catalog.write', 'catalog.update'],
    'services.delete': ['services.delete', 'catalog.delete'],
    'customBuild.read': ['customBuild.read', 'catalog.read'],
    'customBuild.manage_options': ['customBuild.manage_options', 'catalog.write', 'catalog.create', 'catalog.update', 'catalog.delete'],
};

const LEGACY_ADMIN_IMPLICIT = [
    'messages.read',
    'messages.update',
    'messages.delete',
    'brand.read',
    'brand.update',
    'footerLinks.read',
    'footerLinks.create',
    'footerLinks.update',
    'footerLinks.delete',
    'pages.read',
    'pages.update',
    'pages.publish',
];

const ADMIN_ASSIGNABLE = PERMISSIONS.filter((permission) => !SUPERADMIN_ONLY.includes(permission));

const EDITOR_PERMISSIONS = [
    'catalog.read',
    'catalog.create',
    'catalog.update',
    'catalog.write',
    'customBuild.read',
    'customBuild.manage_options',
    'inquiries.read',
    'messages.read',
    'messages.update',
    'brand.read',
    'brand.update',
    'footerLinks.read',
    'footerLinks.create',
    'footerLinks.update',
    'pages.read',
    'pages.update',
    'pages.publish',
    'services.read',
    'services.create',
    'services.update',
    'uploads.upload',
    'uploads.write',
];

const DEFAULT_ADMIN_PERMISSIONS = ADMIN_ASSIGNABLE.filter((permission) => (
    permission.startsWith('users.')
    || permission.startsWith('inquiries.')
    || permission.startsWith('catalog.')
    || permission.startsWith('uploads.')
    || permission.startsWith('messages.')
    || permission.startsWith('brand.')
    || permission.startsWith('footerLinks.')
    || permission.startsWith('pages.')
    || permission.startsWith('services.')
    || permission.startsWith('customBuild.')
));

const ROLE_PRESETS = {
    customer: [],
    editor: EDITOR_PERMISSIONS,
    admin: DEFAULT_ADMIN_PERMISSIONS,
    custom: null,
    superadmin: PERMISSIONS,
};

function storedPermissions(user) {
    if (!user || !Array.isArray(user.permissions)) {
        return null;
    }
    return user.permissions;
}

function expandGranted(keys) {
    const granted = new Set();
    for (const key of keys) {
        if (PERMISSIONS.includes(key)) {
            granted.add(key);
        }
        for (const extra of EXPAND[key] || []) {
            if (PERMISSIONS.includes(extra)) {
                granted.add(extra);
            }
        }
    }
    return PERMISSIONS.filter((permission) => granted.has(permission));
}

function knownAssignable(keys) {
    return keys.filter((permission) => ADMIN_ASSIGNABLE.includes(permission));
}

function effectivePermissions(user) {
    if (isSuperAdmin(user)) {
        return [...PERMISSIONS];
    }
    if (!isStaff(user)) {
        return [];
    }
    const role = staffRole(user);
    const stored = storedPermissions(user);
    let base;
    if (stored == null) {
        if (role === 'editor') {
            base = [...EDITOR_PERMISSIONS];
        } else if (role === 'custom') {
            base = [];
        } else {
            base = [...DEFAULT_ADMIN_PERMISSIONS];
        }
    } else if (role === 'custom') {
        base = stored.filter((permission) => PERMISSIONS.includes(permission));
    } else {
        base = knownAssignable(stored);
    }
    if (role === 'admin') {
        base = [...new Set([...base, ...LEGACY_ADMIN_IMPLICIT])];
    }
    return expandGranted(base);
}

function hasPermission(user, permission) {
    const granted = new Set(effectivePermissions(user));
    const options = SATISFIED_BY[permission] || [permission];
    return options.some((item) => granted.has(item));
}

function assertAssignablePermissions(value) {
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
        return null;
    }
    const unique = [...new Set(value)];
    return {
        unique,
        unknown: unique.filter((item) => !PERMISSIONS.includes(item)),
        reserved: unique.filter((item) => SUPERADMIN_ONLY.includes(item)),
    };
}

function filterAssignableToActor(permissions, actor) {
    const parsed = assertAssignablePermissions(permissions);
    if (!parsed || parsed.unknown.length) {
        return null;
    }
    if (isSuperAdmin(actor)) {
        return parsed.unique;
    }
    if (parsed.reserved.length) {
        return null;
    }
    return parsed.unique.filter((permission) => hasPermission(actor, permission));
}

function presetForRole(role) {
    if (role === 'editor') return [...EDITOR_PERMISSIONS];
    if (role === 'admin') return [...DEFAULT_ADMIN_PERMISSIONS];
    if (role === 'customer') return [];
    return null;
}

module.exports = {
    PERMISSIONS,
    PERMISSION_GROUPS,
    CANONICAL_PERMISSIONS,
    SUPERADMIN_ONLY,
    ADMIN_ASSIGNABLE,
    DEFAULT_ADMIN_PERMISSIONS,
    EDITOR_PERMISSIONS,
    ROLE_PRESETS,
    effectivePermissions,
    hasPermission,
    assertAssignablePermissions,
    filterAssignableToActor,
    presetForRole,
    expandGranted,
};
