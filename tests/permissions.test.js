const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const {
    DEFAULT_ADMIN_PERMISSIONS,
    EDITOR_PERMISSIONS,
    effectivePermissions,
    hasPermission,
    SUPERADMIN_ONLY,
} = require('../utils/permissions');
const { isAdmin, publicRole } = require('../utils/roles');

describe('permission model', () => {
    test('legacy catalog.write still grants catalog create and update', () => {
        const user = { role: 'custom', admin: '1', permissions: ['catalog.write'] };
        assert.equal(hasPermission(user, 'catalog.create'), true);
        assert.equal(hasPermission(user, 'catalog.update'), true);
        assert.equal(hasPermission(user, 'catalog.delete'), false);
        assert.equal(hasPermission(user, 'users.read'), false);
    });

    test('admin without stored permissions keeps previous implicit modules', () => {
        const user = { role: 'admin', admin: '1' };
        assert.equal(hasPermission(user, 'messages.read'), true);
        assert.equal(hasPermission(user, 'brand.update'), true);
        assert.equal(hasPermission(user, 'pages.publish'), true);
        assert.equal(hasPermission(user, 'footerLinks.create'), true);
        assert.equal(hasPermission(user, 'users.create_admin'), false);
        assert.equal(hasPermission(user, 'roles.update'), false);
        assert.equal(SUPERADMIN_ONLY.includes('roles.update'), true);
        assert.equal(DEFAULT_ADMIN_PERMISSIONS.includes('users.read'), true);
    });

    test('editor is staff but does not receive superadmin-only keys', () => {
        const user = { role: 'editor', admin: '1', permissions: [...EDITOR_PERMISSIONS] };
        assert.equal(isAdmin(user), true);
        assert.equal(publicRole(user), 'editor');
        assert.equal(hasPermission(user, 'pages.update'), true);
        assert.equal(hasPermission(user, 'catalog.read'), true);
        assert.equal(hasPermission(user, 'users.create'), false);
        assert.equal(hasPermission(user, 'roles.update'), false);
    });

    test('custom role uses only stored assignable permissions', () => {
        const user = { role: 'custom', admin: '1', permissions: ['messages.read'] };
        assert.equal(hasPermission(user, 'messages.read'), true);
        assert.equal(hasPermission(user, 'messages.delete'), false);
        assert.equal(hasPermission(user, 'brand.read'), false);
        assert.equal(effectivePermissions(user).includes('users.create_admin'), false);
    });

    test('customer never receives staff permissions', () => {
        const user = { role: 'customer', permissions: ['users.read', 'roles.update'] };
        assert.equal(hasPermission(user, 'users.read'), false);
        assert.equal(isAdmin(user), false);
        assert.equal(publicRole(user), 'customer');
    });
});
