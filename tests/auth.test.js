const assert = require('node:assert/strict');
const { after, before, describe, test } = require('node:test');
const User = require('../models/User');
const { request, startTestApp, stopTestApp } = require('./support/app');

let context;

describe('auth', { concurrency: false }, () => {

before(async () => {
    context = await startTestApp();
});

after(async () => {
    await stopTestApp(context);
});

async function register(email = 'maker@example.com') {
    const response = await request(context.baseUrl, '/api/auth/register', {
        method: 'POST',
        body: {
            name: 'Mai Nguyen',
            email,
            password: 'workshop-pass',
            phone: '0901234567',
            role: 'admin',
            passwordHash: 'injected',
        },
    });
    assert.equal(response.status, 201);
    return response.body.data;
}

test('registration ignores privileged fields and does not return a password', async () => {
    const data = await register();
    assert.equal(data.user.role, 'customer');
    assert.equal(data.user.email, 'maker@example.com');
    assert.equal(data.user.password, undefined);
    assert.equal(typeof data.accessToken, 'string');
    assert.equal(typeof data.refreshToken, 'string');
    const stored = await User.findOne({ email: 'maker@example.com' });
    assert.notEqual(stored.password, 'workshop-pass');
    assert.equal(stored.password.startsWith('$2'), true);
});

test('login, profile update, and password change keep authorization on the server', async () => {
    const loggedIn = await request(context.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: 'maker@example.com', password: 'workshop-pass' },
    });
    assert.equal(loggedIn.status, 200);
    const token = loggedIn.body.data.accessToken;

    const forbidden = await request(context.baseUrl, '/api/admin/users');
    assert.equal(forbidden.status, 401);

    const customerList = await request(context.baseUrl, '/api/admin/users', { token });
    assert.equal(customerList.status, 403);

    const profile = await request(context.baseUrl, '/api/account/me', {
        method: 'PUT',
        token,
        body: { name: 'Mai N.', role: 'admin', password: 'new-secret-pass' },
    });
    assert.equal(profile.status, 200);
    assert.equal(profile.body.data.name, 'Mai N.');
    assert.equal(profile.body.data.role, 'customer');

    const password = await request(context.baseUrl, '/api/account/password', {
        method: 'PUT',
        token,
        body: { currentPassword: 'workshop-pass', newPassword: 'new-secret-pass' },
    });
    assert.equal(password.status, 200);

    const oldLogin = await request(context.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: 'maker@example.com', password: 'workshop-pass' },
    });
    assert.equal(oldLogin.status, 401);

    const newLogin = await request(context.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: 'maker@example.com', password: 'new-secret-pass' },
    });
    assert.equal(newLogin.status, 200);
});

test('refresh rotates the token and logout revokes it', async () => {
    const registered = await register('refresh@example.com');
    const refreshed = await request(context.baseUrl, '/api/auth/refresh', {
        method: 'POST',
        body: { refreshToken: registered.refreshToken },
    });
    assert.equal(refreshed.status, 200);
    assert.notEqual(refreshed.body.data.refreshToken, registered.refreshToken);

    const reuse = await request(context.baseUrl, '/api/auth/refresh', {
        method: 'POST',
        body: { refreshToken: registered.refreshToken },
    });
    assert.equal(reuse.status, 401);

    const logout = await request(context.baseUrl, '/api/auth/logout', {
        method: 'POST',
        body: { refreshToken: refreshed.body.data.refreshToken },
    });
    assert.equal(logout.status, 200);
    const afterLogout = await request(context.baseUrl, '/api/auth/refresh', {
        method: 'POST',
        body: { refreshToken: refreshed.body.data.refreshToken },
    });
    assert.equal(afterLogout.status, 401);
});

test('an admin can list users and a customer cannot', async () => {
    const bcrypt = require('bcrypt');
    await User.create({
        email: 'admin@example.com',
        name: 'Shop Admin',
        password: await bcrypt.hash('admin-password', 10),
        role: 'admin',
        admin: '1',
    });
    const login = await request(context.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: 'admin@example.com', password: 'admin-password' },
    });
    assert.equal(login.status, 200);
    const users = await request(context.baseUrl, '/api/admin/users', {
        token: login.body.data.accessToken,
    });
    assert.equal(users.status, 200);
    assert.equal(users.body.success, true);
    assert.equal(JSON.stringify(users.body).includes('admin-password'), false);
    assert.equal(JSON.stringify(users.body).includes('$2'), false);
});

test('google login stays a customer when the profile name matches an admin username', async () => {
    const axios = require('axios');
    const { mock } = require('node:test');
    const { createAuthService } = require('../services/authService');
    mock.method(axios, 'get', async () => ({
        data: {
            aud: 'test-google-client-id',
            email: 'named-phanquan@example.com',
            email_verified: 'true',
            name: 'phanquan',
            sub: 'google-sub-phanquan',
        },
    }));
    try {
        const response = await request(context.baseUrl, '/api/auth/google', {
            method: 'POST',
            body: { credential: 'signed-token' },
        });
        assert.equal(response.status, 200);
        assert.equal(response.body.data.user.role, 'customer');
        const stored = await User.findOne({ email: 'named-phanquan@example.com' });
        assert.equal(stored.role, 'customer');
        assert.equal(stored.admin, '0');
        assert.notEqual(stored.username, 'phanquan');

        const unconfigured = createAuthService({ googleClientId: '' });
        await assert.rejects(
            () => unconfigured.googleLogin({ credential: 'signed-token' }),
            (error) => error.status === 503,
        );
    } finally {
        mock.restoreAll();
    }

    mock.method(axios, 'get', async () => ({
        data: {
            aud: 'wrong-client',
            email: 'wrong-audience@example.com',
            email_verified: 'true',
            name: 'phanquan',
            sub: 'google-sub-wrong',
        },
    }));
    try {
        const rejected = await request(context.baseUrl, '/api/auth/google', {
            method: 'POST',
            body: { credential: 'wrong-audience' },
        });
        assert.equal(rejected.status, 401);
        assert.equal(await User.countDocuments({ email: 'wrong-audience@example.com' }), 0);
    } finally {
        mock.restoreAll();
    }
});

});
