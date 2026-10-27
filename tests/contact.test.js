const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const bcrypt = require('bcrypt');
const Message = require('../models/Message');
const User = require('../models/User');
const { request, startTestApp, stopTestApp } = require('./support/app');

let context;
let adminToken;

before(async () => {
    context = await startTestApp();
    await User.create({
        email: 'contact-admin@example.com',
        name: 'Contact Admin',
        password: await bcrypt.hash('contact-admin-pass', 10),
        role: 'admin',
        admin: '1',
    });
    const login = await request(context.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: 'contact-admin@example.com', password: 'contact-admin-pass' },
    });
    adminToken = login.body.data.accessToken;
});

after(async () => {
    await stopTestApp(context);
});

test('POST /api/contact stores an inquiry in MongoDB and returns a reference', async () => {
    const response = await request(context.baseUrl, '/api/contact', {
        method: 'POST',
        body: {
            name: 'Lan Pham',
            email: 'lan@example.com',
            inquiryType: 'ready-stock',
            subject: 'In-stock bass',
            message: 'Is this still available?',
            productId: 'prod_88',
            productRef: 'PQ Headless Bass',
            estimatedPrice: 999,
        },
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.received, true);
    assert.equal(typeof response.body.data.id, 'string');
    assert.equal(JSON.stringify(response.body).includes('lan@example.com'), false);

    const stored = await Message.findById(response.body.data.id);
    assert.equal(stored.email, 'lan@example.com');
    assert.equal(stored.inquiryType, 'ready-stock');
    assert.equal(stored.productId, 'prod_88');
    assert.equal(stored.productRef, 'PQ Headless Bass');
    assert.equal(stored.estimatedPrice, undefined);
});

test('POST /api/contact rejects invalid email and unknown inquiry types', async () => {
    const response = await request(context.baseUrl, '/api/contact', {
        method: 'POST',
        body: {
            name: 'Lan',
            email: 'not-an-email',
            inquiryType: 'support-ticket',
            message: 'Hello',
        },
    });
    assert.equal(response.status, 422);
    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
    const fields = response.body.error.details.map((item) => item.field).sort();
    assert.deepEqual(fields, ['email', 'inquiryType']);
});

test('GET /api/admin/messages/:id returns one message only to an admin', async () => {
    const created = await request(context.baseUrl, '/api/contact', {
        method: 'POST',
        body: {
            name: 'Detail Visitor',
            email: 'detail@example.com',
            message: 'Please show this in admin.',
        },
    });
    const id = created.body.data.id;
    const anonymous = await request(context.baseUrl, `/api/admin/messages/${id}`);
    assert.equal(anonymous.status, 401);

    await User.create({
        email: 'contact-customer@example.com',
        name: 'Contact Customer',
        password: await bcrypt.hash('contact-customer-pass', 10),
        role: 'customer',
        admin: '0',
    });
    const customerLogin = await request(context.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: 'contact-customer@example.com', password: 'contact-customer-pass' },
    });
    const customer = await request(context.baseUrl, `/api/admin/messages/${id}`, {
        token: customerLogin.body.data.accessToken,
    });
    assert.equal(customer.status, 403);

    const admin = await request(context.baseUrl, `/api/admin/messages/${id}`, { token: adminToken });
    assert.equal(admin.status, 200);
    assert.equal(admin.body.data.id, id);
    assert.equal(admin.body.data.message, 'Please show this in admin.');
    assert.equal(admin.body.data.email, 'detail@example.com');

    const missing = await request(context.baseUrl, '/api/admin/messages/507f1f77bcf86cd799439011', {
        token: adminToken,
    });
    assert.equal(missing.status, 404);
});

test('GET /api/admin/messages returns stored inquiry metadata', async () => {
    const listed = await request(context.baseUrl, '/api/admin/messages', { token: adminToken });
    assert.equal(listed.status, 200);
    assert.equal(listed.body.success, true);
    const item = listed.body.data.find((message) => message.email === 'lan@example.com');
    assert.equal(item.inquiryType, 'ready-stock');
    assert.equal(item.productRef, 'PQ Headless Bass');
    assert.equal(item.subject, 'In-stock bass');
});
