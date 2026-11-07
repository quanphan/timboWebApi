const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const bcrypt = require('bcrypt');
const CustomBuildInquiry = require('../models/CustomBuildInquiry');
const ServiceCart = require('../models/ServiceCart');
const ServiceItem = require('../models/ServiceItem');
const User = require('../models/User');
const { SESSION_TTL_MS } = require('../services/serviceCartSession');
const { request, startTestApp, stopTestApp } = require('./support/app');

let context;
let adminToken;
let repairItemId;
let toolItemId;
let otherValueId;
let cncItemId;

function cartHeaders(session) {
    return {
        'x-cart-session': session.sessionId,
        'x-cart-token': session.token,
    };
}

async function session() {
    const response = await request(context.baseUrl, '/api/service-cart/session', { method: 'POST' });
    assert.equal(response.status, 201);
    return response.body.data;
}

before(async () => {
    context = await startTestApp();
    await User.create({
        email: 'cart-admin@example.com',
        name: 'Cart Admin',
        password: await bcrypt.hash('cart-admin-pass', 10),
        role: 'admin',
        admin: '1',
    });
    const login = await request(context.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: 'cart-admin@example.com', password: 'cart-admin-pass' },
    });
    adminToken = login.body.data.accessToken;

    const repair = await request(context.baseUrl, '/api/admin/services/categories', {
        method: 'POST',
        token: adminToken,
        body: {
            slug: 'guitar-repair',
            linkMode: 'details',
            translations: { en: { name: 'Guitar Repair' }, vi: { name: 'Sua guitar' } },
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
            linkMode: 'details',
            translations: { en: { name: '3D Design & CNC' } },
        },
    });

    const setup = await request(context.baseUrl, '/api/admin/services/items', {
        method: 'POST',
        token: adminToken,
        body: {
            categoryId: repair.body.data.id,
            translations: { en: { title: 'Setup' }, vi: { title: 'Chinh dan' } },
            price: 80,
            currency: 'USD',
        },
    });
    otherValueId = 'vother';
    const tool = await request(context.baseUrl, '/api/admin/services/items', {
        method: 'POST',
        token: adminToken,
        body: {
            categoryId: tools.body.data.id,
            translations: { en: { title: 'Fret file' }, vi: { title: 'Gia fret' } },
            price: 40,
            currency: 'USD',
            optionGroups: [{
                id: 'gsize',
                name: 'Size',
                translations: { en: { name: 'Size' }, vi: { name: 'Kich thuoc' } },
                values: [
                    { id: 'vsmall', label: 'Small', translations: { en: { label: 'Small' } }, price: 40 },
                    { id: otherValueId, label: 'Large', translations: { en: { label: 'Large' } }, price: 55 },
                ],
            }],
        },
    });
    const cncItem = await request(context.baseUrl, '/api/admin/services/items', {
        method: 'POST',
        token: adminToken,
        body: {
            categoryId: cnc.body.data.id,
            translations: { en: { title: 'CNC job' } },
            price: 200,
        },
    });
    assert.equal(setup.status, 201, JSON.stringify(setup.body));
    assert.equal(tool.status, 201, JSON.stringify(tool.body));
    assert.equal(cncItem.status, 201, JSON.stringify(cncItem.body));
    repairItemId = setup.body.data.id;
    toolItemId = tool.body.data.id;
    cncItemId = cncItem.body.data.id;
});

after(async () => {
    await stopTestApp(context);
});

test('guest cart requires a signed session and rejects other sessions', async () => {
    const created = await session();
    const missing = await request(context.baseUrl, '/api/service-cart');
    assert.equal(missing.status, 401);
    assert.equal(missing.body.error.code, 'GUEST_INVALID');

    const forged = await request(context.baseUrl, '/api/service-cart', {
        headers: { 'x-cart-session': created.sessionId, 'x-cart-token': 'not-the-token' },
    });
    assert.equal(forged.status, 401);
    assert.equal(forged.body.error.code, 'GUEST_INVALID');

    const ok = await request(context.baseUrl, '/api/service-cart', { headers: cartHeaders(created) });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.items.length, 0);
    assert.equal(ok.body.data.sessionId, created.sessionId);
});

test('adds repair and tools, merges same options, keeps different options separate', async () => {
    const created = await session();
    const first = await request(context.baseUrl, '/api/service-cart/items', {
        method: 'POST',
        headers: cartHeaders(created),
        body: { serviceItemId: toolItemId, optionValueIds: ['vsmall'], quantity: 2 },
    });
    assert.equal(first.status, 201);
    assert.equal(first.body.data.items[0].quantity, 2);
    assert.equal(first.body.data.items[0].unitPrice, 40);

    const merge = await request(context.baseUrl, '/api/service-cart/items', {
        method: 'POST',
        headers: cartHeaders(created),
        body: { serviceItemId: toolItemId, optionValueIds: ['vsmall'], quantity: 1 },
    });
    assert.equal(merge.body.data.items.length, 1);
    assert.equal(merge.body.data.items[0].quantity, 3);

    const other = await request(context.baseUrl, '/api/service-cart/items', {
        method: 'POST',
        headers: cartHeaders(created),
        body: { serviceItemId: toolItemId, optionValueIds: [otherValueId], quantity: 1 },
    });
    assert.equal(other.body.data.items.length, 2);

    const repair = await request(context.baseUrl, '/api/service-cart/items', {
        method: 'POST',
        headers: cartHeaders(created),
        body: { serviceItemId: repairItemId },
    });
    assert.equal(repair.status, 201);
    const setup = repair.body.data.items.find((item) => item.serviceItemId === repairItemId);
    assert.equal(setup.quantity, 1);
    assert.equal(setup.note, undefined);

    const qty = await request(context.baseUrl, `/api/service-cart/items/${setup.lineId}`, {
        method: 'PATCH',
        headers: cartHeaders(created),
        body: { quantity: 2 },
    });
    assert.equal(qty.body.data.items.find((item) => item.lineId === setup.lineId).quantity, 2);

    const smallLine = other.body.data.items.find((item) => item.optionValueIds.includes('vsmall'));
    const largeLine = other.body.data.items.find((item) => item.optionValueIds.includes(otherValueId));
    const mergedOptions = await request(context.baseUrl, `/api/service-cart/items/${largeLine.lineId}`, {
        method: 'PATCH',
        headers: cartHeaders(created),
        body: { optionValueIds: smallLine.optionValueIds },
    });
    const toolLines = mergedOptions.body.data.items.filter((item) => item.serviceItemId === toolItemId);
    assert.equal(toolLines.length, 1);
    assert.equal(toolLines[0].quantity, 4);

    const sameRepair = await request(context.baseUrl, '/api/service-cart/items', {
        method: 'POST',
        headers: cartHeaders(created),
        body: { serviceItemId: repairItemId, note: 'Different leftover note' },
    });
    assert.equal(sameRepair.body.data.items.filter((item) => item.serviceItemId === repairItemId).length, 1);
});

test('rejects CNC items, client prices, and empty submit; stores one inquiry snapshot', async () => {
    const created = await session();
    const blocked = await request(context.baseUrl, '/api/service-cart/items', {
        method: 'POST',
        headers: cartHeaders(created),
        body: { serviceItemId: cncItemId, unitPrice: 1 },
    });
    assert.equal(blocked.status, 422);

    const empty = await request(context.baseUrl, '/api/service-cart/submit', {
        method: 'POST',
        headers: cartHeaders(created),
        body: { name: 'Lan Pham', email: 'lan@example.com', phone: '+84901234567' },
    });
    assert.equal(empty.status, 422);

    await request(context.baseUrl, '/api/service-cart/items', {
        method: 'POST',
        headers: cartHeaders(created),
        body: { serviceItemId: repairItemId },
    });

    const invalid = await request(context.baseUrl, '/api/service-cart/submit', {
        method: 'POST',
        headers: cartHeaders(created),
        body: { name: 'Lan', email: 'not-email', phone: '12' },
    });
    assert.equal(invalid.status, 422);

    const submitted = await request(context.baseUrl, '/api/service-cart/submit', {
        method: 'POST',
        headers: cartHeaders(created),
        body: {
            name: 'Lan Pham',
            email: 'lan@example.com',
            phone: '+84901234567',
            country: 'Vietnam',
            notes: 'Please call in the evening.',
        },
    });
    assert.equal(submitted.status, 201);
    assert.equal(typeof submitted.body.data.id, 'string');
    assert.equal(submitted.body.data.customer.phone, '+84901234567');
    assert.equal(submitted.body.data.items.length, 1);
    assert.equal(submitted.body.data.items[0].titleEn, 'Setup');
    assert.equal(submitted.body.data.items[0].unitPrice, 80);
    assert.equal(submitted.body.data.items[0].note, undefined);
    assert.equal(submitted.body.data.notes, 'Please call in the evening.');

    const again = await request(context.baseUrl, '/api/service-cart/submit', {
        method: 'POST',
        headers: cartHeaders(created),
        body: { name: 'Lan Pham', email: 'lan@example.com', phone: '+84901234567' },
    });
    assert.equal(again.status, 409);

    const stored = await CustomBuildInquiry.findOne({ id: submitted.body.data.id });
    assert.equal(stored.configuration.selections.inquiryKind, 'service-cart');
    assert.equal(stored.configuration.selections.sessionId, created.sessionId);
    assert.equal(stored.customer.phone, '+84901234567');
    assert.equal(stored.configuration.selections.items.length, 1);

    const admin = await request(context.baseUrl, `/api/admin/custom-build/inquiries/${submitted.body.data.id}`, {
        token: adminToken,
    });
    assert.equal(admin.status, 200);
    assert.equal(admin.body.data.configuration.selections.inquiryKind, 'service-cart');
    assert.equal(admin.body.data.customer.phone, '+84901234567');
});

async function loginCustomer(email) {
    await User.create({
        email,
        name: 'Cart Customer',
        password: await bcrypt.hash('cart-user-pass', 10),
        role: 'customer',
    });
    const login = await request(context.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email, password: 'cart-user-pass' },
    });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    return login.body.data;
}

test('guest cart sliding expiry stays valid for seven days of activity', async () => {
    const created = await session();
    const before = await ServiceCart.findOne({ sessionId: created.sessionId });
    const added = await request(context.baseUrl, '/api/service-cart/items', {
        method: 'POST',
        headers: cartHeaders(created),
        body: { serviceItemId: repairItemId },
    });
    assert.equal(added.status, 201);
    const after = await ServiceCart.findOne({ sessionId: created.sessionId });
    assert.equal(after.ownerType, 'guest');
    assert.ok(after.expiresAt.getTime() - Date.now() > SESSION_TTL_MS - 10_000);
    assert.ok(after.expiresAt.getTime() >= before.expiresAt.getTime());
});

test('expired guest cart is rejected and user carts have no TTL date', async () => {
    const created = await session();
    await ServiceCart.updateOne(
        { sessionId: created.sessionId },
        { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    const expired = await request(context.baseUrl, '/api/service-cart', { headers: cartHeaders(created) });
    assert.equal(expired.status, 401);
    assert.equal(expired.body.error.code, 'GUEST_EXPIRED');

    const auth = await loginCustomer('cart-user-ttl@example.com');
    const userCart = await request(context.baseUrl, '/api/service-cart', { token: auth.accessToken });
    assert.equal(userCart.status, 200);
    const stored = await ServiceCart.findOne({ userId: auth.user.id, status: 'open' });
    assert.equal(stored.ownerType, 'user');
    assert.equal(stored.expiresAt == null, true);
    const ttlIndex = stored.schema.indexes().find((entry) => entry[0].expiresAt === 1);
    assert.equal(ttlIndex[1].partialFilterExpression.ownerType, 'guest');
});

test('user cart persists across tokens and is isolated from other users', async () => {
    const first = await loginCustomer('cart-user-a@example.com');
    const secondLogin = await request(context.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: 'cart-user-a@example.com', password: 'cart-user-pass' },
    });
    const other = await loginCustomer('cart-user-b@example.com');

    const added = await request(context.baseUrl, '/api/service-cart/items', {
        method: 'POST',
        token: first.accessToken,
        body: { serviceItemId: repairItemId, quantity: 2 },
    });
    assert.equal(added.status, 201);
    const lineId = added.body.data.items[0].lineId;

    const otherDevice = await request(context.baseUrl, '/api/service-cart', {
        token: secondLogin.body.data.accessToken,
    });
    assert.equal(otherDevice.status, 200);
    assert.equal(otherDevice.body.data.items[0].quantity, 2);
    assert.equal(otherDevice.body.data.expiresAt, null);

    const otherUser = await request(context.baseUrl, '/api/service-cart', { token: other.accessToken });
    assert.equal(otherUser.body.data.items.length, 0);

    const hijack = await request(context.baseUrl, `/api/service-cart/items/${lineId}`, {
        method: 'PATCH',
        token: other.accessToken,
        body: { quantity: 9 },
    });
    assert.equal(hijack.status, 404);
});

test('guest cart merges into user cart once and retry does not double quantity', async () => {
    const guest = await session();
    await request(context.baseUrl, '/api/service-cart/items', {
        method: 'POST',
        headers: cartHeaders(guest),
        body: { serviceItemId: repairItemId, quantity: 2 },
    });
    const auth = await loginCustomer('cart-user-merge@example.com');
    const userLine = await request(context.baseUrl, '/api/service-cart/items', {
        method: 'POST',
        token: auth.accessToken,
        body: { serviceItemId: repairItemId, quantity: 1 },
    });
    assert.equal(userLine.status, 201);

    const merged = await request(context.baseUrl, '/api/service-cart', {
        token: auth.accessToken,
        headers: cartHeaders(guest),
    });
    assert.equal(merged.status, 200);
    assert.equal(merged.body.data.ownerType, 'user');
    assert.equal(merged.body.data.items.length, 1);
    assert.equal(merged.body.data.items[0].quantity, 3);

    const retry = await request(context.baseUrl, '/api/service-cart', {
        token: auth.accessToken,
        headers: cartHeaders(guest),
    });
    assert.equal(retry.body.data.items[0].quantity, 3);

    const guestAfter = await ServiceCart.findOne({ sessionId: guest.sessionId });
    assert.ok(!guestAfter || guestAfter.status === 'merged' || guestAfter.ownerType === 'user');
});

test('user submit stores userId, clears the open cart, and keeps items after validation failure', async () => {
    const auth = await loginCustomer('cart-user-submit@example.com');
    await request(context.baseUrl, '/api/service-cart/items', {
        method: 'POST',
        token: auth.accessToken,
        body: { serviceItemId: repairItemId },
    });
    const invalid = await request(context.baseUrl, '/api/service-cart/submit', {
        method: 'POST',
        token: auth.accessToken,
        body: { name: 'Lan', email: 'bad', phone: '1' },
    });
    assert.equal(invalid.status, 422);
    const kept = await request(context.baseUrl, '/api/service-cart', { token: auth.accessToken });
    assert.equal(kept.body.data.items.length, 1);

    const submitted = await request(context.baseUrl, '/api/service-cart/submit', {
        method: 'POST',
        token: auth.accessToken,
        body: { name: 'Lan Pham', email: 'lan-user@example.com', phone: '+84901234567' },
    });
    assert.equal(submitted.status, 201);
    assert.equal(submitted.body.data.userId, auth.user.id);
    const stored = await CustomBuildInquiry.findOne({ id: submitted.body.data.id });
    assert.equal(stored.configuration.selections.userId, auth.user.id);
    assert.equal(stored.configuration.selections.sessionId, null);

    const empty = await request(context.baseUrl, '/api/service-cart', { token: auth.accessToken });
    assert.equal(empty.body.data.items.length, 0);

    const again = await request(context.baseUrl, '/api/service-cart/submit', {
        method: 'POST',
        token: auth.accessToken,
        body: { name: 'Lan Pham', email: 'lan-user@example.com', phone: '+84901234567' },
    });
    assert.equal(again.status, 422);
});

test('submit rejects inactive catalog items with a clear error and keeps the cart', async () => {
    const created = await session();
    await request(context.baseUrl, '/api/service-cart/items', {
        method: 'POST',
        headers: cartHeaders(created),
        body: { serviceItemId: repairItemId },
    });
    await ServiceItem.findByIdAndUpdate(repairItemId, { isActive: false });
    const blocked = await request(context.baseUrl, '/api/service-cart/submit', {
        method: 'POST',
        headers: cartHeaders(created),
        body: { name: 'Lan Pham', email: 'lan@example.com', phone: '+84901234567' },
    });
    assert.equal(blocked.status, 422);
    assert.equal(blocked.body.error.details[0].field, 'items');
    const listed = await request(context.baseUrl, '/api/service-cart', { headers: cartHeaders(created) });
    assert.equal(listed.body.data.items[0].unavailable, true);
    await ServiceItem.findByIdAndUpdate(repairItemId, { isActive: true });
});

test('invalid access token does not create a replacement guest cart', async () => {
    const created = await session();
    await request(context.baseUrl, '/api/service-cart/items', {
        method: 'POST',
        headers: cartHeaders(created),
        body: { serviceItemId: repairItemId },
    });
    const before = await ServiceCart.countDocuments({ ownerType: 'guest', status: 'open' });
    const blocked = await request(context.baseUrl, '/api/service-cart', {
        token: 'not-a-valid-jwt',
        headers: cartHeaders(created),
    });
    assert.equal(blocked.status, 401);
    assert.equal(blocked.body.error.code, 'UNAUTHORIZED');
    const after = await ServiceCart.countDocuments({ ownerType: 'guest', status: 'open' });
    assert.equal(after, before);
    const stored = await ServiceCart.findOne({ sessionId: created.sessionId });
    assert.equal(stored.status, 'open');
    assert.equal(stored.items.length, 1);
});

test('price snapshot is kept until the customer confirms a catalog change', async () => {
    const created = await session();
    const added = await request(context.baseUrl, '/api/service-cart/items', {
        method: 'POST',
        headers: cartHeaders(created),
        body: { serviceItemId: repairItemId },
    });
    assert.equal(added.body.data.items[0].unitPrice, 80);
    assert.equal(added.body.data.items[0].indicative, true);
    const stored = await ServiceCart.findOne({ sessionId: created.sessionId });
    assert.equal(stored.items[0].unitPriceSnapshot, 80);
    assert.equal(stored.items[0].currencySnapshot, 'USD');

    await ServiceItem.findByIdAndUpdate(repairItemId, { price: 95 });
    const listed = await request(context.baseUrl, '/api/service-cart', { headers: cartHeaders(created) });
    assert.equal(listed.body.data.items[0].unitPrice, 80);
    assert.equal(listed.body.data.items[0].currentUnitPrice, 95);
    assert.equal(listed.body.data.items[0].priceChanged, true);

    const blocked = await request(context.baseUrl, '/api/service-cart/submit', {
        method: 'POST',
        headers: cartHeaders(created),
        body: { name: 'Lan Pham', email: 'lan-price@example.com', phone: '+84901234567' },
    });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.error.code, 'PRICE_CHANGED');
    assert.equal(blocked.body.error.details[0].previous, 80);
    assert.equal(blocked.body.error.details[0].current, 95);

    const submitted = await request(context.baseUrl, '/api/service-cart/submit', {
        method: 'POST',
        headers: cartHeaders(created),
        body: {
            name: 'Lan Pham',
            email: 'lan-price@example.com',
            phone: '+84901234567',
            acceptPriceChanges: true,
        },
    });
    assert.equal(submitted.status, 201);
    assert.equal(submitted.body.data.items[0].unitPrice, 95);
    assert.equal(typeof submitted.body.data.confirmationToken, 'string');
    assert.equal(submitted.body.data.confirmationToken.length > 20, true);

    const byId = await request(context.baseUrl, `/api/service-cart/confirmation/${submitted.body.data.id}`);
    assert.equal(byId.status, 401);

    const receipt = await request(context.baseUrl, `/api/service-cart/confirmation/${submitted.body.data.id}`, {
        headers: { 'x-inquiry-receipt': submitted.body.data.confirmationToken },
    });
    assert.equal(receipt.status, 200);
    assert.equal(receipt.body.data.id, submitted.body.data.id);
    assert.equal(receipt.body.data.confirmationToken, null);
    assert.equal(receipt.body.data.customer.email, 'lan-price@example.com');

    const storedInquiry = await CustomBuildInquiry.findOne({ id: submitted.body.data.id });
    assert.equal(Boolean(storedInquiry.confirmationTokenHash), true);
    await ServiceItem.findByIdAndUpdate(repairItemId, { price: 80 });
});

test('deleted catalog items stay in the cart as unavailable snapshots', async () => {
    const created = await session();
    const extra = await request(context.baseUrl, '/api/admin/services/items', {
        method: 'POST',
        token: adminToken,
        body: {
            categoryId: (await ServiceItem.findById(repairItemId)).categoryId,
            translations: { en: { title: 'Temporary setup' }, vi: { title: 'Setup tam' } },
            price: 25,
            currency: 'USD',
        },
    });
    assert.equal(extra.status, 201);
    await request(context.baseUrl, '/api/service-cart/items', {
        method: 'POST',
        headers: cartHeaders(created),
        body: { serviceItemId: extra.body.data.id },
    });
    await ServiceItem.findByIdAndDelete(extra.body.data.id);
    const listed = await request(context.baseUrl, '/api/service-cart', { headers: cartHeaders(created) });
    assert.equal(listed.body.data.items[0].unavailable, true);
    assert.equal(listed.body.data.items[0].titleEn, 'Temporary setup');
    const blocked = await request(context.baseUrl, '/api/service-cart/submit', {
        method: 'POST',
        headers: cartHeaders(created),
        body: { name: 'Lan Pham', email: 'lan-deleted@example.com', phone: '+84901234567' },
    });
    assert.equal(blocked.status, 422);
    assert.equal(blocked.body.error.details[0].lineId, listed.body.data.items[0].lineId);
    const removed = await request(context.baseUrl, `/api/service-cart/items/${listed.body.data.items[0].lineId}`, {
        method: 'DELETE',
        headers: cartHeaders(created),
    });
    assert.equal(removed.status, 200);
    assert.equal(removed.body.data.items.length, 0);
});
