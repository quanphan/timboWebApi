const assert = require('node:assert/strict');
const { after, before, describe, test } = require('node:test');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const { request, startTestApp, stopTestApp } = require('./support/app');

let context;
let adminToken;
let customerToken;

describe('footer quick links', { concurrency: false }, () => {

before(async () => {
    context = await startTestApp();
    const customer = await request(context.baseUrl, '/api/auth/register', {
        method: 'POST',
        body: { name: 'Buyer', email: 'footer-buyer@example.com', password: 'buyer-password' },
    });
    customerToken = customer.body.data.accessToken;
    await User.create({
        email: 'footer-admin@example.com',
        name: 'Footer Admin',
        password: await bcrypt.hash('footer-admin-pass', 10),
        role: 'admin',
        admin: '1',
    });
    const login = await request(context.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: 'footer-admin@example.com', password: 'footer-admin-pass' },
    });
    adminToken = login.body.data.accessToken;
});

after(async () => {
    await stopTestApp(context);
});

test('admin footer links require authentication', async () => {
    const anonymous = await request(context.baseUrl, '/api/admin/footer-quick-links', {
        method: 'POST',
        body: { url: '/contact', linkType: 'internal', translations: { en: { title: 'Contact' } } },
    });
    const customer = await request(context.baseUrl, '/api/admin/footer-quick-links', {
        method: 'POST',
        token: customerToken,
        body: { url: '/contact', linkType: 'internal', translations: { en: { title: 'Contact' } } },
    });
    assert.equal(anonymous.status, 401);
    assert.equal(customer.status, 403);
});

test('admin CRUD, public active order, and URL validation', async () => {
    const build = await request(context.baseUrl, '/api/admin/footer-quick-links', {
        method: 'POST',
        token: adminToken,
        body: {
            url: '/custom-build',
            linkType: 'internal',
            openInNewTab: true,
            translations: { en: { title: 'Start a custom build' }, vi: { title: 'Bat dau custom build' } },
        },
    });
    const contact = await request(context.baseUrl, '/api/admin/footer-quick-links', {
        method: 'POST',
        token: adminToken,
        body: {
            url: '/contact',
            linkType: 'internal',
            translations: { en: { title: 'Contact' }, vi: { title: 'Lien he' } },
        },
    });
    assert.equal(build.status, 201);
    assert.equal(build.body.data.openInNewTab, false);
    assert.equal(contact.status, 201);

    const hidden = await request(context.baseUrl, '/api/admin/footer-quick-links', {
        method: 'POST',
        token: adminToken,
        body: {
            url: 'https://instagram.com/phanquan',
            linkType: 'external',
            openInNewTab: true,
            isActive: false,
            translations: { en: { title: 'Instagram' } },
        },
    });
    assert.equal(hidden.status, 201);
    assert.equal(hidden.body.data.openInNewTab, true);

    const javascript = await request(context.baseUrl, '/api/admin/footer-quick-links', {
        method: 'POST',
        token: adminToken,
        body: {
            url: 'javascript:alert(1)',
            linkType: 'external',
            translations: { en: { title: 'Bad' } },
        },
    });
    const protocolRelative = await request(context.baseUrl, '/api/admin/footer-quick-links', {
        method: 'POST',
        token: adminToken,
        body: {
            url: '//evil.example',
            linkType: 'internal',
            translations: { en: { title: 'Bad path' } },
        },
    });
    assert.equal(javascript.status, 422);
    assert.equal(protocolRelative.status, 422);

    const publicList = await request(context.baseUrl, '/api/footer-quick-links');
    assert.equal(publicList.status, 200);
    assert.deepEqual(publicList.body.data.map((item) => item.url), ['/custom-build', '/contact']);
    assert.equal(publicList.body.data[0].translations.vi.title, 'Bat dau custom build');

    const reordered = await request(context.baseUrl, '/api/admin/footer-quick-links/reorder', {
        method: 'PATCH',
        token: adminToken,
        body: { ids: [contact.body.data.id, build.body.data.id, hidden.body.data.id] },
    });
    assert.equal(reordered.status, 200);
    const publicAfter = await request(context.baseUrl, '/api/footer-quick-links');
    assert.deepEqual(publicAfter.body.data.map((item) => item.url), ['/contact', '/custom-build']);

    const copied = await request(context.baseUrl, '/api/admin/footer-quick-links', {
        method: 'POST',
        token: adminToken,
        body: {
            url: contact.body.data.url,
            linkType: contact.body.data.linkType,
            translations: contact.body.data.translations,
        },
    });
    assert.equal(copied.status, 201);
    assert.notEqual(copied.body.data.id, contact.body.data.id);

    const deleted = await request(context.baseUrl, `/api/admin/footer-quick-links/${copied.body.data.id}`, {
        method: 'DELETE',
        token: adminToken,
    });
    assert.equal(deleted.status, 200);
});

});
