const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { after, before, describe, test } = require('node:test');
const bcrypt = require('bcrypt');
const Product = require('../models/Product');
const User = require('../models/User');
const { request, startTestApp, stopTestApp } = require('./support/app');

let context;
let adminToken;
let customerToken;

const pngBytes = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x00,
]);

describe('catalog admin', { concurrency: false }, () => {

before(async () => {
    context = await startTestApp();
    const customer = await request(context.baseUrl, '/api/auth/register', {
        method: 'POST',
        body: { name: 'Buyer', email: 'catalog-buyer@example.com', password: 'buyer-password' },
    });
    customerToken = customer.body.data.accessToken;
    await User.create({
        email: 'catalog-manager@example.com',
        name: 'Catalog Manager',
        password: await bcrypt.hash('catalog-manager-pass', 10),
        role: 'admin',
        admin: '1',
    });
    const login = await request(context.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: 'catalog-manager@example.com', password: 'catalog-manager-pass' },
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

test('catalog terms enforce auth, unique slugs, order, and references', async () => {
    const anonymous = await request(context.baseUrl, '/api/admin/catalog/instrument-types', {
        method: 'POST',
        body: { name: 'Electric', slug: 'electric' },
    });
    const customer = await request(context.baseUrl, '/api/admin/catalog/instrument-types', {
        method: 'POST',
        token: customerToken,
        body: { name: 'Electric', slug: 'electric' },
    });
    assert.equal(anonymous.status, 401);
    assert.equal(customer.status, 403);

    const electric = await request(context.baseUrl, '/api/admin/catalog/instrument-types', {
        method: 'POST',
        token: adminToken,
        body: {
            name: 'Electric',
            slug: 'electric',
            description: 'Solid body and hollow instruments',
            translations: { vi: { name: 'Guitar dien' }, en: { name: 'Electric' } },
            sortOrder: 2,
        },
    });
    assert.equal(electric.status, 201);
    assert.equal(electric.body.data.translations.vi.name, 'Guitar dien');
    const duplicate = await request(context.baseUrl, '/api/admin/catalog/instrument-types', {
        method: 'POST',
        token: adminToken,
        body: { name: 'Electric copy', slug: 'electric' },
    });
    assert.equal(duplicate.status, 409);

    const acoustic = await request(context.baseUrl, '/api/admin/catalog/instrument-types', {
        method: 'POST',
        token: adminToken,
        body: { name: 'Acoustic', slug: 'acoustic', sortOrder: 0 },
    });
    const ordered = await request(context.baseUrl, '/api/admin/catalog/instrument-types/reorder', {
        method: 'PATCH',
        token: adminToken,
        body: { ids: [acoustic.body.data.id, electric.body.data.id] },
    });
    assert.deepEqual(ordered.body.data.map((item) => item.slug), ['acoustic', 'electric']);

    const hidden = await request(context.baseUrl, `/api/admin/catalog/instrument-types/${acoustic.body.data.id}`, {
        method: 'PATCH',
        token: adminToken,
        body: { isActive: false },
    });
    assert.equal(hidden.body.data.isActive, false);
    const publicList = await request(context.baseUrl, '/api/catalog/instrument-types');
    assert.deepEqual(publicList.body.data.map((item) => item.slug), ['electric']);

    const shape = await request(context.baseUrl, '/api/admin/catalog/body-shapes', {
        method: 'POST',
        token: adminToken,
        body: { name: 'Offset', slug: 'offset', parentId: electric.body.data.id },
    });
    const blockedParent = await request(context.baseUrl, `/api/admin/catalog/instrument-types/${electric.body.data.id}`, {
        method: 'DELETE',
        token: adminToken,
    });
    assert.equal(blockedParent.status, 409);

    const product = await request(context.baseUrl, '/api/admin/catalog/products', {
        method: 'POST',
        token: adminToken,
        body: {
            name: 'Offset electric',
            slug: 'offset-electric',
            price: 1500,
            qty: 1,
            type: 'guitar',
            instrumentTypeId: electric.body.data.id,
            bodyShapeId: shape.body.data.id,
            status: 'published',
        },
    });
    assert.equal(product.status, 201);
    assert.equal(product.body.data.instrumentType.id, electric.body.data.id);
    assert.equal(product.body.data.inventory.status, 'in_stock');

    const duplicateProduct = await request(context.baseUrl, '/api/admin/products', {
        method: 'POST',
        token: adminToken,
        body: { name: 'Another offset', slug: 'offset-electric', price: 10, qty: 1 },
    });
    assert.equal(duplicateProduct.status, 409);

    const blockedType = await request(context.baseUrl, `/api/admin/catalog/instrument-types/${electric.body.data.id}`, {
        method: 'DELETE',
        token: adminToken,
    });
    assert.equal(blockedType.status, 409);

    const draft = await request(context.baseUrl, '/api/admin/catalog/products', {
        method: 'POST',
        token: adminToken,
        body: { name: 'Hidden guitar', slug: 'hidden-guitar', price: 10, qty: 1, status: 'draft' },
    });
    const publicProducts = await request(context.baseUrl, '/api/products?search=Hidden');
    const publicDetail = await request(context.baseUrl, `/api/products/${draft.body.data.id}`);
    const adminDetail = await request(context.baseUrl, `/api/admin/catalog/products/${draft.body.data.id}`, {
        token: adminToken,
    });
    assert.equal(publicProducts.body.data.length, 0);
    assert.equal(publicDetail.status, 404);
    assert.equal(adminDetail.status, 200);
    assert.equal(adminDetail.body.data.status, 'draft');

    const blockedShape = await request(context.baseUrl, `/api/admin/catalog/body-shapes/${shape.body.data.id}`, {
        method: 'DELETE',
        token: adminToken,
    });
    assert.equal(blockedShape.status, 409);
    const cleared = await request(context.baseUrl, `/api/admin/catalog/products/${product.body.data.id}`, {
        method: 'PATCH',
        token: adminToken,
        body: { bodyShapeId: null },
    });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.data.bodyShape, null);
    const removedShape = await request(context.baseUrl, `/api/admin/catalog/body-shapes/${shape.body.data.id}`, {
        method: 'DELETE',
        token: adminToken,
    });
    assert.equal(removedShape.status, 200);
});

test('productType and specs persist in MongoDB and survive GET after save', async () => {
    const created = await request(context.baseUrl, '/api/admin/catalog/products', {
        method: 'POST',
        token: adminToken,
        body: {
            name: 'Custom ash T',
            status: 'published',
            productType: 'custom-order',
            description: 'Short copy',
            descriptionDetail: 'Longer copy',
            qty: 0,
            sortOrder: 4,
            specs: {
                bodyWood: 'Ash',
                neckWood: 'Maple',
                productType: 'custom-order',
            },
        },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.productType, 'custom-order');
    assert.equal(created.body.data.specs.bodyWood, 'Ash');
    assert.equal(created.body.data.specs.productType, undefined);

    const stored = await Product.findById(created.body.data.id).lean();
    assert.equal(stored.productType, 'custom-order');
    assert.equal(stored.specs.bodyWood, 'Ash');
    assert.equal(stored.specs.productType, undefined);
    assert.equal(stored.description, 'Short copy');
    assert.equal(stored.descriptionDetail, 'Longer copy');

    const ready = await request(context.baseUrl, `/api/admin/catalog/products/${created.body.data.id}`, {
        method: 'PATCH',
        token: adminToken,
        body: {
            productType: 'ready-stock',
            qty: 2,
            specs: { bodyWood: 'Ash', colour: 'Natural' },
        },
    });
    assert.equal(ready.status, 200);
    assert.equal(ready.body.data.productType, 'ready-stock');
    assert.equal(ready.body.data.inventory.quantity, 2);

    const reloaded = await request(context.baseUrl, `/api/admin/catalog/products/${created.body.data.id}`, {
        token: adminToken,
    });
    assert.equal(reloaded.body.data.productType, 'ready-stock');
    assert.equal(reloaded.body.data.specs.colour, 'Natural');

    const publicCustom = await request(context.baseUrl, '/api/products?productType=custom-order&search=Custom%20ash');
    const publicReady = await request(context.baseUrl, '/api/products?productType=ready-stock&search=Custom%20ash');
    assert.equal(publicCustom.body.data.length, 0);
    assert.equal(publicReady.body.data.length, 1);
    assert.equal(publicReady.body.data[0].productType, 'ready-stock');

    const invalid = await request(context.baseUrl, '/api/admin/catalog/products', {
        method: 'POST',
        token: adminToken,
        body: { name: 'Bad type', productType: 'inventory' },
    });
    assert.equal(invalid.status, 422);
});

test('uploads accept a real image, reject a fake image, and keep the stored path', async () => {
    const anonymous = await upload('', pngBytes, 'image/png', 'a.png', 'guitars');
    const customer = await upload(customerToken, pngBytes, 'image/png', '../secret.png', 'categories');
    assert.equal(anonymous.status, 401);
    assert.equal(customer.status, 403);

    const badScope = await upload(adminToken, pngBytes, 'image/png', 'a.png', 'secrets');
    assert.equal(badScope.status, 400);

    const fake = await upload(adminToken, Buffer.from('not-an-image'), 'image/png', 'note.png', 'guitars');
    assert.equal(fake.status, 415);

    const first = await upload(adminToken, pngBytes, 'image/png', '../cover.png', 'guitars');
    assert.equal(first.status, 201);
    assert.match(first.body.data.path, /^\/uploads\/guitars\/[a-f0-9]{32}\.png$/);
    const firstFile = path.join(context.uploadsDir, first.body.data.path.replace(/^\/uploads\//, ''));
    assert.equal(fs.existsSync(firstFile), true);

    const second = await upload(adminToken, pngBytes, 'image/png', 'gallery.png', 'guitars');
    const created = await request(context.baseUrl, '/api/admin/products', {
        method: 'POST',
        token: adminToken,
        body: { name: 'Photo guitar', price: 20, qty: 1, image: first.body.data.path },
    });
    const updated = await request(context.baseUrl, `/api/admin/products/${created.body.data.id}`, {
        method: 'PUT',
        token: adminToken,
        body: { image: second.body.data.path, images: [first.body.data.path, second.body.data.path] },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.image, second.body.data.path);
    assert.equal(fs.existsSync(firstFile), true);
});

});
