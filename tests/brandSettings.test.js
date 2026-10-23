const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const bcrypt = require('bcrypt');
const BrandSettings = require('../models/BrandSettings');
const User = require('../models/User');
const { request, startTestApp, stopTestApp } = require('./support/app');

let context;
let adminToken;
let customerToken;

const sample = {
    contact: {
        email: 'studio@example.com',
        phone: '+84 90 000 0000',
        whatsapp: '+84900000000',
        facebook: 'https://facebook.com/phanquanguitars',
        instagram: 'https://instagram.com/phanquanguitars',
        youtube: '',
        other: '',
    },
    workshops: {
        workshop1: {
            name: 'Hanoi workshop',
            address: '12 Example Street, Hanoi',
            mapsUrl: 'https://maps.google.com/?q=hanoi',
            note: 'By appointment',
            enabled: true,
        },
        workshop2: {
            name: 'Saigon studio',
            address: '',
            mapsUrl: '',
            note: '',
            enabled: false,
        },
    },
    display: {
        email: true,
        phone: true,
        whatsapp: false,
        facebook: true,
        instagram: true,
        youtube: true,
        other: true,
        hours: true,
    },
    hours: {
        en: 'Tue–Sat, 10:00–18:00',
        vi: 'Thứ 3–7, 10:00–18:00',
    },
};

before(async () => {
    context = await startTestApp();
    await User.create({
        email: 'brand-admin@example.com',
        name: 'Brand Admin',
        password: await bcrypt.hash('brand-admin-pass', 10),
        role: 'admin',
        admin: '1',
    });
    await User.create({
        email: 'brand-customer@example.com',
        name: 'Brand Customer',
        password: await bcrypt.hash('brand-customer-pass', 10),
        role: 'customer',
    });
    const adminLogin = await request(context.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: 'brand-admin@example.com', password: 'brand-admin-pass' },
    });
    const customerLogin = await request(context.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: 'brand-customer@example.com', password: 'brand-customer-pass' },
    });
    adminToken = adminLogin.body.data.accessToken;
    customerToken = customerLogin.body.data.accessToken;
});

after(async () => {
    await stopTestApp(context);
});

test('GET /api/brand-settings/public returns empty defaults before configuration', async () => {
    const response = await request(context.baseUrl, '/api/brand-settings/public');
    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.email, null);
    assert.equal(response.body.data.phone, null);
    assert.deepEqual(response.body.data.workshops, []);
    assert.equal(response.body.data.hours, null);
    assert.equal(response.body.data.updatedBy, undefined);
    assert.equal(response.body.data.key, undefined);
    assert.equal(response.body.data.display, undefined);
    assert.equal(JSON.stringify(response.body).includes('hello@phanquanguitars.com'), false);
});

test('unauthorized users cannot read or write admin brand settings', async () => {
    const anonymousGet = await request(context.baseUrl, '/api/brand-settings/admin');
    const anonymousPut = await request(context.baseUrl, '/api/brand-settings/admin', {
        method: 'PUT',
        body: sample,
    });
    const customerPut = await request(context.baseUrl, '/api/brand-settings/admin', {
        method: 'PUT',
        token: customerToken,
        body: sample,
    });
    assert.equal(anonymousGet.status, 401);
    assert.equal(anonymousPut.status, 401);
    assert.equal(customerPut.status, 403);
    assert.equal(await BrandSettings.countDocuments(), 0);
});

test('admin PUT persists a singleton document and public GET hides disabled fields', async () => {
    const saved = await request(context.baseUrl, '/api/brand-settings/admin', {
        method: 'PUT',
        token: adminToken,
        body: sample,
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.data.contact.email, 'studio@example.com');
    assert.equal(typeof saved.body.data.updatedBy, 'string');

    const again = await request(context.baseUrl, '/api/brand-settings/admin', {
        method: 'PUT',
        token: adminToken,
        body: sample,
    });
    assert.equal(again.status, 200);
    assert.equal(await BrandSettings.countDocuments(), 1);
    const stored = await BrandSettings.findOne({ key: 'brand' });
    assert.equal(stored.contact.email, 'studio@example.com');
    assert.equal(stored.workshops.workshop1.address, '12 Example Street, Hanoi');

    const publicResponse = await request(context.baseUrl, '/api/brand-settings/public');
    assert.equal(publicResponse.status, 200);
    assert.equal(publicResponse.body.data.email, 'studio@example.com');
    assert.equal(publicResponse.body.data.phone, '+84 90 000 0000');
    assert.equal(publicResponse.body.data.whatsapp, null);
    assert.equal(publicResponse.body.data.facebook, 'https://facebook.com/phanquanguitars');
    assert.equal(publicResponse.body.data.youtube, null);
    assert.equal(publicResponse.body.data.hours.en, 'Tue–Sat, 10:00–18:00');
    assert.equal(publicResponse.body.data.workshops.length, 1);
    assert.equal(publicResponse.body.data.workshops[0].name, 'Hanoi workshop');
    assert.equal(publicResponse.body.data.updatedBy, undefined);
    assert.equal(publicResponse.body.data.display, undefined);
});

test('PUT /api/brand-settings/admin rejects invalid URLs and unknown fields', async () => {
    const response = await request(context.baseUrl, '/api/brand-settings/admin', {
        method: 'PUT',
        token: adminToken,
        body: {
            contact: {
                email: 'not-an-email',
                facebook: 'javascript:alert(1)',
            },
            secret: 'nope',
        },
    });
    assert.equal(response.status, 422);
    const fields = response.body.error.details.map((item) => item.field).sort();
    assert.ok(fields.includes('contact.email'));
    assert.ok(fields.includes('contact.facebook'));
    assert.ok(fields.includes('secret'));
});
