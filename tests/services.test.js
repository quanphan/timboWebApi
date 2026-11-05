const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { after, before, describe, test } = require('node:test');
const bcrypt = require('bcrypt');
const { sanitizeServiceHtml } = require('../utils/serviceHtml');
const { resolveServiceItemPrice } = require('../utils/serviceOptions');
const User = require('../models/User');
const { request, startTestApp, stopTestApp } = require('./support/app');

let context;
let adminToken;
let customerToken;

const pngBytes = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x00,
]);

describe('services offers', { concurrency: false }, () => {

before(async () => {
    context = await startTestApp();
    const customer = await request(context.baseUrl, '/api/auth/register', {
        method: 'POST',
        body: { name: 'Buyer', email: 'services-buyer@example.com', password: 'buyer-password' },
    });
    customerToken = customer.body.data.accessToken;
    await User.create({
        email: 'services-admin@example.com',
        name: 'Services Admin',
        password: await bcrypt.hash('services-admin-pass', 10),
        role: 'admin',
        admin: '1',
    });
    const login = await request(context.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: 'services-admin@example.com', password: 'services-admin-pass' },
    });
    adminToken = login.body.data.accessToken;
});

after(async () => {
    await stopTestApp(context);
});

async function upload(token, bytes, type, filename, scope) {
    const form = new FormData();
    form.append('file', new Blob([bytes], { type }), filename);
    const response = await fetch(`${context.baseUrl}/api/admin/uploads?scope=${scope}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: form,
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
}

test('html sanitizer strips script tags', () => {
    const clean = sanitizeServiceHtml('<p>Ok</p><script>alert(1)</script><a href="javascript:alert(1)">x</a>');
    assert.equal(clean.includes('script'), false);
    assert.equal(clean.includes('javascript:'), false);
    assert.match(clean, /<p>Ok<\/p>/);
});

test('admin services require authentication and admin catalog permission', async () => {
    const anonymous = await request(context.baseUrl, '/api/admin/services/categories', {
        method: 'POST',
        body: { slug: 'guitar-repair', translations: { en: { name: 'Repair' } } },
    });
    const customer = await request(context.baseUrl, '/api/admin/services/categories', {
        method: 'POST',
        token: customerToken,
        body: { slug: 'guitar-repair', translations: { en: { name: 'Repair' } } },
    });
    assert.equal(anonymous.status, 401);
    assert.equal(customer.status, 403);
});

test('admin CRUD, public active-only listing, contact categories, and uploads', async () => {
    const repair = await request(context.baseUrl, '/api/admin/services/categories', {
        method: 'POST',
        token: adminToken,
        body: {
            slug: 'guitar-repair',
            linkMode: 'details',
            translations: {
                en: { name: 'Guitar Repair', description: 'Setup and repairs.' },
                vi: { name: 'Sua guitar', description: 'Setup va sua chua.' },
            },
        },
    });
    const tools = await request(context.baseUrl, '/api/admin/services/categories', {
        method: 'POST',
        token: adminToken,
        body: {
            slug: 'tools-equipment',
            linkMode: 'details',
            translations: { en: { name: 'Tools & Equipment' }, vi: { name: 'Cong cu' } },
        },
    });
    const cnc = await request(context.baseUrl, '/api/admin/services/categories', {
        method: 'POST',
        token: adminToken,
        body: {
            slug: '3d-design-cnc',
            linkMode: 'contact',
            translations: { en: { name: '3D Design & CNC' }, vi: { name: 'Thiet ke 3D' } },
            isActive: true,
        },
    });
    assert.equal(repair.status, 201);
    assert.equal(tools.status, 201);
    assert.equal(cnc.status, 201);

    const hidden = await request(context.baseUrl, '/api/admin/services/categories', {
        method: 'POST',
        token: adminToken,
        body: {
            slug: 'hidden-service',
            linkMode: 'details',
            isActive: false,
            translations: { en: { name: 'Hidden' } },
        },
    });
    assert.equal(hidden.status, 201);

    const cncItem = await request(context.baseUrl, '/api/admin/services/items', {
        method: 'POST',
        token: adminToken,
        body: {
            categoryId: cnc.body.data.id,
            translations: { en: { title: 'Should fail' } },
        },
    });
    assert.equal(cncItem.status, 422);

    const uploadResult = await upload(adminToken, pngBytes, 'image/png', 'setup.png', 'services');
    assert.equal(uploadResult.status, 201);
    assert.match(uploadResult.body.data.path, /^\/uploads\/services\/[a-f0-9]{32}\.png$/);
    const stored = path.join(context.uploadsDir, uploadResult.body.data.path.replace(/^\/uploads\//, ''));
    assert.equal(fs.existsSync(stored), true);

    const setup = await request(context.baseUrl, '/api/admin/services/items', {
        method: 'POST',
        token: adminToken,
        body: {
            categoryId: repair.body.data.id,
            imagePath: uploadResult.body.data.path,
            price: 120,
            currency: 'USD',
            translations: {
                en: { title: 'Full setup', html: '<p>Action and intonation.</p><script>alert(1)</script>' },
                vi: { title: 'Setup toan phan', html: '<p>Action va intonation.</p>' },
            },
        },
    });
    assert.equal(setup.status, 201);
    assert.equal(setup.body.data.price, 120);
    assert.equal(setup.body.data.translations.en.html.includes('script'), false);

    const noPrice = await request(context.baseUrl, '/api/admin/services/items', {
        method: 'POST',
        token: adminToken,
        body: {
            categoryId: tools.body.data.id,
            translations: { en: { title: 'Jig', html: '<p>Custom jig.</p>' } },
        },
    });
    assert.equal(noPrice.status, 201);
    assert.equal(noPrice.body.data.price, null);

    const inactiveItem = await request(context.baseUrl, '/api/admin/services/items', {
        method: 'POST',
        token: adminToken,
        body: {
            categoryId: repair.body.data.id,
            isActive: false,
            translations: { en: { title: 'Hidden fretwork' } },
        },
    });
    assert.equal(inactiveItem.status, 201);

    const publicList = await request(context.baseUrl, '/api/services');
    assert.equal(publicList.status, 200);
    const slugs = publicList.body.data.map((item) => item.slug);
    assert.equal(slugs.includes('hidden-service'), false);
    assert.equal(slugs.includes('guitar-repair'), true);
    assert.equal(slugs.includes('3d-design-cnc'), true);

    const publicRepair = await request(context.baseUrl, '/api/services/guitar-repair');
    assert.equal(publicRepair.status, 200);
    assert.equal(publicRepair.body.data.items.length, 1);
    assert.equal(publicRepair.body.data.items[0].title, 'Full setup');
    assert.equal(publicRepair.body.data.items[0].price, 120);

    const publicTools = await request(context.baseUrl, '/api/services/tools-equipment');
    assert.equal(publicTools.status, 200);
    assert.equal(publicTools.body.data.items[0].price, null);

    const publicCnc = await request(context.baseUrl, '/api/services/3d-design-cnc');
    assert.equal(publicCnc.status, 404);

    const hiddenPublic = await request(context.baseUrl, '/api/services/hidden-service');
    assert.equal(hiddenPublic.status, 404);

    const reordered = await request(context.baseUrl, '/api/admin/services/categories/reorder', {
        method: 'PATCH',
        token: adminToken,
        body: { ids: [cnc.body.data.id, repair.body.data.id, tools.body.data.id, hidden.body.data.id] },
    });
    assert.equal(reordered.status, 200);
    assert.equal(reordered.body.data[0].slug, '3d-design-cnc');

    const deleted = await request(context.baseUrl, `/api/admin/services/categories/${repair.body.data.id}`, {
        method: 'DELETE',
        token: adminToken,
    });
    assert.equal(deleted.status, 200);
    const afterDelete = await request(context.baseUrl, '/api/services/guitar-repair');
    assert.equal(afterDelete.status, 404);
});

test('service items store option groups, combination prices, and keep legacy items', async () => {
    const category = await request(context.baseUrl, '/api/admin/services/categories', {
        method: 'POST',
        token: adminToken,
        body: {
            slug: 'tools-options',
            linkMode: 'details',
            translations: { en: { name: 'Tools options' } },
        },
    });
    assert.equal(category.status, 201);

    const legacy = await request(context.baseUrl, '/api/admin/services/items', {
        method: 'POST',
        token: adminToken,
        body: {
            categoryId: category.body.data.id,
            price: 40,
            currency: 'USD',
            translations: { en: { title: 'Plain block' } },
        },
    });
    assert.equal(legacy.status, 201);
    assert.deepEqual(legacy.body.data.optionGroups, []);
    assert.deepEqual(legacy.body.data.variantPrices, []);

    const created = await request(context.baseUrl, '/api/admin/services/items', {
        method: 'POST',
        token: adminToken,
        body: {
            categoryId: category.body.data.id,
            price: 50,
            currency: 'USD',
            translations: { en: { title: 'Sanding Block' }, vi: { title: 'Cuc cha' } },
            optionGroups: [
                {
                    id: 'g-length',
                    translations: { en: { name: 'Length' }, vi: { name: 'Chieu dai' } },
                    values: [
                        { id: 'v-8', translations: { en: { label: '8"' } }, price: null },
                        { id: 'v-12', translations: { en: { label: '12"' } }, price: 55 },
                    ],
                },
                {
                    id: 'g-radius',
                    translations: { en: { name: 'Radius' } },
                    values: [
                        { id: 'v-9', translations: { en: { label: '9.5"' } } },
                        { id: 'v-16', translations: { en: { label: '16"' } } },
                    ],
                },
            ],
            variantPrices: [{ valueIds: ['v-12', 'v-16'], price: 70 }],
        },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.optionGroups.length, 2);
    assert.equal(created.body.data.optionGroups[0].values[1].price, 55);
    assert.equal(created.body.data.variantPrices[0].price, 70);

    const publicPage = await request(context.baseUrl, '/api/services/tools-options');
    const sanding = publicPage.body.data.items.find((item) => item.title === 'Sanding Block');
    const plain = publicPage.body.data.items.find((item) => item.title === 'Plain block');
    assert.equal(plain.optionGroups.length, 0);
    assert.equal(sanding.optionGroups[1].translations.en.name, 'Radius');
    assert.equal(resolveServiceItemPrice(sanding, ['v-8', 'v-9']), 50);
    assert.equal(resolveServiceItemPrice(sanding, ['v-12', 'v-9']), 55);
    assert.equal(resolveServiceItemPrice(sanding, ['v-12', 'v-16']), 70);
    assert.equal(resolveServiceItemPrice(plain, []), 40);

    const copied = await request(context.baseUrl, '/api/admin/services/items', {
        method: 'POST',
        token: adminToken,
        body: {
            categoryId: sanding.categoryId,
            price: sanding.price,
            currency: sanding.currency,
            translations: sanding.translations,
            optionGroups: sanding.optionGroups.map((group) => ({
                ...group,
                id: `${group.id}-copy`,
                values: group.values.map((value) => ({ ...value, id: `${value.id}-copy` })),
            })),
            variantPrices: [{ valueIds: ['v-12-copy', 'v-16-copy'], price: 70 }],
        },
    });
    assert.equal(copied.status, 201);
    assert.notEqual(copied.body.data.id, created.body.data.id);
    assert.equal(copied.body.data.optionGroups[0].id, 'g-length-copy');

    const hiddenOptions = await request(context.baseUrl, `/api/admin/services/items/${created.body.data.id}`, {
        method: 'PATCH',
        token: adminToken,
        body: { isActive: false },
    });
    assert.equal(hiddenOptions.status, 200);
    assert.equal(hiddenOptions.body.data.optionGroups.length, 2);
});

});
