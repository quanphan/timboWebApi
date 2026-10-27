const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { after, before, describe, test } = require('node:test');
const bcrypt = require('bcrypt');
const PageContent = require('../models/PageContent');
const User = require('../models/User');
const { request, startTestApp, stopTestApp } = require('./support/app');

let context;
let adminToken;
let customerToken;

const pngBytes = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x00,
]);

const sampleLocale = {
    title: 'About PhanQuan',
    sections: [
        {
            id: 'about-hero',
            type: 'hero',
            visible: true,
            title: 'From code to craft',
            subtitle: 'The story',
            body: 'A short lede.',
            layout: 'center',
        },
        {
            id: 'about-text',
            type: 'text',
            visible: true,
            title: 'Opening',
            body: 'Paragraph one.\n\nParagraph two.',
            layout: 'image-left',
        },
    ],
};

describe('page content', { concurrency: false }, () => {

before(async () => {
    context = await startTestApp();
    await User.create({
        email: 'pages-admin@example.com',
        name: 'Pages Admin',
        password: await bcrypt.hash('pages-admin-pass', 10),
        role: 'admin',
        admin: '1',
    });
    await User.create({
        email: 'pages-customer@example.com',
        name: 'Pages Customer',
        password: await bcrypt.hash('pages-customer-pass', 10),
        role: 'customer',
    });
    const adminLogin = await request(context.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: 'pages-admin@example.com', password: 'pages-admin-pass' },
    });
    const customerLogin = await request(context.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: 'pages-customer@example.com', password: 'pages-customer-pass' },
    });
    adminToken = adminLogin.body.data.accessToken;
    customerToken = customerLogin.body.data.accessToken;
});

after(async () => {
    await stopTestApp(context);
});

test('public visitors read published pages and never receive drafts', async () => {
    const emptyAbout = await request(context.baseUrl, '/api/pages/about');
    const emptyProcess = await request(context.baseUrl, '/api/pages/build-process');
    assert.equal(emptyAbout.status, 200);
    assert.equal(emptyAbout.body.data, null);
    assert.equal(emptyProcess.body.data, null);

    const unknown = await request(context.baseUrl, '/api/pages/home');
    assert.equal(unknown.status, 404);

    const draft = await request(context.baseUrl, '/api/admin/page-content/about/draft', {
        method: 'PUT',
        token: adminToken,
        body: { language: 'en', expectedRevision: 0, locale: sampleLocale },
    });
    assert.equal(draft.status, 200);
    assert.equal(draft.body.data.draft.en.title, 'About PhanQuan');
    assert.equal(draft.body.data.published, null);

    const stillPublic = await request(context.baseUrl, '/api/pages/about');
    assert.equal(stillPublic.body.data, null);

    const previewResponse = await fetch(`${context.baseUrl}/api/admin/page-content/about/preview`, {
        headers: { Authorization: `Bearer ${adminToken}` },
    });
    const previewBody = await previewResponse.json();
    assert.equal(previewResponse.status, 200);
    assert.equal(previewBody.data.preview, true);
    assert.equal(previewBody.data.locales.en.title, 'About PhanQuan');
    assert.match(String(previewResponse.headers.get('cache-control') || ''), /no-store/);

    const publicPreview = await request(context.baseUrl, '/api/admin/page-content/about/preview');
    assert.equal(publicPreview.status, 401);

    const published = await request(context.baseUrl, '/api/admin/page-content/about/publish', {
        method: 'POST',
        token: adminToken,
        body: { expectedRevision: draft.body.data.revision },
    });
    assert.equal(published.status, 200);
    assert.equal(Boolean(published.body.data.publishedAt), true);

    const live = await request(context.baseUrl, '/api/pages/about');
    assert.equal(live.status, 200);
    assert.equal(live.body.data.locales.en.title, 'About PhanQuan');
    assert.equal(live.body.data.draft, undefined);

    const laterDraft = await request(context.baseUrl, '/api/admin/page-content/about/draft', {
        method: 'PUT',
        token: adminToken,
        body: {
            language: 'en',
            expectedRevision: published.body.data.revision,
            locale: { title: 'Draft only', sections: sampleLocale.sections },
        },
    });
    assert.equal(laterDraft.status, 200);
    const unchanged = await request(context.baseUrl, '/api/pages/about');
    assert.equal(unchanged.body.data.locales.en.title, 'About PhanQuan');
});

test('vietnamese and english drafts stay independent', async () => {
    const en = await request(context.baseUrl, '/api/admin/page-content/build-process/draft', {
        method: 'PUT',
        token: adminToken,
        body: {
            language: 'en',
            expectedRevision: 0,
            locale: { title: 'Process EN', sections: sampleLocale.sections },
        },
    });
    const vi = await request(context.baseUrl, '/api/admin/page-content/build-process/draft', {
        method: 'PUT',
        token: adminToken,
        body: {
            language: 'vi',
            expectedRevision: en.body.data.revision,
            locale: { title: 'Quy trinh VI', sections: [{ id: 'hero-vi', type: 'hero', title: 'Viet', body: 'Mo ta' }] },
        },
    });
    assert.equal(vi.status, 200);
    assert.equal(vi.body.data.draft.en.title, 'Process EN');
    assert.equal(vi.body.data.draft.vi.title, 'Quy trinh VI');
    assert.equal(vi.body.data.draft.en.sections.length, 2);
    assert.equal(vi.body.data.draft.vi.sections.length, 1);
});

test('unauthenticated and customer users cannot use admin page content APIs', async () => {
    const anon = await request(context.baseUrl, '/api/admin/page-content/about');
    const customer = await request(context.baseUrl, '/api/admin/page-content/about', { token: customerToken });
    const customerWrite = await request(context.baseUrl, '/api/admin/page-content/about/draft', {
        method: 'PUT',
        token: customerToken,
        body: { language: 'en', locale: sampleLocale },
    });
    assert.equal(anon.status, 401);
    assert.equal(customer.status, 403);
    assert.equal(customerWrite.status, 403);
});

test('invalid types, unsafe html, and stale revisions are rejected', async () => {
    const missingRevision = await request(context.baseUrl, '/api/admin/page-content/about/draft', {
        method: 'PUT',
        token: adminToken,
        body: { language: 'en', locale: sampleLocale },
    });
    assert.equal(missingRevision.status, 422);

    const badType = await request(context.baseUrl, '/api/admin/page-content/about/draft', {
        method: 'PUT',
        token: adminToken,
        body: {
            language: 'en',
            expectedRevision: 0,
            locale: { title: 'x', sections: [{ type: 'script', body: '<script>alert(1)</script>' }] },
        },
    });
    assert.equal(badType.status, 422);

    const stored = await PageContent.findOne({ pageKey: 'about' });
    const unsafe = await request(context.baseUrl, '/api/admin/page-content/about/draft', {
        method: 'PUT',
        token: adminToken,
        body: {
            language: 'en',
            expectedRevision: stored.revision,
            locale: {
                title: 'Safe',
                sections: [{
                    id: 'cta-1',
                    type: 'cta',
                    title: '<b>Click</b>',
                    body: '<script>alert(1)</script>',
                    ctaLabel: 'Go',
                    ctaUrl: 'javascript:alert(1)',
                }],
            },
        },
    });
    assert.equal(unsafe.status, 422);

    const stripped = await request(context.baseUrl, '/api/admin/page-content/about/draft', {
        method: 'PUT',
        token: adminToken,
        body: {
            language: 'en',
            expectedRevision: stored.revision,
            locale: {
                title: 'Safe',
                sections: [{
                    id: 'cta-1',
                    type: 'cta',
                    title: '<b>Click</b>',
                    body: '<script>alert(1)</script>',
                    ctaLabel: 'Go',
                    ctaUrl: '/custom-build',
                }],
            },
        },
    });
    assert.equal(stripped.status, 200);
    assert.equal(stripped.body.data.draft.en.sections[0].title, 'Click');
    assert.equal(stripped.body.data.draft.en.sections[0].body, '');

    const stale = await request(context.baseUrl, '/api/admin/page-content/about/draft', {
        method: 'PUT',
        token: adminToken,
        body: {
            language: 'en',
            expectedRevision: stored.revision,
            locale: sampleLocale,
        },
    });
    assert.equal(stale.status, 409);

    const revert = await request(context.baseUrl, '/api/admin/page-content/about/revert', {
        method: 'POST',
        token: adminToken,
        body: { expectedRevision: stripped.body.data.revision },
    });
    assert.equal(revert.status, 200);
    assert.equal(revert.body.data.draft.en.title, 'About PhanQuan');
});

test('page image uploads require admin auth and reject fake files', async () => {
    const form = new FormData();
    form.append('file', new Blob([pngBytes], { type: 'image/png' }), 'cover.png');
    const anonymous = await fetch(`${context.baseUrl}/api/admin/uploads?scope=pages`, {
        method: 'POST',
        body: form,
    });
    assert.equal(anonymous.status, 401);

    const customerForm = new FormData();
    customerForm.append('file', new Blob([pngBytes], { type: 'image/png' }), 'cover.png');
    const customer = await fetch(`${context.baseUrl}/api/admin/uploads?scope=pages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${customerToken}` },
        body: customerForm,
    });
    assert.equal(customer.status, 403);

    const fakeForm = new FormData();
    fakeForm.append('file', new Blob([Buffer.from('not-an-image')], { type: 'image/png' }), 'note.png');
    const fake = await fetch(`${context.baseUrl}/api/admin/uploads?scope=pages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: fakeForm,
    });
    assert.equal(fake.status, 415);

    const okForm = new FormData();
    okForm.append('file', new Blob([pngBytes], { type: 'image/png' }), 'cover.png');
    const ok = await fetch(`${context.baseUrl}/api/admin/uploads?scope=pages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: okForm,
    });
    const payload = await ok.json();
    assert.equal(ok.status, 201);
    assert.match(payload.data.path, /^\/uploads\/pages\/[a-f0-9]{32}\.png$/);
    const filePath = path.join(context.uploadsDir, payload.data.path.replace(/^\/uploads\//, ''));
    assert.equal(fs.existsSync(filePath), true);

    const current = await PageContent.findOne({ pageKey: 'about' });
    const save = await request(context.baseUrl, '/api/admin/page-content/about/draft', {
        method: 'PUT',
        token: adminToken,
        body: {
            language: 'en',
            expectedRevision: current.revision,
            locale: {
                title: 'With image',
                sections: [{
                    id: 'img-1',
                    type: 'image',
                    image: payload.data.path,
                    imageAlt: 'Cover',
                }],
            },
        },
    });
    assert.equal(save.status, 200);
    assert.equal(save.body.data.draft.en.sections[0].image, payload.data.path);
    assert.equal(save.body.data.draft.en.sections[0].image.startsWith('/uploads/pages/'), true);

    const customBuildPath = await request(context.baseUrl, '/api/admin/page-content/about/draft', {
        method: 'PUT',
        token: adminToken,
        body: {
            language: 'en',
            expectedRevision: save.body.data.revision,
            locale: {
                title: 'Bad image',
                sections: [{
                    id: 'img-2',
                    type: 'image',
                    image: '/uploads/custom-build/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg',
                }],
            },
        },
    });
    assert.equal(customBuildPath.status, 422);
});

test('gallery sections keep image order and unused page files stay until an explicit delete', async () => {
    async function uploadPng() {
        const form = new FormData();
        form.append('file', new Blob([pngBytes], { type: 'image/png' }), 'cover.png');
        const response = await fetch(`${context.baseUrl}/api/admin/uploads?scope=pages`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${adminToken}` },
            body: form,
        });
        const payload = await response.json();
        assert.equal(response.status, 201);
        return payload.data.path;
    }

    const kept = await uploadPng();
    const orphan = await uploadPng();
    const galleryA = await uploadPng();
    const galleryB = await uploadPng();
    const about = await PageContent.findOne({ pageKey: 'about' });
    const saved = await request(context.baseUrl, '/api/admin/page-content/about/draft', {
        method: 'PUT',
        token: adminToken,
        body: {
            language: 'en',
            expectedRevision: about.revision,
            locale: {
                title: 'Gallery page',
                sections: [
                    { id: 'keep-image', type: 'image', image: kept, imageAlt: 'Keep' },
                    {
                        id: 'gallery-1',
                        type: 'gallery',
                        images: [
                            { path: galleryB, alt: 'Second' },
                            { path: galleryA, alt: 'First' },
                        ],
                    },
                ],
            },
        },
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.data.draft.en.sections[1].images[0].path, galleryB);
    assert.equal(saved.body.data.draft.en.sections[1].images[1].alt, 'First');

    const published = await request(context.baseUrl, '/api/admin/page-content/about/publish', {
        method: 'POST',
        token: adminToken,
        body: { expectedRevision: saved.body.data.revision },
    });
    assert.equal(published.status, 200);
    const live = await request(context.baseUrl, '/api/pages/about');
    assert.equal(live.body.data.locales.en.sections[1].images.length, 2);

    const dryRun = await request(context.baseUrl, '/api/admin/page-content/media/orphans', { token: adminToken });
    assert.equal(dryRun.status, 200);
    assert.equal(dryRun.body.data.dryRun, true);
    const orphanPaths = dryRun.body.data.orphans.map((item) => item.path);
    assert.equal(orphanPaths.includes(orphan), true);
    assert.equal(orphanPaths.includes(kept), false);
    assert.equal(orphanPaths.includes(galleryA), false);

    const anonList = await request(context.baseUrl, '/api/admin/page-content/media/orphans');
    const customerDelete = await request(context.baseUrl, '/api/admin/page-content/media/orphans/delete', {
        method: 'POST',
        token: customerToken,
        body: { confirm: true, paths: [orphan] },
    });
    const noConfirm = await request(context.baseUrl, '/api/admin/page-content/media/orphans/delete', {
        method: 'POST',
        token: adminToken,
        body: { paths: [orphan] },
    });
    assert.equal(anonList.status, 401);
    assert.equal(customerDelete.status, 403);
    assert.equal(noConfirm.status, 422);

    const keepReferenced = await request(context.baseUrl, '/api/admin/page-content/media/orphans/delete', {
        method: 'POST',
        token: adminToken,
        body: { confirm: true, paths: [kept] },
    });
    assert.equal(keepReferenced.status, 200);
    assert.equal(keepReferenced.body.data.deleted.length, 0);
    assert.equal(fs.existsSync(path.join(context.uploadsDir, kept.replace(/^\/uploads\//, ''))), true);

    const deleted = await request(context.baseUrl, '/api/admin/page-content/media/orphans/delete', {
        method: 'POST',
        token: adminToken,
        body: { confirm: true, paths: [orphan] },
    });
    assert.equal(deleted.status, 200);
    assert.equal(deleted.body.data.deleted[0].path, orphan);
    assert.equal(fs.existsSync(path.join(context.uploadsDir, orphan.replace(/^\/uploads\//, ''))), false);
    assert.equal(fs.existsSync(path.join(context.uploadsDir, kept.replace(/^\/uploads\//, ''))), true);
});

});
