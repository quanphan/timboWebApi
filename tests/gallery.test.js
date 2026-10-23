const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { after, before, test } = require('node:test');
const bcrypt = require('bcrypt');
const GalleryPost = require('../models/GalleryPost');
const User = require('../models/User');
const { request, startTestApp, stopTestApp } = require('./support/app');

let context;
let adminToken;
let customerToken;

const pngBytes = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x00,
]);

const mp4Bytes = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18]),
    Buffer.from('ftypisom'),
    Buffer.alloc(16),
]);

before(async () => {
    context = await startTestApp();
    await User.create({
        email: 'gallery-admin@example.com',
        name: 'Gallery Admin',
        password: await bcrypt.hash('gallery-admin-pass', 10),
        role: 'admin',
        admin: '1',
    });
    await User.create({
        email: 'gallery-customer@example.com',
        name: 'Gallery Customer',
        password: await bcrypt.hash('gallery-customer-pass', 10),
        role: 'customer',
    });
    const adminLogin = await request(context.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: 'gallery-admin@example.com', password: 'gallery-admin-pass' },
    });
    const customerLogin = await request(context.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: 'gallery-customer@example.com', password: 'gallery-customer-pass' },
    });
    adminToken = adminLogin.body.data.accessToken;
    customerToken = customerLogin.body.data.accessToken;
});

after(async () => {
    await stopTestApp(context);
});

async function upload(token, bytes, type, filename) {
    const form = new FormData();
    form.append('file', new Blob([bytes], { type }), filename);
    const headers = {};
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await fetch(`${context.baseUrl}/api/admin/gallery/uploads`, {
        method: 'POST',
        headers,
        body: form,
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
}

test('public gallery is empty until a post is published', async () => {
    const response = await request(context.baseUrl, '/api/gallery');
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.data, []);
});

test('unauthorized users cannot upload or write gallery posts', async () => {
    const anonymous = await upload(null, pngBytes, 'image/png', 'cover.png');
    const customer = await upload(customerToken, pngBytes, 'image/png', 'cover.png');
    const create = await request(context.baseUrl, '/api/admin/gallery', {
        method: 'POST',
        token: customerToken,
        body: { title: 'Hidden', category: 'process', status: 'published' },
    });
    assert.equal(anonymous.status, 401);
    assert.equal(customer.status, 403);
    assert.equal(create.status, 403);
});

test('admin can upload gallery files, save drafts, publish, and delete files', async () => {
    const image = await upload(adminToken, pngBytes, 'image/png', 'bench.png');
    const video = await upload(adminToken, mp4Bytes, 'video/mp4', 'setup.mp4');
    assert.equal(image.status, 201);
    assert.equal(video.status, 201);
    assert.match(image.body.data.path, /^\/uploads\/gallery\/images\/[a-f0-9]{32}\.png$/);
    assert.match(video.body.data.path, /^\/uploads\/gallery\/videos\/[a-f0-9]{32}\.mp4$/);
    assert.equal(image.body.data.path.includes('..'), false);

    const imageFile = path.join(context.uploadsDir, image.body.data.path.replace('/uploads/', ''));
    assert.equal(fs.existsSync(imageFile), true);

    const draft = await request(context.baseUrl, '/api/admin/gallery', {
        method: 'POST',
        token: adminToken,
        body: {
            title: 'Workshop bench',
            excerpt: 'A first look',
            category: 'process',
            status: 'draft',
            media: [image.body.data],
            coverMediaId: image.body.data.id,
        },
    });
    assert.equal(draft.status, 201);
    assert.equal(draft.body.data.status, 'draft');
    const publicList = await request(context.baseUrl, '/api/gallery');
    assert.equal(publicList.body.data.length, 0);
    const publicDetail = await request(context.baseUrl, `/api/gallery/${draft.body.data.id}`);
    assert.equal(publicDetail.status, 404);

    const published = await request(context.baseUrl, `/api/admin/gallery/${draft.body.data.id}`, {
        method: 'PATCH',
        token: adminToken,
        body: { status: 'published' },
    });
    assert.equal(published.status, 200);
    assert.equal(published.body.data.status, 'published');
    const listed = await request(context.baseUrl, '/api/gallery');
    assert.equal(listed.body.data.length, 1);
    assert.equal(listed.body.data[0].title, 'Workshop bench');
    assert.equal(listed.body.data[0].status, undefined);
    assert.equal(listed.body.data[0].updatedBy, undefined);
    assert.equal(listed.body.data[0].cover.url, image.body.data.path);

    const fileUrl = await fetch(`${context.baseUrl}${image.body.data.path}`);
    assert.equal(fileUrl.status, 200);

    const trimmed = await request(context.baseUrl, `/api/admin/gallery/${draft.body.data.id}`, {
        method: 'PATCH',
        token: adminToken,
        body: { media: [video.body.data], coverMediaId: video.body.data.id },
    });
    assert.equal(trimmed.status, 200);
    assert.equal(fs.existsSync(imageFile), false);

    const removed = await request(context.baseUrl, `/api/admin/gallery/${draft.body.data.id}`, {
        method: 'DELETE',
        token: adminToken,
    });
    assert.equal(removed.status, 200);
    assert.equal(await GalleryPost.countDocuments(), 0);
    const videoFile = path.join(context.uploadsDir, video.body.data.path.replace('/uploads/', ''));
    assert.equal(fs.existsSync(videoFile), false);
});

test('gallery upload rejects a fake image and a path outside the gallery folder', async () => {
    const fake = await upload(adminToken, Buffer.from('not-an-image'), 'image/png', 'x.png');
    assert.equal(fake.status, 415);
    const create = await request(context.baseUrl, '/api/admin/gallery', {
        method: 'POST',
        token: adminToken,
        body: {
            title: 'Unsafe',
            category: 'process',
            media: [{ id: 'abc', kind: 'image', path: '/uploads/../etc/passwd' }],
        },
    });
    assert.equal(create.status, 422);
});

test('gallery posts reject more than 5 images, a second video, and mixed media', async () => {
    const image = await upload(adminToken, pngBytes, 'image/png', 'one.png');
    const video = await upload(adminToken, mp4Bytes, 'video/mp4', 'clip.mp4');
    assert.equal(image.status, 201);
    assert.equal(video.status, 201);

    const sixImages = Array.from({ length: 6 }, (_, index) => ({
        ...image.body.data,
        id: `img${index}`,
    }));
    const tooManyImages = await request(context.baseUrl, '/api/admin/gallery', {
        method: 'POST',
        token: adminToken,
        body: { title: 'Too many photos', category: 'process', media: sixImages },
    });
    assert.equal(tooManyImages.status, 422);
    assert.equal(tooManyImages.body.error.details[0].code, 'TOO_MANY_IMAGES');

    const twoVideos = [
        { ...video.body.data, id: 'vid0' },
        { ...video.body.data, id: 'vid1' },
    ];
    const tooManyVideos = await request(context.baseUrl, '/api/admin/gallery', {
        method: 'POST',
        token: adminToken,
        body: { title: 'Too many clips', category: 'video', media: twoVideos },
    });
    assert.equal(tooManyVideos.status, 422);
    assert.equal(tooManyVideos.body.error.details[0].code, 'TOO_MANY_VIDEOS');

    const mixed = await request(context.baseUrl, '/api/admin/gallery', {
        method: 'POST',
        token: adminToken,
        body: {
            title: 'Mixed',
            category: 'process',
            media: [image.body.data, video.body.data],
        },
    });
    assert.equal(mixed.status, 422);
    assert.equal(mixed.body.error.details[0].code, 'MIXED_MEDIA');
});
