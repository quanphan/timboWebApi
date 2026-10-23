const assert = require('node:assert/strict');
const { after, before, describe, test } = require('node:test');
const User = require('../models/User');
const { request, startTestApp, stopTestApp } = require('./support/app');

let context;
let token;
let productId;

describe('catalog', { concurrency: false }, () => {

before(async () => {
    context = await startTestApp();
    const registered = await request(context.baseUrl, '/api/auth/register', {
        method: 'POST',
        body: { name: 'Buyer', email: 'buyer@example.com', password: 'buyer-password' },
    });
    token = registered.body.data.accessToken;
    const bcrypt = require('bcrypt');
    await User.create({
        email: 'catalog-admin@example.com',
        name: 'Catalog Admin',
        password: await bcrypt.hash('catalog-admin-pass', 10),
        role: 'admin',
        admin: '1',
    });
});

after(async () => {
    await stopTestApp(context);
});

async function adminToken() {
    const login = await request(context.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: 'catalog-admin@example.com', password: 'catalog-admin-pass' },
    });
    assert.equal(login.status, 200);
    return login.body.data.accessToken;
}

test('admin product creation is protected and stock is reported separately from custom build', async () => {
    const anonymous = await request(context.baseUrl, '/api/admin/products', {
        method: 'POST',
        body: { name: 'Concert guitar', price: 1200, qty: 2, type: 'guitar', brand: 'PhanQuan', code: 'PQ-1' },
    });
    assert.equal(anonymous.status, 401);

    const created = await request(context.baseUrl, '/api/admin/products', {
        method: 'POST',
        token: await adminToken(),
        body: {
            name: 'Concert guitar',
            price: 1200,
            qty: 2,
            type: 'guitar',
            brand: 'PhanQuan',
            code: 'PQ-1',
            adminNote: 'hidden',
        },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.inventory.status, 'in_stock');
    assert.equal(created.body.data.adminNote, undefined);
    productId = created.body.data.id;

    const out = await request(context.baseUrl, '/api/admin/products', {
        method: 'POST',
        token: await adminToken(),
        body: { name: 'Display guitar', price: 900, qty: 0, type: 'guitar', brand: 'PhanQuan', code: 'PQ-0' },
    });
    assert.equal(out.body.data.inventory.status, 'out_of_stock');

    const inStock = await request(context.baseUrl, '/api/products?inStock=true&search=Concert');
    assert.equal(inStock.status, 200);
    assert.equal(inStock.body.data.length, 1);
    assert.equal(inStock.body.meta.total, 1);
    assert.equal(inStock.body.data[0].name, 'Concert guitar');

    const types = await request(context.baseUrl, '/api/products/types');
    assert.deepEqual(types.body.data, ['guitar']);
});

test('cart prices come from the product and the cart requires authentication', async () => {
    const anonymous = await request(context.baseUrl, '/api/cart');
    assert.equal(anonymous.status, 401);

    const added = await request(context.baseUrl, '/api/cart/items', {
        method: 'POST',
        token,
        body: { productId, quantity: 2, price: 1 },
    });
    assert.equal(added.status, 201);
    assert.equal(added.body.data.items[0].quantity, 2);
    assert.equal(added.body.data.items[0].price, 1200);

    const updated = await request(context.baseUrl, `/api/cart/items/${productId}`, {
        method: 'PATCH',
        token,
        body: { quantity: 1 },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.items[0].quantity, 1);

    const removed = await request(context.baseUrl, `/api/cart/items/${productId}`, {
        method: 'DELETE',
        token,
    });
    assert.equal(removed.status, 200);
    assert.deepEqual(removed.body.data.items, []);
});

test('reviews require a signed-in customer and reject invalid ratings', async () => {
    const invalid = await request(context.baseUrl, `/api/products/${productId}/reviews`, {
        method: 'POST',
        token,
        body: { rating: 9, content: '' },
    });
    assert.equal(invalid.status, 422);
    assert.equal(invalid.body.error.code, 'VALIDATION_ERROR');

    const created = await request(context.baseUrl, `/api/products/${productId}/reviews`, {
        method: 'POST',
        token,
        body: { rating: 5, content: 'Even response and a comfortable neck.', quality: 5, recommend: true },
    });
    assert.equal(created.status, 201);

    const list = await request(context.baseUrl, `/api/products/${productId}/reviews`);
    assert.equal(list.status, 200);
    assert.equal(list.body.data.length, 1);
    assert.equal(list.body.data[0].content, 'Even response and a comfortable neck.');
});

test('contact messages are private and posts are publicly readable', async () => {
    const message = await request(context.baseUrl, '/api/contact', {
        method: 'POST',
        body: {
            name: 'Lan Pham',
            email: 'lan@example.com',
            message: 'Please tell me about a setup.',
            subject: 'Setup',
        },
    });
    assert.equal(message.status, 201);
    assert.equal(message.body.data.email, undefined);

    const publicList = await request(context.baseUrl, '/api/admin/messages', { token });
    assert.equal(publicList.status, 403);

    const adminMessages = await request(context.baseUrl, '/api/admin/messages', { token: await adminToken() });
    assert.equal(adminMessages.status, 200);
    assert.equal(adminMessages.body.data[0].email, 'lan@example.com');

    const post = await request(context.baseUrl, '/api/admin/posts', {
        method: 'POST',
        token: await adminToken(),
        body: { title: 'Shop notes', content: 'A short workshop note.' },
    });
    assert.equal(post.status, 201);
    const posts = await request(context.baseUrl, '/api/posts');
    assert.equal(posts.status, 200);
    assert.equal(posts.body.data[0].title, 'Shop notes');
});

});
