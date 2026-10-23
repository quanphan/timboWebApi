const assert = require('node:assert/strict');
const { after, before, describe, test } = require('node:test');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const { createAuthService } = require('../services/authService');
const { request, startTestApp, stopTestApp } = require('./support/app');

let context;
let superToken;
let adminToken;
let adminId;

describe('access control', { concurrency: false }, () => {

before(async () => {
    context = await startTestApp();
    await User.create({
        username: 'phanquan',
        email: 'super@example.com',
        name: 'Phan Quan',
        password: await bcrypt.hash('super-admin-pass', 10),
        role: 'superadmin',
        admin: '0',
    });
    const admin = await User.create({
        email: 'limited-admin@example.com',
        name: 'Limited Admin',
        password: await bcrypt.hash('limited-admin-pass', 10),
        role: 'admin',
        admin: '1',
    });
    adminId = String(admin._id);
    const superLogin = await request(context.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { username: 'phanquan', password: 'super-admin-pass' },
    });
    const adminLogin = await request(context.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: 'limited-admin@example.com', password: 'limited-admin-pass' },
    });
    superToken = superLogin.body.data.accessToken;
    adminToken = adminLogin.body.data.accessToken;
});

after(async () => {
    await stopTestApp(context);
});

test('customer registration and login hide secrets and reject invalid input', async () => {
    const invalid = await request(context.baseUrl, '/api/auth/register', {
        method: 'POST',
        body: { name: 'A', email: 'not-an-email', password: 'short', role: 'superadmin' },
    });
    assert.equal(invalid.status, 422);
    assert.equal(invalid.body.error.code, 'VALIDATION_ERROR');

    const created = await request(context.baseUrl, '/api/auth/register', {
        method: 'POST',
        body: {
            name: 'Mai Nguyen',
            email: 'mai.access@example.com',
            password: 'customer-pass',
            phone: '0901234567',
            country: 'Vietnam',
            marketingConsent: true,
            role: 'admin',
            permissions: ['users.create_admin'],
            status: 'active',
        },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.user.role, 'customer');
    assert.equal(created.body.data.user.emailVerified, false);
    assert.equal(created.body.data.user.country, 'Vietnam');
    assert.deepEqual(created.body.data.user.permissions, []);
    assert.equal(JSON.stringify(created.body).includes('customer-pass'), false);
    assert.equal(JSON.stringify(created.body).includes('$2'), false);

    const login = await request(context.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: 'mai.access@example.com', password: 'customer-pass' },
    });
    assert.equal(login.status, 200);
    const token = login.body.data.accessToken;
    const profile = await request(context.baseUrl, '/api/account/me', {
        method: 'PUT',
        token,
        body: {
            name: 'Mai N.',
            shippingAddress: { city: 'Hue', country: 'Vietnam' },
            role: 'superadmin',
        },
    });
    assert.equal(profile.status, 200);
    assert.equal(profile.body.data.name, 'Mai N.');
    assert.equal(profile.body.data.role, 'customer');
    assert.equal(profile.body.data.shippingAddress.city, 'Hue');

    const users = await request(context.baseUrl, '/api/admin/users', { token });
    const createAdmin = await request(context.baseUrl, '/api/admin/users/admins', {
        method: 'POST',
        token,
        body: { name: 'Nope', email: 'nope@example.com', password: 'customer-pass' },
    });
    assert.equal(users.status, 403);
    assert.equal(createAdmin.status, 403);
});

test('an admin cannot create a superadmin or change privileged access', async () => {
    const listed = await request(context.baseUrl, '/api/admin/users?q=limited-admin', { token: adminToken });
    assert.equal(listed.status, 200);
    assert.equal(listed.body.data.some((user) => user.email === 'limited-admin@example.com'), true);
    assert.equal(JSON.stringify(listed.body).includes('$2'), false);

    const created = await request(context.baseUrl, '/api/admin/users/admins', {
        method: 'POST',
        token: adminToken,
        body: {
            name: 'Second Admin',
            email: 'second-admin@example.com',
            password: 'second-admin-pass',
            role: 'superadmin',
        },
    });
    assert.equal(created.status, 403);

    const promote = await request(context.baseUrl, `/api/admin/users/${adminId}/role`, {
        method: 'PATCH',
        token: adminToken,
        body: { role: 'superadmin', permissions: ['users.create_admin'] },
    });
    assert.equal(promote.status, 403);
    const stored = await User.findById(adminId);
    assert.equal(stored.role, 'admin');
});

test('superadmin creates an admin, changes role, and locks the account', async () => {
    const created = await request(context.baseUrl, '/api/admin/users/admins', {
        method: 'POST',
        token: superToken,
        body: {
            name: 'Workshop Admin',
            email: 'workshop-admin@example.com',
            username: 'workshop',
            password: 'workshop-admin-pass',
            permissions: ['users.read', 'inquiries.read'],
        },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.role, 'admin');
    assert.equal(created.body.data.permissions.includes('users.create_admin'), false);
    assert.equal(created.body.data.permissions.includes('inquiries.read'), true);
    const newAdminId = created.body.data.id;
    const detail = await request(context.baseUrl, `/api/admin/users/${newAdminId}`, { token: superToken });
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.username, 'workshop');

    const reserved = await request(context.baseUrl, `/api/admin/users/${newAdminId}/role`, {
        method: 'PATCH',
        token: superToken,
        body: { permissions: ['users.create_admin'] },
    });
    assert.equal(reserved.status, 422);

    const demoted = await request(context.baseUrl, `/api/admin/users/${newAdminId}/role`, {
        method: 'PATCH',
        token: superToken,
        body: { role: 'customer' },
    });
    assert.equal(demoted.status, 200);
    assert.equal(demoted.body.data.role, 'customer');

    const restored = await request(context.baseUrl, `/api/admin/users/${newAdminId}/role`, {
        method: 'PATCH',
        token: superToken,
        body: { role: 'admin', permissions: ['inquiries.read'] },
    });
    assert.equal(restored.status, 200);
    const narrowedLogin = await request(context.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: 'workshop-admin@example.com', password: 'workshop-admin-pass' },
    });
    const narrowedToken = narrowedLogin.body.data.accessToken;
    const deniedUsers = await request(context.baseUrl, '/api/admin/users', { token: narrowedToken });
    const allowedInquiries = await request(context.baseUrl, '/api/admin/custom-build/inquiries', { token: narrowedToken });
    assert.equal(deniedUsers.status, 403);
    assert.equal(allowedInquiries.status, 200);

    const locked = await request(context.baseUrl, `/api/admin/users/${newAdminId}/status`, {
        method: 'PATCH',
        token: superToken,
        body: { status: 'locked' },
    });
    assert.equal(locked.status, 200);
    assert.equal(locked.body.data.status, 'locked');
    const lockedLogin = await request(context.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: 'workshop-admin@example.com', password: 'workshop-admin-pass' },
    });
    assert.equal(lockedLogin.status, 403);
    assert.equal(lockedLogin.body.error.code, 'ACCOUNT_LOCKED');
    const stale = await request(context.baseUrl, '/api/admin/custom-build/inquiries', { token: narrowedToken });
    assert.equal(stale.status, 403);
    assert.equal(stale.body.error.code, 'ACCOUNT_LOCKED');

    const lockSuper = await request(context.baseUrl, '/api/admin/users?role=superadmin', { token: superToken });
    const superId = lockSuper.body.data[0].id;
    const cannotLock = await request(context.baseUrl, `/api/admin/users/${superId}/status`, {
        method: 'PATCH',
        token: superToken,
        body: { status: 'locked' },
    });
    assert.equal(cannotLock.status, 403);
});

test('google login verifies identity and does not grant admin access', async () => {
    const axios = require('axios');
    const { mock } = require('node:test');
    await User.create({
        email: 'unverified-link@example.com',
        name: 'Existing Customer',
        password: await bcrypt.hash('customer-pass', 10),
        role: 'customer',
        admin: '0',
        emailVerified: false,
    });

    mock.method(axios, 'get', async () => ({
        data: {
            aud: 'test-google-client-id',
            email: 'unverified-link@example.com',
            email_verified: 'false',
            name: 'phanquan',
            sub: 'google-unverified',
        },
    }));
    try {
        const rejected = await request(context.baseUrl, '/api/auth/google', {
            method: 'POST',
            body: { credential: 'unverified-token' },
        });
        assert.equal(rejected.status, 401);
        const stored = await User.findOne({ email: 'unverified-link@example.com' });
        assert.equal(stored.googleId, undefined);
        assert.equal(stored.role, 'customer');
    } finally {
        mock.restoreAll();
    }

    mock.method(axios, 'get', async () => ({
        data: {
            aud: 'test-google-client-id',
            email: 'google-customer@example.com',
            email_verified: 'true',
            name: 'phanquan',
            sub: 'google-customer-sub',
        },
    }));
    try {
        const accepted = await request(context.baseUrl, '/api/auth/google', {
            method: 'POST',
            body: { credential: 'verified-token' },
        });
        assert.equal(accepted.status, 200);
        assert.equal(accepted.body.data.user.role, 'customer');
        assert.equal(accepted.body.data.user.permissions.includes('users.create_admin'), false);
        const created = await User.findOne({ email: 'google-customer@example.com' });
        assert.equal(created.role, 'customer');
        assert.equal(created.emailVerified, true);
    } finally {
        mock.restoreAll();
    }

    const unconfigured = createAuthService({ googleClientId: '' });
    await assert.rejects(
        () => unconfigured.googleLogin({ credential: 'verified-token' }),
        (error) => error.status === 503 && error.code === 'SERVICE_UNAVAILABLE',
    );
});

});
