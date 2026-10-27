const assert = require('node:assert/strict');
const { after, before, describe, test } = require('node:test');
const bcrypt = require('bcrypt');
const AdminAuditLog = require('../models/AdminAuditLog');
const CustomBuildInquiry = require('../models/CustomBuildInquiry');
const User = require('../models/User');
const { bootstrapSuperAdmin } = require('../services/bootstrapSuperAdmin');
const { seedDemoOptions } = require('../services/customBuild/seedDemoOptions');
const CustomBuildOption = require('../models/CustomBuildOption');
const { request, startTestApp, stopTestApp } = require('./support/app');

let context;
let adminToken;
let customerToken;
let superToken;

const selections = {
    'instrument-type': 'instrument-type.acoustic',
    'body-shape': 'body-shape.concert-style',
    'body-wood': 'body-wood.mahogany',
    'neck-wood': 'neck-wood.mahogany',
    fingerboard: 'fingerboard.ebony',
    'finish-type': 'finish-type.oil',
};

describe('admin inquiries', { concurrency: false }, () => {

before(async () => {
    context = await startTestApp();
    await seedDemoOptions(CustomBuildOption);
    await User.create({
        email: 'customer-admin-api@example.com',
        name: 'Customer',
        password: await bcrypt.hash('customer-pass', 10),
        role: 'customer',
        admin: '0',
    });
    await User.create({
        email: 'shop-admin-api@example.com',
        name: 'Shop Admin',
        password: await bcrypt.hash('shop-admin-pass', 10),
        role: 'admin',
        admin: '1',
    });
    const customerLogin = await request(context.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: 'customer-admin-api@example.com', password: 'customer-pass' },
    });
    const adminLogin = await request(context.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: 'shop-admin-api@example.com', password: 'shop-admin-pass' },
    });
    customerToken = customerLogin.body.data.accessToken;
    adminToken = adminLogin.body.data.accessToken;
});

after(async () => {
    await stopTestApp(context);
});

async function submit(name, email, message) {
    const response = await request(context.baseUrl, '/api/custom-build/inquiries', {
        method: 'POST',
        body: {
            customer: { name, email, phone: '+84 90 111 2222' },
            configuration: {
                selections,
                notes: `draftId=draft-${email.replace('@', '-')}\nlanguage=vi\ncountry=Vietnam`,
            },
            message,
        },
    });
    assert.equal(response.status, 201);
    assert.equal(response.body.data.status, 'received');
    return response.body.data;
}

test('superadmin bootstrap is idempotent and username login works', async () => {
    const created = await bootstrapSuperAdmin({ password: 'initial-admin-pass' });
    assert.equal(created.created, true);
    const stored = await User.findOne({ username: 'phanquan' });
    const hash = stored.password;
    assert.equal(stored.role, 'superadmin');
    assert.equal(stored.admin, '0');
    assert.equal(hash.startsWith('$2'), true);

    const again = await bootstrapSuperAdmin({ password: 'replacement-pass-not-used' });
    assert.equal(again.skipped, true);
    const after = await User.findOne({ username: 'phanquan' });
    assert.equal(after.password, hash);
    assert.equal(await User.countDocuments({ username: 'phanquan' }), 1);

    const login = await request(context.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { username: 'phanquan', password: 'initial-admin-pass' },
    });
    assert.equal(login.status, 200);
    assert.equal(login.body.data.user.role, 'superadmin');
    assert.equal(login.body.data.user.password, undefined);
    superToken = login.body.data.accessToken;

    const wrong = await request(context.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { username: 'phanquan', password: 'replacement-pass-not-used' },
    });
    assert.equal(wrong.status, 401);
});

test('an email owned by another account is left untouched', async () => {
    const owner = await User.create({
        email: 'taken-admin@example.com',
        name: 'Existing Owner',
        password: await bcrypt.hash('owner-pass-value', 10),
        role: 'customer',
        admin: '0',
    });
    await assert.rejects(
        () => bootstrapSuperAdmin({
            password: 'initial-admin-pass',
            email: 'taken-admin@example.com',
        }),
        (error) => error.code === 'ADMIN_EMAIL_CONFLICT',
    );
    const stillThere = await User.findById(owner._id);
    assert.equal(stillThere.email, 'taken-admin@example.com');
    assert.equal(stillThere.role, 'customer');
    assert.equal(await User.countDocuments({ username: 'phanquan' }), 1);
});

test('an existing phanquan account is promoted without replacing its password', async () => {
    const current = await User.findOne({ username: 'phanquan' });
    const hash = current.password;
    current.role = 'customer';
    current.email = 'old-phanquan@example.com';
    await current.save();

    const promoted = await bootstrapSuperAdmin({
        password: 'replacement-pass-not-used',
        email: 'promoted-phanquan@example.com',
    });
    assert.equal(promoted.promoted, true);
    const stored = await User.findOne({ username: 'phanquan' });
    assert.equal(stored.role, 'superadmin');
    assert.equal(stored.email, 'promoted-phanquan@example.com');
    assert.equal(stored.password, hash);

    const rerun = await bootstrapSuperAdmin({
        password: 'another-unused-password',
        email: 'promoted-phanquan@example.com',
    });
    assert.equal(rerun.skipped, true);
    const after = await User.findOne({ username: 'phanquan' });
    assert.equal(after.password, hash);
    assert.equal(await User.countDocuments({ username: 'phanquan' }), 1);
});

test('inquiry management rejects anonymous and customer users', async () => {
    const created = await submit('Lan Pham', 'lan.filter@example.com', 'Keep this message');
    const paths = [
        ['GET', `/api/admin/custom-build/inquiries`],
        ['GET', `/api/admin/custom-build/inquiries/${created.id}`],
        ['PATCH', `/api/admin/custom-build/inquiries/${created.id}`],
        ['DELETE', `/api/admin/custom-build/inquiries/${created.id}`],
    ];
    for (const [method, path] of paths) {
        const anonymous = await request(context.baseUrl, path, {
            method,
            body: method === 'PATCH' ? { status: 'building' } : undefined,
        });
        const customer = await request(context.baseUrl, path, {
            method,
            token: customerToken,
            body: method === 'PATCH' ? { status: 'building' } : undefined,
        });
        assert.equal(anonymous.status, 401);
        assert.equal(customer.status, 403);
    }
    const stillThere = await CustomBuildInquiry.findOne({ id: created.id }).lean();
    assert.equal(stillThere.status, 'received');
    assert.equal(stillThere.message, 'Keep this message');
});

test('admins can filter, search, update status, and delete with an audit record', async () => {
    const january = await submit('Lan Search', 'lan.search@example.com', 'January build');
    const march = await submit('Other Person', 'other.person@example.com', 'March build');
    const cancelled = await submit('Cancel Person', 'cancel.person@example.com', 'Cancel build');
    await CustomBuildInquiry.collection.updateOne(
        { id: january.id },
        { $set: { createdAt: new Date('2026-01-15T10:00:00.000Z') } },
    );
    await CustomBuildInquiry.collection.updateOne(
        { id: march.id },
        { $set: { status: 'building', createdAt: new Date('2026-03-15T10:00:00.000Z') } },
    );
    await CustomBuildInquiry.collection.updateOne(
        { id: cancelled.id },
        { $set: { status: 'cancelled', createdAt: new Date('2026-03-20T10:00:00.000Z') } },
    );

    const listed = await request(context.baseUrl, '/api/admin/custom-build/inquiries?limit=1&page=1', {
        token: adminToken,
    });
    assert.equal(listed.status, 200);
    assert.equal(listed.body.data.length, 1);
    assert.equal(listed.body.meta.page, 1);
    assert.ok(listed.body.meta.total >= 3);

    const newest = await request(context.baseUrl, '/api/admin/custom-build/inquiries?startDate=2026-03-01&endDate=2026-03-31', {
        token: adminToken,
    });
    assert.deepEqual(
        newest.body.data.map((item) => item.id),
        [cancelled.id, march.id],
    );

    const fresh = await request(context.baseUrl, '/api/admin/custom-build/inquiries?status=new', {
        token: adminToken,
    });
    assert.equal(fresh.body.data.some((item) => item.id === january.id && item.status === 'new'), true);
    assert.equal(fresh.body.data.some((item) => item.id === march.id), false);

    const byEmail = await request(context.baseUrl, '/api/admin/custom-build/inquiries?q=lan.search@example.com', {
        token: adminToken,
    });
    assert.deepEqual(byEmail.body.data.map((item) => item.id), [january.id]);

    const byId = await request(context.baseUrl, `/api/admin/custom-build/inquiries?q=${encodeURIComponent(march.id)}`, {
        token: adminToken,
    });
    assert.deepEqual(byId.body.data.map((item) => item.id), [march.id]);

    const invalid = await request(context.baseUrl, '/api/admin/custom-build/inquiries?status=approved', {
        token: adminToken,
    });
    assert.equal(invalid.status, 400);

    const before = await CustomBuildInquiry.findOne({ id: january.id }).lean();
    const updated = await request(context.baseUrl, `/api/admin/custom-build/inquiries/${january.id}`, {
        method: 'PATCH',
        token: superToken,
        body: { status: 'ready_to_build' },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.status, 'ready_to_build');
    assert.equal(updated.body.data.message, 'January build');
    assert.deepEqual(updated.body.data.configuration.selections, before.configuration.selections);
    const stored = await CustomBuildInquiry.findOne({ id: january.id }).lean();
    assert.equal(stored.status, 'ready_to_build');
    assert.equal(stored.message, before.message);
    assert.deepEqual(stored.configuration.selections, before.configuration.selections);

    const rejected = await request(context.baseUrl, `/api/admin/custom-build/inquiries/${january.id}`, {
        method: 'PATCH',
        token: adminToken,
        body: { status: 'shipped', configuration: { selections: {} } },
    });
    assert.equal(rejected.status, 422);
    const unchanged = await CustomBuildInquiry.findOne({ id: january.id }).lean();
    assert.equal(unchanged.status, 'ready_to_build');
    assert.deepEqual(unchanged.configuration.selections, before.configuration.selections);

    const removed = await request(context.baseUrl, `/api/admin/custom-build/inquiries/${cancelled.id}`, {
        method: 'DELETE',
        token: adminToken,
    });
    assert.equal(removed.status, 200);
    assert.equal(removed.body.data.deleted, true);
    assert.equal(await CustomBuildInquiry.countDocuments({ id: cancelled.id }), 0);
    const audit = await AdminAuditLog.findOne({ inquiryId: cancelled.id, action: 'inquiry.delete' }).lean();
    assert.ok(audit);
    assert.equal(audit.actorRole, 'admin');
    assert.equal(audit.previousStatus, 'cancelled');
    assert.equal(JSON.stringify(audit).includes('password'), false);

    const missing = await request(context.baseUrl, `/api/admin/custom-build/inquiries/${cancelled.id}`, {
        token: adminToken,
    });
    assert.equal(missing.status, 404);

    const publicList = await request(context.baseUrl, '/api/custom-build/inquiries');
    assert.equal(publicList.status, 404);
});

test('an identical public submit still returns the original inquiry', async () => {
    const body = {
        customer: { name: 'Retry Admin', email: 'retry.admin@example.com', phone: '+84 90 111 2222' },
        configuration: {
            selections,
            notes: 'draftId=retry-admin-draft-123456\nlanguage=en\ncountry=Vietnam',
        },
        message: 'Same request',
    };
    const first = await request(context.baseUrl, '/api/custom-build/inquiries', { method: 'POST', body });
    const second = await request(context.baseUrl, '/api/custom-build/inquiries', { method: 'POST', body });
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal(second.body.data.id, first.body.data.id);
    assert.equal(second.body.data.status, 'received');
    assert.equal(await CustomBuildInquiry.countDocuments({ 'customer.email': 'retry.admin@example.com' }), 1);
});

});
