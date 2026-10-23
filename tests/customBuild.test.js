const assert = require('node:assert/strict');
const { after, before, describe, test } = require('node:test');
const mongoose = require('mongoose');
const User = require('../models/User');
const { seedDemoOptions } = require('../services/customBuild/seedDemoOptions');
const CustomBuildOption = require('../models/CustomBuildOption');
const CustomBuildInquiry = require('../models/CustomBuildInquiry');
const { request, startTestApp, stopTestApp } = require('./support/app');

let context;
let adminAccessToken;

const validSelections = {
    'instrument-type': 'instrument-type.acoustic',
    'body-shape': 'body-shape.concert-style',
    'body-wood': 'body-wood.mahogany',
    'neck-wood': 'neck-wood.mahogany',
    fingerboard: 'fingerboard.ebony',
    'finish-type': 'finish-type.oil',
};

describe('custom build', { concurrency: false }, () => {

before(async () => {
    context = await startTestApp();
    await seedDemoOptions(CustomBuildOption);
    const bcrypt = require('bcrypt');
    await User.create({
        email: 'build-admin@example.com',
        name: 'Build Admin',
        password: await bcrypt.hash('build-admin-pass', 10),
        role: 'admin',
        admin: '1',
    });
    const login = await request(context.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: 'build-admin@example.com', password: 'build-admin-pass' },
    });
    adminAccessToken = login.body.data.accessToken;
});

after(async () => {
    await stopTestApp(context);
});

test('options and validation use active catalog ids and reject prices', async () => {
    const options = await request(context.baseUrl, '/api/custom-build/options');
    assert.equal(options.status, 200);
    assert.equal(options.body.data.demo, true);
    const bodyWood = options.body.data.categories.find((category) => category.id === 'body-wood');
    assert.equal(bodyWood.options.some((option) => option.id === 'body-wood.korina' && option.active === false), true);

    const category = await request(context.baseUrl, '/api/custom-build/options/body-wood');
    assert.equal(category.status, 200);
    assert.equal(category.body.data.category.id, 'body-wood');

    const missing = await request(context.baseUrl, '/api/custom-build/options/not-a-category');
    assert.equal(missing.status, 404);

    const valid = await request(context.baseUrl, '/api/custom-build/validate', {
        method: 'POST',
        body: { selections: validSelections },
    });
    assert.equal(valid.status, 200);
    assert.equal(valid.body.data.valid, true);

    const unknown = await request(context.baseUrl, '/api/custom-build/validate', {
        method: 'POST',
        body: { selections: { ...validSelections, 'neck-wood': 'neck-wood.does-not-exist' } },
    });
    assert.equal(unknown.status, 422);
    assert.equal(unknown.body.error.details[0].code, 'UNKNOWN_OPTION');

    const inactive = await request(context.baseUrl, '/api/custom-build/validate', {
        method: 'POST',
        body: { selections: { ...validSelections, 'body-wood': 'body-wood.korina' } },
    });
    assert.equal(inactive.status, 422);
    assert.equal(inactive.body.error.details.some((item) => item.code === 'INACTIVE_OPTION'), true);

    const priced = await request(context.baseUrl, '/api/custom-build/validate', {
        method: 'POST',
        body: { selections: validSelections, estimatedPrice: 1800 },
    });
    assert.equal(priced.status, 422);
    assert.equal(priced.body.error.details[0].code, 'CALCULATED_VALUE_REJECTED');
});

test('inquiries are stored privately and only an admin can read them', async () => {
    const created = await request(context.baseUrl, '/api/custom-build/inquiries', {
        method: 'POST',
        body: {
            customer: { name: 'Test Customer', email: 'test-customer@example.com', phone: '+84 90 111 2222' },
            configuration: { selections: validSelections },
            message: 'Test inquiry',
            estimatedPrice: 500,
        },
    });
    assert.equal(created.status, 422);

    const accepted = await request(context.baseUrl, '/api/custom-build/inquiries', {
        method: 'POST',
        body: {
            customer: { name: 'Test Customer', email: 'test-customer@example.com', phone: '+84 90 111 2222' },
            configuration: { selections: validSelections },
            message: 'Test inquiry',
        },
    });
    assert.equal(accepted.status, 201);
    assert.equal(accepted.body.data.status, 'received');
    assert.equal(accepted.body.data.customer, undefined);

    const publicList = await request(context.baseUrl, '/api/custom-build/inquiries');
    const publicOne = await request(context.baseUrl, `/api/custom-build/inquiries/${accepted.body.data.id}`);
    assert.equal(publicList.status, 404);
    assert.equal(publicOne.status, 404);

    const stored = await CustomBuildInquiry.findOne({ id: accepted.body.data.id }).lean();
    assert.equal(stored.customer.email, 'test-customer@example.com');
    assert.equal(JSON.stringify(stored).includes('estimatedPrice'), false);

    const adminList = await request(context.baseUrl, '/api/admin/custom-build/inquiries', {
        token: adminAccessToken,
    });
    assert.equal(adminList.status, 200);
    assert.equal(adminList.body.data[0].id, accepted.body.data.id);
    assert.equal(adminList.body.data[0].customer.email, 'test-customer@example.com');
});

test('invalid contact data is rejected and nothing is stored', async () => {
    const beforeCount = await CustomBuildInquiry.countDocuments();
    const response = await request(context.baseUrl, '/api/custom-build/inquiries', {
        method: 'POST',
        body: {
            customer: { name: ' ', email: 'not-an-email' },
            configuration: { selections: validSelections },
        },
    });
    assert.equal(response.status, 422);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
    assert.equal(response.body.data, undefined);
    assert.equal(await CustomBuildInquiry.countDocuments(), beforeCount);
});

test('a valid inquiry stores notes and returns 201 with data.id', async () => {
    const notes = [
        'draftId=11111111-2222-4333-8444-555555555555',
        'language=vi',
        'country=Vietnam',
        'wizard:',
        'instrumentTypeId=acoustic-guitar',
    ].join('\n');
    const response = await request(context.baseUrl, '/api/custom-build/inquiries', {
        method: 'POST',
        body: {
            customer: { name: 'Lan Pham', email: 'lan.pham@example.com' },
            configuration: { selections: validSelections, notes },
            message: 'Please review this build.',
        },
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);
    assert.equal(typeof response.body.data.id, 'string');
    assert.equal(response.body.data.id.startsWith('inq_'), true);
    assert.equal(response.body.data.status, 'received');
    assert.equal(Number.isNaN(Date.parse(response.body.data.createdAt)), false);
    assert.equal(response.body.data.customer, undefined);

    const stored = await CustomBuildInquiry.findOne({ id: response.body.data.id }).lean();
    assert.equal(stored.draftId, '11111111-2222-4333-8444-555555555555');
    assert.equal(stored.configuration.notes, notes);
    assert.equal(stored.customer.email, 'lan.pham@example.com');
    assert.equal(JSON.stringify(stored).includes('estimatedPrice'), false);
    assert.equal(JSON.stringify(stored).includes('"price"'), false);
});

test('an identical retry returns the original inquiry and a changed request is kept', async () => {
    const notes = [
        'draftId=aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        'language=en',
        'country=Vietnam',
        'wizard:',
        'shapeId=offset',
    ].join('\n');
    const body = {
        customer: { name: 'Retry Customer', email: 'retry-customer@example.com' },
        configuration: { selections: validSelections, notes },
        message: 'First request',
    };
    const parallel = await Promise.all([
        request(context.baseUrl, '/api/custom-build/inquiries', { method: 'POST', body }),
        request(context.baseUrl, '/api/custom-build/inquiries', { method: 'POST', body }),
    ]);
    const first = parallel[0];
    const replay = await request(context.baseUrl, '/api/custom-build/inquiries', {
        method: 'POST',
        body,
    });

    assert.equal(first.status, 201);
    assert.equal(replay.status, 201);
    assert.equal(replay.body.data.id, first.body.data.id);
    assert.equal(replay.body.data.createdAt, first.body.data.createdAt);
    assert.equal(parallel[0].body.data.id, first.body.data.id);
    assert.equal(parallel[1].body.data.id, first.body.data.id);
    assert.equal(await CustomBuildInquiry.countDocuments({ draftId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' }), 1);

    const edited = await request(context.baseUrl, '/api/custom-build/inquiries', {
        method: 'POST',
        body: { ...body, message: 'Updated request after the customer changed the notes.' },
    });
    assert.equal(edited.status, 201);
    assert.notEqual(edited.body.data.id, first.body.data.id);
    assert.equal(await CustomBuildInquiry.countDocuments({ draftId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' }), 2);
});

test('a disconnected database returns an error and does not report success', async () => {
    const beforeCount = await CustomBuildInquiry.countDocuments();
    const previousBuffer = mongoose.get('bufferCommands');
    mongoose.set('bufferCommands', false);
    await mongoose.disconnect();
    try {
        const response = await request(context.baseUrl, '/api/custom-build/inquiries', {
            method: 'POST',
            body: {
                customer: { name: 'Offline Customer', email: 'offline@example.com' },
                configuration: {
                    selections: validSelections,
                    notes: 'draftId=offline-draft-id-12345678\nlanguage=vi',
                },
            },
        });
        assert.equal(response.status, 500);
        assert.equal(response.body.success, false);
        assert.equal(response.body.error.code, 'DATA_UNAVAILABLE');
        assert.equal(response.body.data, undefined);
    } finally {
        mongoose.set('bufferCommands', previousBuffer);
        await mongoose.connect(context.mongod.getUri());
    }
    assert.equal(await CustomBuildInquiry.countDocuments(), beforeCount);
    assert.equal(await CustomBuildInquiry.countDocuments({ 'customer.email': 'offline@example.com' }), 0);
});

test('demo seeding does not overwrite an edited category', async () => {
    const category = await CustomBuildOption.findOne({ id: 'instrument-type' });
    category.name = 'Edited by admin';
    await category.save();
    const result = await seedDemoOptions(CustomBuildOption);
    assert.equal(result.inserted, 0);
    const again = await CustomBuildOption.findOne({ id: 'instrument-type' }).lean();
    assert.equal(again.name, 'Edited by admin');
});

});
