const assert = require('node:assert/strict');
const { after, before, describe, test } = require('node:test');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const CustomBuildOption = require('../models/CustomBuildOption');
const CustomBuildInquiry = require('../models/CustomBuildInquiry');
const { seedDemoOptions } = require('../services/customBuild/seedDemoOptions');
const { request, startTestApp, stopTestApp } = require('./support/app');

let context;
let adminToken;
let customerToken;

describe('custom build wizard setup', { concurrency: false }, () => {
    before(async () => {
        context = await startTestApp();
        await seedDemoOptions(CustomBuildOption);
        const customer = await request(context.baseUrl, '/api/auth/register', {
            method: 'POST',
            body: { name: 'Setup Buyer', email: 'setup-buyer@example.com', password: 'buyer-password' },
        });
        customerToken = customer.body.data.accessToken;
        await User.create({
            email: 'setup-admin@example.com',
            name: 'Setup Admin',
            password: await bcrypt.hash('setup-admin-pass', 10),
            role: 'admin',
            admin: '1',
        });
        const login = await request(context.baseUrl, '/api/auth/login', {
            method: 'POST',
            body: { email: 'setup-admin@example.com', password: 'setup-admin-pass' },
        });
        adminToken = login.body.data.accessToken;
    });

    after(async () => {
        await stopTestApp(context);
    });

    test('admin can list, create, default, duplicate, and reject a second default', async () => {
        const anonymous = await request(context.baseUrl, '/api/admin/custom-build/setup');
        const customer = await request(context.baseUrl, '/api/admin/custom-build/setup', { token: customerToken });
        assert.equal(anonymous.status, 401);
        assert.equal(customer.status, 403);

        const listed = await request(context.baseUrl, '/api/admin/custom-build/setup', { token: adminToken });
        assert.equal(listed.status, 200);
        const series = listed.body.data.categories.find((item) => item.id === 'series');
        assert.equal(Boolean(series), true);
        assert.equal(series.options.some((item) => item.code === 'headless'), true);

        const created = await request(context.baseUrl, '/api/admin/custom-build/setup/series/options', {
            method: 'POST',
            token: adminToken,
            body: {
                name: 'Semi-hollow line',
                code: 'semi-hollow',
                isDefault: true,
                translations: { en: { name: 'Semi-hollow line' }, vi: { name: 'Bán rỗng' } },
                compatibility: { instrumentTypeIds: ['electric-guitar'] },
            },
        });
        assert.equal(created.status, 201);
        assert.equal(created.body.data.isDefault, true);

        const secondDefault = await request(context.baseUrl, '/api/admin/custom-build/setup/series/options', {
            method: 'POST',
            token: adminToken,
            body: {
                name: 'Another default',
                code: 'another-default',
                isDefault: true,
            },
        });
        assert.equal(secondDefault.status, 201);
        const after = await request(context.baseUrl, '/api/admin/custom-build/setup/series', { token: adminToken });
        const defaults = after.body.data.options.filter((item) => item.isDefault);
        assert.equal(defaults.length, 1);
        assert.equal(defaults[0].code, 'another-default');

        const duplicate = await request(
            context.baseUrl,
            `/api/admin/custom-build/setup/series/options/${created.body.data.id}/duplicate`,
            { method: 'POST', token: adminToken },
        );
        assert.equal(duplicate.status, 201);
        assert.equal(duplicate.body.data.isDefault, false);
        assert.match(duplicate.body.data.code, /semi-hollow-/);

        const clash = await request(context.baseUrl, '/api/admin/custom-build/setup/series/options', {
            method: 'POST',
            token: adminToken,
            body: { name: 'Headless again', code: 'headless' },
        });
        assert.equal(clash.status, 409);
    });

    test('delete is blocked when an inquiry references the option', async () => {
        const created = await request(context.baseUrl, '/api/admin/custom-build/setup/series/options', {
            method: 'POST',
            token: adminToken,
            body: { name: 'Referenced series', code: 'referenced-series' },
        });
        assert.equal(created.status, 201);

        await CustomBuildInquiry.create({
            id: 'inq-setup-1',
            submissionKey: 'setup-ref-1',
            customer: { name: 'Pat', email: 'pat@example.com' },
            configuration: { selections: { series: created.body.data.id } },
            status: 'received',
        });

        const removed = await request(
            context.baseUrl,
            `/api/admin/custom-build/setup/series/options/${created.body.data.id}`,
            { method: 'DELETE', token: adminToken },
        );
        assert.equal(removed.status, 409);
        assert.equal(removed.body.error.details[0].code, 'IN_USE');

        const deactivated = await request(
            context.baseUrl,
            `/api/admin/custom-build/setup/series/options/${created.body.data.id}`,
            { method: 'PATCH', token: adminToken, body: { active: false, name: 'Referenced series', code: 'referenced-series' } },
        );
        assert.equal(deactivated.status, 200);
        assert.equal(deactivated.body.data.active, false);
    });

    test('scoped series defaults are unique per instrument type and stay compatible', async () => {
        const electricDefault = await request(context.baseUrl, '/api/admin/custom-build/setup/series/options', {
            method: 'POST',
            token: adminToken,
            body: {
                name: 'Electric default series',
                code: 'electric-default-series',
                defaultForInstrumentTypeIds: ['electric-guitar'],
                compatibility: { instrumentTypeIds: ['electric-guitar'] },
            },
        });
        assert.equal(electricDefault.status, 201);
        assert.deepEqual(electricDefault.body.data.defaultForInstrumentTypeIds, ['electric-guitar']);

        const bassDefault = await request(context.baseUrl, '/api/admin/custom-build/setup/series/options', {
            method: 'POST',
            token: adminToken,
            body: {
                name: 'Bass default series',
                code: 'bass-default-series',
                defaultForInstrumentTypeIds: ['bass'],
                compatibility: { instrumentTypeIds: ['bass'] },
            },
        });
        assert.equal(bassDefault.status, 201);

        const steal = await request(context.baseUrl, '/api/admin/custom-build/setup/series/options', {
            method: 'POST',
            token: adminToken,
            body: {
                name: 'Replacement electric default',
                code: 'electric-default-series-2',
                defaultForInstrumentTypeIds: ['electric-guitar'],
                compatibility: { instrumentTypeIds: ['electric-guitar'] },
            },
        });
        assert.equal(steal.status, 201);
        const after = await request(context.baseUrl, '/api/admin/custom-build/setup/series', { token: adminToken });
        const electricScopes = after.body.data.options.filter((item) =>
            (item.defaultForInstrumentTypeIds || []).includes('electric-guitar'),
        );
        assert.equal(electricScopes.length, 1);
        assert.equal(electricScopes[0].code, 'electric-default-series-2');
        const bassScopes = after.body.data.options.filter((item) =>
            (item.defaultForInstrumentTypeIds || []).includes('bass'),
        );
        assert.equal(bassScopes.some((item) => item.code === 'bass-default-series'), true);

        const unknown = await request(context.baseUrl, '/api/admin/custom-build/setup/series/options', {
            method: 'POST',
            token: adminToken,
            body: {
                name: 'Bad compatibility',
                code: 'bad-compat-series',
                compatibility: { instrumentTypeIds: ['not-a-real-type'] },
            },
        });
        assert.equal(unknown.status, 422);
        assert.equal(unknown.body.error.details[0].code, 'UNKNOWN_COMPAT');

        const incompatible = await request(context.baseUrl, '/api/admin/custom-build/setup/series/options', {
            method: 'POST',
            token: adminToken,
            body: {
                name: 'Incompatible default',
                code: 'incompatible-default-series',
                defaultForInstrumentTypeIds: ['bass'],
                compatibility: { instrumentTypeIds: ['electric-guitar'] },
            },
        });
        assert.equal(incompatible.status, 422);
        assert.equal(incompatible.body.error.details[0].code, 'INCOMPATIBLE_DEFAULT');

        const deactivated = await request(
            context.baseUrl,
            `/api/admin/custom-build/setup/series/options/${bassDefault.body.data.id}`,
            {
                method: 'PATCH',
                token: adminToken,
                body: { active: false, isDefault: false, defaultForInstrumentTypeIds: [], name: 'Bass default series', code: 'bass-default-series' },
            },
        );
        assert.equal(deactivated.status, 200);
        assert.equal(deactivated.body.data.active, false);
        assert.deepEqual(deactivated.body.data.defaultForInstrumentTypeIds, []);
    });

    test('delete reports not found, blocks short-code note matches, and removes unused options', async () => {
        const created = await request(context.baseUrl, '/api/admin/custom-build/setup/series/options', {
            method: 'POST',
            token: adminToken,
            body: { name: 'Disposable series', code: 'disposable-series' },
        });
        assert.equal(created.status, 201);

        const missing = await request(
            context.baseUrl,
            '/api/admin/custom-build/setup/series/options/series.does-not-exist',
            { method: 'DELETE', token: adminToken },
        );
        assert.equal(missing.status, 404);

        const forbidden = await request(
            context.baseUrl,
            `/api/admin/custom-build/setup/series/options/${created.body.data.id}`,
            { method: 'DELETE', token: customerToken },
        );
        assert.equal(forbidden.status, 403);

        await CustomBuildInquiry.create({
            id: 'inq-setup-notes-6',
            submissionKey: 'setup-notes-6',
            customer: { name: 'Lee', email: 'lee@example.com' },
            configuration: { selections: { series: 'series.solid-body' }, notes: 'Looking at 6 strings and black hardware.' },
            status: 'received',
        });

        const removed = await request(
            context.baseUrl,
            `/api/admin/custom-build/setup/series/options/${created.body.data.id}`,
            { method: 'DELETE', token: adminToken },
        );
        assert.equal(removed.status, 200);
        assert.equal(removed.body.data.deleted, true);

        const listed = await request(context.baseUrl, '/api/admin/custom-build/setup/series', { token: adminToken });
        assert.equal(listed.body.data.options.some((item) => item.id === created.body.data.id), false);
    });

    test('deactivate keeps inquiries and update by code does not rewrite the option id', async () => {
        const created = await request(context.baseUrl, '/api/admin/custom-build/setup/series/options', {
            method: 'POST',
            token: adminToken,
            body: { name: 'Keep id series', code: 'keep-id-series' },
        });
        assert.equal(created.status, 201);
        const optionId = created.body.data.id;
        await CustomBuildInquiry.create({
            id: 'inq-setup-keep-1',
            submissionKey: 'setup-keep-1',
            customer: { name: 'Kim', email: 'kim@example.com' },
            configuration: { selections: { series: optionId } },
            status: 'received',
        });

        const deactivated = await request(
            context.baseUrl,
            `/api/admin/custom-build/setup/series/options/keep-id-series`,
            {
                method: 'PATCH',
                token: adminToken,
                body: { active: false, name: 'Keep id series', code: 'keep-id-series' },
            },
        );
        assert.equal(deactivated.status, 200);
        assert.equal(deactivated.body.data.id, optionId);
        assert.equal(deactivated.body.data.active, false);

        const inquiry = await CustomBuildInquiry.findOne({ id: 'inq-setup-keep-1' }).lean();
        assert.equal(inquiry.configuration.selections.series, optionId);
        assert.equal(inquiry.status, 'received');
    });

    test('public catalog hides inactive options and validate rejects them until reactivated', async () => {
        const created = await request(context.baseUrl, '/api/admin/custom-build/setup/series/options', {
            method: 'POST',
            token: adminToken,
            body: { name: 'Visibility series', code: 'visibility-series' },
        });
        assert.equal(created.status, 201);
        const optionId = created.body.data.id;

        const listedActive = await request(context.baseUrl, '/api/custom-build/options');
        const seriesActive = listedActive.body.data.categories.find((item) => item.id === 'series');
        assert.equal(seriesActive.options.some((item) => item.id === optionId), true);

        const deactivated = await request(
            context.baseUrl,
            `/api/admin/custom-build/setup/series/options/${optionId}`,
            {
                method: 'PATCH',
                token: adminToken,
                body: { active: false, name: 'Visibility series', code: 'visibility-series' },
            },
        );
        assert.equal(deactivated.status, 200);
        assert.equal(deactivated.body.data.active, false);

        const adminListed = await request(context.baseUrl, '/api/admin/custom-build/setup/series', { token: adminToken });
        assert.equal(adminListed.body.data.options.some((item) => item.id === optionId && item.active === false), true);

        const listedInactive = await request(context.baseUrl, '/api/custom-build/options');
        const seriesInactive = listedInactive.body.data.categories.find((item) => item.id === 'series');
        assert.equal(seriesInactive.options.some((item) => item.id === optionId), false);

        const rejected = await request(context.baseUrl, '/api/custom-build/validate', {
            method: 'POST',
            body: { selections: { series: optionId } },
        });
        assert.equal(rejected.status, 422);
        assert.equal(rejected.body.error.details.some((item) => item.code === 'INACTIVE_OPTION'), true);

        const reactivated = await request(
            context.baseUrl,
            `/api/admin/custom-build/setup/series/options/${optionId}`,
            {
                method: 'PATCH',
                token: adminToken,
                body: { active: true, name: 'Visibility series', code: 'visibility-series' },
            },
        );
        assert.equal(reactivated.status, 200);
        assert.equal(reactivated.body.data.active, true);

        const listedAgain = await request(context.baseUrl, '/api/custom-build/options');
        const seriesAgain = listedAgain.body.data.categories.find((item) => item.id === 'series');
        assert.equal(seriesAgain.options.some((item) => item.id === optionId && item.active !== false), true);
    });

    test('public options expose wizard compatibility without admin mutation', async () => {
        const options = await request(context.baseUrl, '/api/custom-build/options');
        const series = options.body.data.categories.find((item) => item.id === 'series');
        const headless = series.options.find((item) => item.code === 'headless');
        assert.equal(headless.compatibility.instrumentTypeIds.includes('electric-guitar'), true);
        const write = await request(context.baseUrl, '/api/custom-build/options', {
            method: 'POST',
            body: { name: 'nope' },
        });
        assert.equal(write.status, 404);
    });

    test('unused option delete strips compatibility and scoped defaults without touching inquiries', async () => {
        const { restoreCategorySnapshots } = require('../services/customBuild/wizardSetupService');
        const series = await request(context.baseUrl, '/api/admin/custom-build/setup/series/options', {
            method: 'POST',
            token: adminToken,
            body: { name: 'Cleanup series', code: 'cleanup-compat-series' },
        });
        assert.equal(series.status, 201);
        const shape = await request(context.baseUrl, '/api/admin/custom-build/setup/body-shape/options', {
            method: 'POST',
            token: adminToken,
            body: {
                name: 'Cleanup shape',
                code: 'cleanup-compat-shape',
                compatibility: { seriesIds: ['cleanup-compat-series', 'solid-body'] },
            },
        });
        assert.equal(shape.status, 201);

        const type = await request(context.baseUrl, '/api/admin/custom-build/setup/instrument-type/options', {
            method: 'POST',
            token: adminToken,
            body: { name: 'Cleanup type', code: 'cleanup-default-type' },
        });
        assert.equal(type.status, 201);
        const defaulted = await request(context.baseUrl, '/api/admin/custom-build/setup/series/options', {
            method: 'POST',
            token: adminToken,
            body: {
                name: 'Cleanup default series',
                code: 'cleanup-default-series',
                defaultForInstrumentTypeIds: ['cleanup-default-type'],
                compatibility: { instrumentTypeIds: ['cleanup-default-type'] },
            },
        });
        assert.equal(defaulted.status, 201);

        const snapshots = (await CustomBuildOption.find().lean()).map((doc) => ({
            id: doc.id,
            options: doc.options,
            metadata: doc.metadata,
        }));
        const seriesDoc = await CustomBuildOption.findOne({ id: 'series' });
        const beforeCount = seriesDoc.options.length;
        seriesDoc.options = seriesDoc.options.filter((item) => item.id !== series.body.data.id);
        seriesDoc.markModified('options');
        await seriesDoc.save();
        assert.equal((await CustomBuildOption.findOne({ id: 'series' }).lean()).options.some((item) => item.id === series.body.data.id), false);
        await restoreCategorySnapshots(snapshots);
        assert.equal((await CustomBuildOption.findOne({ id: 'series' }).lean()).options.some((item) => item.id === series.body.data.id), true);
        assert.equal((await CustomBuildOption.findOne({ id: 'series' }).lean()).options.length, beforeCount);

        const removedSeries = await request(
            context.baseUrl,
            `/api/admin/custom-build/setup/series/options/${series.body.data.id}`,
            { method: 'DELETE', token: adminToken },
        );
        assert.equal(removedSeries.status, 200);
        assert.equal(removedSeries.body.data.deleted, true);
        const shapes = await request(context.baseUrl, '/api/admin/custom-build/setup/body-shape', { token: adminToken });
        const cleanedShape = shapes.body.data.options.find((item) => item.id === shape.body.data.id);
        assert.equal(cleanedShape.compatibility.seriesIds.includes('cleanup-compat-series'), false);
        assert.equal(cleanedShape.compatibility.seriesIds.includes('solid-body'), true);

        const removedType = await request(
            context.baseUrl,
            `/api/admin/custom-build/setup/instrument-type/options/${type.body.data.id}`,
            { method: 'DELETE', token: adminToken },
        );
        assert.equal(removedType.status, 200);
        const seriesAfter = await request(context.baseUrl, '/api/admin/custom-build/setup/series', { token: adminToken });
        const cleanedDefault = seriesAfter.body.data.options.find((item) => item.id === defaulted.body.data.id);
        assert.equal((cleanedDefault.defaultForInstrumentTypeIds || []).includes('cleanup-default-type'), false);

        const publicOptions = await request(context.baseUrl, '/api/custom-build/options');
        const publicSeries = publicOptions.body.data.categories.find((item) => item.id === 'series');
        assert.equal(publicSeries.options.some((item) => item.id === series.body.data.id), false);

        await CustomBuildOption.create({
            id: 'solo-group',
            name: 'Solo group',
            selectionMode: 'single',
            required: false,
            maxSelections: 1,
            sortOrder: 900,
            options: [{
                id: 'solo-group.only',
                name: 'Only option',
                active: true,
                code: 'only',
            }],
        });
        const last = await request(
            context.baseUrl,
            '/api/admin/custom-build/setup/solo-group/options/solo-group.only',
            { method: 'DELETE', token: adminToken },
        );
        assert.equal(last.status, 409);
        assert.equal(last.body.error.details[0].code, 'LAST_OPTION');
        const stillThere = await CustomBuildOption.findOne({ id: 'solo-group' }).lean();
        assert.equal(stillThere.options[0].id, 'solo-group.only');
    });

    test('compatibility may only reference earlier wizard groups', async () => {
        const { precedingGroups, allowedCompatibilityKeys } = require('../services/customBuild/wizardGroups');
        assert.deepEqual(precedingGroups('series').map((item) => item.id), ['instrument-type']);
        assert.deepEqual(precedingGroups('body-shape').map((item) => item.id), ['instrument-type', 'series']);
        assert.deepEqual(allowedCompatibilityKeys('body-shape'), ['instrumentTypeIds', 'seriesIds']);
        assert.deepEqual(allowedCompatibilityKeys('series'), ['instrumentTypeIds']);
        assert.deepEqual(allowedCompatibilityKeys('scale'), ['instrumentTypeIds', 'seriesIds', 'shapeIds']);
        assert.deepEqual(allowedCompatibilityKeys('string-count'), ['instrumentTypeIds', 'seriesIds', 'shapeIds']);
        assert.deepEqual(allowedCompatibilityKeys('radius'), ['instrumentTypeIds', 'seriesIds', 'shapeIds']);
        assert.equal(allowedCompatibilityKeys('scale').includes('stringCounts'), false);
        assert.equal(allowedCompatibilityKeys('scale').includes('instrumentTypeIds'), true);
        assert.equal(allowedCompatibilityKeys('scale').includes('shapeIds'), true);
        assert.equal(allowedCompatibilityKeys('pickup-config').includes('instrumentTypeIds'), true);
        assert.equal(allowedCompatibilityKeys('pickup-config').includes('seriesIds'), true);
        assert.equal(allowedCompatibilityKeys('pickup-config').includes('shapeIds'), true);
        assert.equal(allowedCompatibilityKeys('pickup-config').includes('bodyWoodIds'), false);
        assert.equal(allowedCompatibilityKeys('pickups').includes('pickupConfigIds'), true);
        assert.equal(allowedCompatibilityKeys('finish-type').includes('bodyWoodIds'), false);
        assert.equal(allowedCompatibilityKeys('body-wood').includes('seriesIds'), true);

        const seriesOk = await request(context.baseUrl, '/api/admin/custom-build/setup/series/options', {
            method: 'POST',
            token: adminToken,
            body: {
                name: 'Order series',
                code: 'order-series',
                compatibility: { instrumentTypeIds: ['electric-guitar'] },
            },
        });
        assert.equal(seriesOk.status, 201);

        const shapeOk = await request(context.baseUrl, '/api/admin/custom-build/setup/body-shape/options', {
            method: 'POST',
            token: adminToken,
            body: {
                name: 'Order shape',
                code: 'order-shape',
                compatibility: { instrumentTypeIds: ['electric-guitar'], seriesIds: ['solid-body'] },
            },
        });
        assert.equal(shapeOk.status, 201);

        const scaleForward = await request(context.baseUrl, '/api/admin/custom-build/setup/scale/options', {
            method: 'POST',
            token: adminToken,
            body: {
                name: 'Forward scale',
                code: 'forward-scale',
                compatibility: { stringCounts: ['6'] },
            },
        });
        assert.equal(scaleForward.status, 422);
        assert.equal(scaleForward.body.error.details[0].code, 'FORWARD_COMPAT');

        const shapeForward = await request(context.baseUrl, '/api/admin/custom-build/setup/body-shape/options', {
            method: 'POST',
            token: adminToken,
            body: {
                name: 'Forward shape',
                code: 'forward-shape',
                compatibility: { scaleIds: ['25.5'] },
            },
        });
        assert.equal(shapeForward.status, 422);
        assert.equal(shapeForward.body.error.details[0].code, 'FORWARD_COMPAT');

        const pickupSeries = await request(context.baseUrl, '/api/admin/custom-build/setup/pickup-config/options', {
            method: 'POST',
            token: adminToken,
            body: {
                name: 'Series pickup',
                code: 'series-pickup',
                compatibility: {
                    instrumentTypeIds: ['electric-guitar'],
                    seriesIds: ['solid-body'],
                },
            },
        });
        assert.equal(pickupSeries.status, 201);
        assert.deepEqual(pickupSeries.body.data.compatibility.instrumentTypeIds, ['electric-guitar']);
        assert.deepEqual(pickupSeries.body.data.compatibility.seriesIds, ['solid-body']);

        const reloaded = await request(context.baseUrl, '/api/admin/custom-build/setup/pickup-config', { token: adminToken });
        assert.equal(reloaded.status, 200);
        const storedPickup = reloaded.body.data.options.find((item) => item.code === 'series-pickup');
        assert.deepEqual(storedPickup.compatibility.instrumentTypeIds, ['electric-guitar']);
        assert.deepEqual(storedPickup.compatibility.seriesIds, ['solid-body']);
        assert.equal((storedPickup.compatibility.bodyWoodIds || []).length, 0);

        const pickupWood = await request(context.baseUrl, '/api/admin/custom-build/setup/finish-type/options', {
            method: 'POST',
            token: adminToken,
            body: {
                name: 'Forward finish',
                code: 'forward-finish',
                compatibility: { bodyWoodIds: ['mahogany'] },
            },
        });
        assert.equal(pickupWood.status, 422);
        assert.equal(pickupWood.body.error.details[0].code, 'FORWARD_COMPAT');

        const pickupOk = await request(context.baseUrl, '/api/admin/custom-build/setup/pickup-config/options', {
            method: 'POST',
            token: adminToken,
            body: {
                name: 'Type pickup',
                code: 'type-pickup',
                compatibility: { instrumentTypeIds: ['electric-guitar'] },
            },
        });
        assert.equal(pickupOk.status, 201);
    });

    test('compatibility cannot newly reference inactive options and ignores them in the public catalog', async () => {
        const hidden = await request(context.baseUrl, '/api/admin/custom-build/setup/series/options', {
            method: 'POST',
            token: adminToken,
            body: { name: 'Hidden compat series', code: 'hidden-compat-series' },
        });
        assert.equal(hidden.status, 201);
        const hiddenId = hidden.body.data.id;
        const deactivated = await request(
            context.baseUrl,
            `/api/admin/custom-build/setup/series/options/${hiddenId}`,
            {
                method: 'PATCH',
                token: adminToken,
                body: { active: false, name: 'Hidden compat series', code: 'hidden-compat-series' },
            },
        );
        assert.equal(deactivated.status, 200);

        const rejected = await request(context.baseUrl, '/api/admin/custom-build/setup/body-shape/options', {
            method: 'POST',
            token: adminToken,
            body: {
                name: 'Needs hidden series',
                code: 'needs-hidden-series',
                compatibility: { seriesIds: ['hidden-compat-series'] },
            },
        });
        assert.equal(rejected.status, 422);
        assert.equal(rejected.body.error.details[0].code, 'INACTIVE_COMPAT');

        const shape = await request(context.baseUrl, '/api/admin/custom-build/setup/body-shape/options', {
            method: 'POST',
            token: adminToken,
            body: {
                name: 'Keeps stored series ref',
                code: 'keeps-stored-series-ref',
                compatibility: { seriesIds: ['solid-body'] },
            },
        });
        assert.equal(shape.status, 201);
        const seriesDoc = await CustomBuildOption.findOne({ id: 'series' });
        const shapeDoc = await CustomBuildOption.findOne({ id: 'body-shape' });
        const storedShape = shapeDoc.options.find((item) => item.id === shape.body.data.id);
        storedShape.compatibility = { seriesIds: ['hidden-compat-series', 'solid-body'] };
        shapeDoc.markModified('options');
        await shapeDoc.save();
        assert.equal(seriesDoc.options.some((item) => item.id === hiddenId && item.active === false), true);

        const publicOptions = await request(context.baseUrl, '/api/custom-build/options');
        const publicSeries = publicOptions.body.data.categories.find((item) => item.id === 'series');
        assert.equal(publicSeries.options.some((item) => item.id === hiddenId), false);
        const publicShapes = publicOptions.body.data.categories.find((item) => item.id === 'body-shape');
        assert.equal(publicShapes.options.some((item) => item.id === shape.body.data.id), true);

        const reactivated = await request(
            context.baseUrl,
            `/api/admin/custom-build/setup/series/options/${hiddenId}`,
            {
                method: 'PATCH',
                token: adminToken,
                body: { active: true, name: 'Hidden compat series', code: 'hidden-compat-series' },
            },
        );
        assert.equal(reactivated.status, 200);
        const allowed = await request(context.baseUrl, '/api/admin/custom-build/setup/body-shape/options', {
            method: 'POST',
            token: adminToken,
            body: {
                name: 'Uses restored series',
                code: 'uses-restored-series',
                compatibility: { seriesIds: ['hidden-compat-series'] },
            },
        });
        assert.equal(allowed.status, 201);
        const publicAgain = await request(context.baseUrl, '/api/custom-build/options');
        const seriesAgain = publicAgain.body.data.categories.find((item) => item.id === 'series');
        assert.equal(seriesAgain.options.some((item) => item.id === hiddenId), true);
    });

    test('renaming a series preserves id, code, compatibility, and related options', async () => {
        const created = await request(context.baseUrl, '/api/admin/custom-build/setup/series/options', {
            method: 'POST',
            token: adminToken,
            body: {
                name: 'PQ-BOUTIQUE',
                code: 'rename-preserve-series',
                isDefault: false,
                defaultForInstrumentTypeIds: ['electric-guitar'],
                attributes: { wizardId: 'rename-preserve-series', finish: 'nitro' },
                translations: {
                    en: { name: 'PQ-BOUTIQUE', description: 'Boutique line' },
                    vi: { name: 'PQ-BOUTIQUE', description: 'Dòng boutique' },
                },
                compatibility: { instrumentTypeIds: ['electric-guitar', 'bass'] },
            },
        });
        assert.equal(created.status, 201);
        const createdId = created.body.data.id;
        const sortOrder = created.body.data.sortOrder;

        const other = await request(context.baseUrl, '/api/admin/custom-build/setup/body-shape/options', {
            method: 'POST',
            token: adminToken,
            body: {
                name: 'Rename related shape',
                code: 'rename-related-shape',
                compatibility: { seriesIds: ['rename-preserve-series', 'solid-body'] },
            },
        });
        assert.equal(other.status, 201);
        const otherCompat = other.body.data.compatibility.seriesIds;

        const renamed = await request(
            context.baseUrl,
            `/api/admin/custom-build/setup/series/options/${createdId}`,
            {
                method: 'PATCH',
                token: adminToken,
                body: {
                    name: 'PQ-BOUTIQUE CUSTOM',
                    translations: {
                        en: { name: 'PQ-BOUTIQUE CUSTOM' },
                        vi: { name: 'PQ-BOUTIQUE CUSTOM' },
                    },
                },
            },
        );
        assert.equal(renamed.status, 200);
        assert.equal(renamed.body.data.id, createdId);
        assert.equal(renamed.body.data.code, 'rename-preserve-series');
        assert.equal(renamed.body.data.sortOrder, sortOrder);
        assert.equal(renamed.body.data.active, true);
        assert.equal(renamed.body.data.isDefault, false);
        assert.deepEqual(renamed.body.data.defaultForInstrumentTypeIds, ['electric-guitar']);
        assert.deepEqual(renamed.body.data.compatibility.instrumentTypeIds, ['electric-guitar', 'bass']);
        assert.equal(renamed.body.data.attributes.wizardId, 'rename-preserve-series');
        assert.equal(renamed.body.data.attributes.finish, 'nitro');
        assert.equal(renamed.body.data.translations.en.description, 'Boutique line');

        const related = await request(context.baseUrl, '/api/admin/custom-build/setup/body-shape', { token: adminToken });
        const relatedShape = related.body.data.options.find((item) => item.id === other.body.data.id);
        assert.deepEqual(relatedShape.compatibility.seriesIds, otherCompat);
    });

    test('existing option identifiers cannot be changed through the API', async () => {
        const created = await request(context.baseUrl, '/api/admin/custom-build/setup/series/options', {
            method: 'POST',
            token: adminToken,
            body: { name: 'Immutable series', code: 'immutable-series' },
        });
        assert.equal(created.status, 201);

        const rejectedCode = await request(
            context.baseUrl,
            `/api/admin/custom-build/setup/series/options/${created.body.data.id}`,
            {
                method: 'PATCH',
                token: adminToken,
                body: { code: 'changed-series', name: 'Immutable series' },
            },
        );
        assert.equal(rejectedCode.status, 422);
        assert.equal(rejectedCode.body.error.details[0].code, 'IMMUTABLE');

        const rejectedId = await request(
            context.baseUrl,
            `/api/admin/custom-build/setup/series/options/${created.body.data.id}`,
            {
                method: 'PATCH',
                token: adminToken,
                body: { id: 'series.other-id', name: 'Immutable series' },
            },
        );
        assert.equal(rejectedId.status, 422);
        assert.equal(rejectedId.body.error.details[0].code, 'IMMUTABLE');

        const stored = await request(context.baseUrl, '/api/admin/custom-build/setup/series', { token: adminToken });
        const option = stored.body.data.options.find((item) => item.id === created.body.data.id);
        assert.equal(option.code, 'immutable-series');
        assert.equal(option.id, created.body.data.id);
        assert.equal(option.name, 'Immutable series');
    });

    test('partial name update preserves omitted nested configuration', async () => {
        const created = await request(context.baseUrl, '/api/admin/custom-build/setup/series/options', {
            method: 'POST',
            token: adminToken,
            body: {
                name: 'Partial series',
                code: 'partial-series',
                icon: 'mark',
                isDefault: false,
                attributes: { wizardId: 'partial-series', origin: 'keep-me' },
                compatibility: { instrumentTypeIds: ['electric-guitar'] },
            },
        });
        assert.equal(created.status, 201);
        const before = created.body.data;

        const patched = await request(
            context.baseUrl,
            `/api/admin/custom-build/setup/series/options/${before.id}`,
            {
                method: 'PATCH',
                token: adminToken,
                body: { name: 'Partial series renamed' },
            },
        );
        assert.equal(patched.status, 200);
        assert.equal(patched.body.data.name, 'Partial series renamed');
        assert.equal(patched.body.data.code, 'partial-series');
        assert.equal(patched.body.data.icon, 'mark');
        assert.equal(patched.body.data.sortOrder, before.sortOrder);
        assert.deepEqual(patched.body.data.compatibility.instrumentTypeIds, ['electric-guitar']);
        assert.equal(patched.body.data.attributes.origin, 'keep-me');
        assert.equal(patched.body.data.attributes.wizardId, 'partial-series');
    });

    test('renaming one option does not rewrite another option compatibility', async () => {
        const first = await request(context.baseUrl, '/api/admin/custom-build/setup/body-shape/options', {
            method: 'POST',
            token: adminToken,
            body: {
                name: 'First isolation shape',
                code: 'isolation-shape-a',
                compatibility: { seriesIds: ['solid-body'] },
            },
        });
        const second = await request(context.baseUrl, '/api/admin/custom-build/setup/body-shape/options', {
            method: 'POST',
            token: adminToken,
            body: {
                name: 'Second isolation shape',
                code: 'isolation-shape-b',
                compatibility: { seriesIds: ['headless'] },
            },
        });
        assert.equal(first.status, 201);
        assert.equal(second.status, 201);

        const renamed = await request(
            context.baseUrl,
            `/api/admin/custom-build/setup/body-shape/options/${first.body.data.id}`,
            {
                method: 'PATCH',
                token: adminToken,
                body: { name: 'First isolation shape renamed' },
            },
        );
        assert.equal(renamed.status, 200);
        assert.deepEqual(renamed.body.data.compatibility.seriesIds, ['solid-body']);

        const listed = await request(context.baseUrl, '/api/admin/custom-build/setup/body-shape', { token: adminToken });
        const kept = listed.body.data.options.find((item) => item.id === second.body.data.id);
        assert.deepEqual(kept.compatibility.seriesIds, ['headless']);
        assert.equal(kept.name, 'Second isolation shape');
    });

    test('scale, strings, and radius accept body-shape compatibility and ignore leftover sibling rules', async () => {
        const { validateSelectionDependencies } = require('../services/customBuild/compatibility');
        const created = await request(context.baseUrl, '/api/admin/custom-build/setup/scale/options', {
            method: 'POST',
            token: adminToken,
            body: {
                name: 'Shape only scale',
                code: 'shape-only-scale',
                compatibility: { shapeIds: ['compact-modern'] },
            },
        });
        assert.equal(created.status, 201);
        assert.deepEqual(created.body.data.compatibility.shapeIds, ['compact-modern']);

        const withUpstream = await request(context.baseUrl, '/api/admin/custom-build/setup/scale/options', {
            method: 'POST',
            token: adminToken,
            body: {
                name: 'Typed scale',
                code: 'typed-scale',
                compatibility: {
                    instrumentTypeIds: ['electric-guitar'],
                    seriesIds: ['headless'],
                    shapeIds: ['compact-modern'],
                },
            },
        });
        assert.equal(withUpstream.status, 201);
        assert.deepEqual(withUpstream.body.data.compatibility.instrumentTypeIds, ['electric-guitar']);
        assert.deepEqual(withUpstream.body.data.compatibility.seriesIds, ['headless']);
        assert.deepEqual(withUpstream.body.data.compatibility.shapeIds, ['compact-modern']);

        const rejectedSibling = await request(context.baseUrl, '/api/admin/custom-build/setup/scale/options', {
            method: 'POST',
            token: adminToken,
            body: {
                name: 'Sibling scale',
                code: 'sibling-scale',
                compatibility: { shapeIds: ['compact-modern'], stringCounts: [6] },
            },
        });
        assert.equal(rejectedSibling.status, 422);
        assert.equal(rejectedSibling.body.error.details[0].code, 'FORWARD_COMPAT');

        const strings = await request(context.baseUrl, '/api/admin/custom-build/setup/string-count/options', {
            method: 'POST',
            token: adminToken,
            body: {
                name: 'Shape strings',
                code: 'shape-strings',
                attributes: { value: 9 },
                compatibility: { shapeIds: ['compact-modern'] },
            },
        });
        assert.equal(strings.status, 201);

        const radius = await request(context.baseUrl, '/api/admin/custom-build/setup/radius/options', {
            method: 'POST',
            token: adminToken,
            body: {
                name: 'Shape radius',
                code: 'shape-radius',
                compatibility: { shapeIds: ['compact-modern'] },
            },
        });
        assert.equal(radius.status, 201);

        const radiusDoc = await CustomBuildOption.findOne({ id: 'radius' });
        const storedRadius = radiusDoc.options.find((item) => item.id === radius.body.data.id);
        storedRadius.compatibility = {
            shapeIds: ['compact-modern'],
            scaleIds: ['25.5'],
            stringCounts: [6],
        };
        radiusDoc.markModified('options');
        await radiusDoc.save();

        const renamed = await request(
            context.baseUrl,
            `/api/admin/custom-build/setup/radius/options/${radius.body.data.id}`,
            {
                method: 'PATCH',
                token: adminToken,
                body: { name: 'Shape radius renamed' },
            },
        );
        assert.equal(renamed.status, 200);
        assert.deepEqual(renamed.body.data.compatibility.shapeIds, ['compact-modern']);
        assert.deepEqual(renamed.body.data.compatibility.scaleIds, ['25.5']);
        assert.deepEqual(renamed.body.data.compatibility.stringCounts, [6]);

        const listed = await request(context.baseUrl, '/api/admin/custom-build/setup', { token: adminToken });
        const catalog = { categories: listed.body.data.categories };
        const compact = catalog.categories.find((item) => item.id === 'body-shape')
            .options.find((item) => item.code === 'compact-modern' || item.id.endsWith('compact-modern'));
        const ok = validateSelectionDependencies({
            'body-shape': compact.id,
            scale: created.body.data.id,
            'string-count': strings.body.data.id,
            radius: radius.body.data.id,
        }, catalog);
        assert.equal(ok.length, 0);

        const doubleCut = catalog.categories.find((item) => item.id === 'body-shape')
            .options.find((item) => item.code === 'double-cut' || item.id.endsWith('double-cut'));
        const rejected = validateSelectionDependencies({
            'body-shape': doubleCut.id,
            scale: created.body.data.id,
        }, catalog);
        assert.equal(rejected.some((item) => item.code === 'INCOMPATIBLE_OPTION'), true);
    });
});

