const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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
    assert.equal(bodyWood.options.some((option) => option.id === 'body-wood.korina'), false);
    assert.equal(bodyWood.options.every((option) => option.active !== false), true);

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

test('validate requires neck-wood and finish-type when those catalog groups are required', async () => {
    const missingNeck = { ...validSelections };
    delete missingNeck['neck-wood'];
    const neckResult = await request(context.baseUrl, '/api/custom-build/validate', {
        method: 'POST',
        body: { selections: missingNeck },
    });
    assert.equal(neckResult.status, 422);
    assert.equal(
        neckResult.body.error.details.some((item) => item.field === 'selections.neck-wood' && item.code === 'REQUIRED'),
        true,
    );

    const missingFinish = { ...validSelections };
    delete missingFinish['finish-type'];
    const finishResult = await request(context.baseUrl, '/api/custom-build/validate', {
        method: 'POST',
        body: { selections: missingFinish },
    });
    assert.equal(finishResult.status, 422);
    assert.equal(
        finishResult.body.error.details.some((item) => item.field === 'selections.finish-type' && item.code === 'REQUIRED'),
        true,
    );

    const complete = await request(context.baseUrl, '/api/custom-build/validate', {
        method: 'POST',
        body: { selections: validSelections },
    });
    assert.equal(complete.status, 200);
    assert.equal(complete.body.data.valid, true);
    assert.equal(complete.body.data.configuration.selections['neck-wood'], validSelections['neck-wood']);
    assert.equal(complete.body.data.configuration.selections['finish-type'], validSelections['finish-type']);
});

test('pickup type is a single catalog option id', async () => {
    const options = await request(context.baseUrl, '/api/custom-build/options');
    const pickups = options.body.data.categories.find((category) => category.id === 'pickups');
    assert.equal(pickups.selectionMode, 'single');
    const humbucker = pickups.options.find((option) => option.id === 'pickups.humbucker' || option.code === 'humbucker');
    assert.equal(Boolean(humbucker), true);

    const withPickup = {
        ...validSelections,
        'instrument-type': 'instrument-type.electric-guitar',
        series: 'series.solid-body',
        pickups: humbucker.id,
    };
    const valid = await request(context.baseUrl, '/api/custom-build/validate', {
        method: 'POST',
        body: { selections: withPickup },
    });
    assert.equal(valid.status, 200, JSON.stringify(valid.body));
    assert.equal(valid.body.data.valid, true);
    assert.equal(valid.body.data.configuration.selections.pickups, humbucker.id);
    assert.equal(typeof valid.body.data.configuration.selections.pickups, 'string');

    const asArray = await request(context.baseUrl, '/api/custom-build/validate', {
        method: 'POST',
        body: { selections: { ...withPickup, pickups: [humbucker.id] } },
    });
    assert.equal(asArray.status, 422);
    assert.equal(
        asArray.body.error.details.some((item) => item.field === 'selections.pickups' && item.code === 'INVALID_TYPE'),
        true,
    );

    const unknown = await request(context.baseUrl, '/api/custom-build/validate', {
        method: 'POST',
        body: { selections: { ...withPickup, pickups: 'pickups.does-not-exist' } },
    });
    assert.equal(unknown.status, 422);
    assert.equal(
        unknown.body.error.details.some((item) => item.field === 'selections.pickups' && item.code === 'UNKNOWN_OPTION'),
        true,
    );

    const inquiry = await request(context.baseUrl, '/api/custom-build/inquiries', {
        method: 'POST',
        body: {
            customer: { name: 'Pickup Customer', email: 'pickup-customer@example.com', phone: '+84 90 111 2222' },
            configuration: { selections: withPickup },
        },
    });
    assert.equal(inquiry.status, 201);
    const stored = await CustomBuildInquiry.findOne({ id: inquiry.body.data.id }).lean();
    assert.equal(stored.configuration.selections.pickups, humbucker.id);
});

test('step 4 and 5 validation uses instrument type and series, not woods', async () => {
    const created = await request(context.baseUrl, '/api/admin/custom-build/setup/finish-type/options', {
        method: 'POST',
        token: adminAccessToken,
        body: {
            name: 'Type limited finish',
            code: 'type-limited-finish',
            compatibility: { instrumentTypeIds: ['electric-guitar'], bodyWoodIds: ['mahogany'] },
        },
    });
    assert.equal(created.status, 422);
    assert.equal(created.body.error.details[0].code, 'FORWARD_COMPAT');

    const finish = await request(context.baseUrl, '/api/admin/custom-build/setup/finish-type/options', {
        method: 'POST',
        token: adminAccessToken,
        body: {
            name: 'Type limited finish',
            code: 'type-limited-finish',
            compatibility: { instrumentTypeIds: ['electric-guitar'], seriesIds: ['solid-body'] },
        },
    });
    assert.equal(finish.status, 201);
    const finishId = finish.body.data.id;
    assert.deepEqual(finish.body.data.compatibility.seriesIds, ['solid-body']);

    const pickup = await request(context.baseUrl, '/api/admin/custom-build/setup/pickup-config/options', {
        method: 'POST',
        token: adminAccessToken,
        body: {
            name: 'Type limited pickup',
            code: 'type-limited-pickup',
            compatibility: { instrumentTypeIds: ['electric-guitar'], seriesIds: ['solid-body'] },
        },
    });
    assert.equal(pickup.status, 201);
    const pickupId = pickup.body.data.id;

    const electricWoodMismatch = {
        ...validSelections,
        'instrument-type': 'instrument-type.electric-guitar',
        series: 'series.solid-body',
        'finish-type': finishId,
        'pickup-config': pickupId,
    };
    const allowed = await request(context.baseUrl, '/api/custom-build/validate', {
        method: 'POST',
        body: { selections: electricWoodMismatch },
    });
    assert.equal(allowed.status, 200, JSON.stringify(allowed.body));
    assert.equal(allowed.body.data.configuration.selections['finish-type'], finishId);
    assert.equal(allowed.body.data.configuration.selections['pickup-config'], pickupId);

    const typeMismatch = await request(context.baseUrl, '/api/custom-build/validate', {
        method: 'POST',
        body: {
            selections: {
                ...electricWoodMismatch,
                'instrument-type': 'instrument-type.acoustic',
            },
        },
    });
    assert.equal(typeMismatch.status, 422);
    assert.equal(typeMismatch.body.error.details.some((item) => item.code === 'INCOMPATIBLE_OPTION'), true);

    const seriesMismatch = await request(context.baseUrl, '/api/custom-build/validate', {
        method: 'POST',
        body: {
            selections: {
                ...electricWoodMismatch,
                series: 'series.headless',
            },
        },
    });
    assert.equal(seriesMismatch.status, 422);
    assert.equal(seriesMismatch.body.error.details.some((item) => item.code === 'INCOMPATIBLE_OPTION'), true);

    const inquiry = await request(context.baseUrl, '/api/custom-build/inquiries', {
        method: 'POST',
        body: {
            customer: { name: 'Compat Customer', email: 'compat-customer@example.com', phone: '+84 90 111 2222' },
            configuration: { selections: electricWoodMismatch },
        },
    });
    assert.equal(inquiry.status, 201);
    const stored = await CustomBuildInquiry.findOne({ id: inquiry.body.data.id }).lean();
    assert.equal(stored.configuration.selections['finish-type'], finishId);
    assert.equal(stored.configuration.selections['pickup-config'], pickupId);
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

test('inquiry submission requires a non-empty phone number', async () => {
    const beforeCount = await CustomBuildInquiry.countDocuments();
    const missing = await request(context.baseUrl, '/api/custom-build/inquiries', {
        method: 'POST',
        body: {
            customer: { name: 'Phone Customer', email: 'phone-customer@example.com' },
            configuration: { selections: validSelections },
        },
    });
    assert.equal(missing.status, 422);
    assert.equal(
        missing.body.error.details.some((item) => item.field === 'customer.phone' && item.code === 'REQUIRED'),
        true,
    );

    const blank = await request(context.baseUrl, '/api/custom-build/inquiries', {
        method: 'POST',
        body: {
            customer: { name: 'Phone Customer', email: 'phone-customer@example.com', phone: '   ' },
            configuration: { selections: validSelections },
        },
    });
    assert.equal(blank.status, 422);
    assert.equal(
        blank.body.error.details.some((item) => item.field === 'customer.phone' && item.code === 'REQUIRED'),
        true,
    );
    assert.equal(await CustomBuildInquiry.countDocuments(), beforeCount);

    const accepted = await request(context.baseUrl, '/api/custom-build/inquiries', {
        method: 'POST',
        body: {
            customer: { name: 'Phone Customer', email: 'phone-ok@example.com', phone: '  +84 90 111 2222  ' },
            configuration: { selections: validSelections },
        },
    });
    assert.equal(accepted.status, 201);
    const stored = await CustomBuildInquiry.findOne({ id: accepted.body.data.id }).lean();
    assert.equal(stored.customer.phone, '+84 90 111 2222');
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
            customer: { name: 'Lan Pham', email: 'lan.pham@example.com', phone: '+84 90 111 2222' },
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
        customer: { name: 'Retry Customer', email: 'retry-customer@example.com', phone: '+84 90 111 2222' },
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
                customer: { name: 'Offline Customer', email: 'offline@example.com', phone: '+84 90 111 2222' },
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

const pngBytes = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x00,
]);
const gifBytes = Buffer.from('GIF89a', 'ascii');

async function uploadReference(bytes, type, filename) {
    const form = new FormData();
    form.append('file', new Blob([bytes], { type }), filename);
    const response = await fetch(`${context.baseUrl}/api/custom-build/uploads`, {
        method: 'POST',
        body: form,
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
}

test('reference images can be uploaded, removed, stored on inquiries, and omitted', async () => {
    const gif = await uploadReference(gifBytes, 'image/gif', 'ref.gif');
    assert.equal(gif.status, 415);

    const first = await uploadReference(pngBytes, 'image/png', 'ref-one.png');
    assert.equal(first.status, 201);
    const firstPath = first.body.data.path;
    assert.match(firstPath, /^\/uploads\/custom-build\/[a-f0-9]{32}\.png$/);
    const firstFile = path.join(context.uploadsDir, firstPath.replace('/uploads/', ''));
    assert.equal(fs.existsSync(firstFile), true);

    const second = await uploadReference(pngBytes, 'image/png', 'ref-two.png');
    assert.equal(second.status, 201);
    const secondPath = second.body.data.path;

    const removed = await request(context.baseUrl, `/api/custom-build/uploads?path=${encodeURIComponent(secondPath)}`, {
        method: 'DELETE',
    });
    assert.equal(removed.status, 200);
    assert.equal(fs.existsSync(path.join(context.uploadsDir, secondPath.replace('/uploads/', ''))), false);

    const blockedDelete = await request(context.baseUrl, '/api/custom-build/uploads?path=/uploads/guitars/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg', {
        method: 'DELETE',
    });
    assert.equal(blockedDelete.status, 400);

    const withImages = await request(context.baseUrl, '/api/custom-build/inquiries', {
        method: 'POST',
        body: {
            customer: { name: 'Image Customer', email: 'image-customer@example.com', phone: '+84 90 111 2222' },
            configuration: { selections: validSelections },
            referenceImages: [firstPath],
        },
    });
    assert.equal(withImages.status, 201);
    const stored = await CustomBuildInquiry.findOne({ id: withImages.body.data.id }).lean();
    assert.deepEqual(stored.referenceImages, [firstPath]);

    const adminView = await request(
        context.baseUrl,
        `/api/admin/custom-build/inquiries/${withImages.body.data.id}`,
        { token: adminAccessToken },
    );
    assert.equal(adminView.status, 200);
    assert.deepEqual(adminView.body.data.referenceImages, [firstPath]);

    const withoutImages = await request(context.baseUrl, '/api/custom-build/inquiries', {
        method: 'POST',
        body: {
            customer: { name: 'No Image Customer', email: 'no-image-customer@example.com', phone: '+84 90 111 2222' },
            configuration: { selections: validSelections },
        },
    });
    assert.equal(withoutImages.status, 201);
    const storedEmpty = await CustomBuildInquiry.findOne({ id: withoutImages.body.data.id }).lean();
    assert.equal(storedEmpty.referenceImages == null || storedEmpty.referenceImages.length === 0, true);

    const fakePath = await request(context.baseUrl, '/api/custom-build/inquiries', {
        method: 'POST',
        body: {
            customer: { name: 'Fake Image Customer', email: 'fake-image@example.com', phone: '+84 90 111 2222' },
            configuration: { selections: validSelections },
            referenceImages: ['/uploads/custom-build/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png'],
        },
    });
    assert.equal(fakePath.status, 422);

    const tooMany = await request(context.baseUrl, '/api/custom-build/inquiries', {
        method: 'POST',
        body: {
            customer: { name: 'Many Image Customer', email: 'many-image@example.com', phone: '+84 90 111 2222' },
            configuration: { selections: validSelections },
            referenceImages: Array.from({ length: 6 }, (_, index) => (
                `/uploads/custom-build/${index.toString().padStart(32, 'a')}.png`
            )),
        },
    });
    assert.equal(tooMany.status, 422);
    assert.equal(tooMany.body.error.details[0].code, 'TOO_MANY_SELECTIONS');
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
