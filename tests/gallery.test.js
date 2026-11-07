const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { after, before, test } = require('node:test');
const bcrypt = require('bcrypt');
const GalleryPost = require('../models/GalleryPost');
const User = require('../models/User');
const { request, startTestApp, stopTestApp } = require('./support/app');
const { contentTypeForUpload } = require('../utils/uploadMime');

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

test('upload MIME types use browser-safe image and video types', () => {
    assert.equal(contentTypeForUpload('clip.mp4'), 'video/mp4');
    assert.equal(contentTypeForUpload('clip.webm'), 'video/webm');
    assert.equal(contentTypeForUpload('photo.jpg'), 'image/jpeg');
    assert.equal(contentTypeForUpload('photo.webp'), 'image/webp');
    assert.equal(contentTypeForUpload('photo.png'), 'image/png');
});

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
    assert.match(String(fileUrl.headers.get('content-type') || ''), /^image\/png/i);

    const videoUrl = await fetch(`${context.baseUrl}${video.body.data.path}`);
    assert.equal(videoUrl.status, 200);
    assert.match(String(videoUrl.headers.get('content-type') || ''), /^video\/mp4/i);
    const videoRange = await fetch(`${context.baseUrl}${video.body.data.path}`, {
        headers: { Range: 'bytes=0-1' },
    });
    assert.equal(videoRange.status, 206);
    assert.match(String(videoRange.headers.get('content-range') || ''), /^bytes 0-1\//i);
    assert.match(String(videoRange.headers.get('content-type') || ''), /^video\/mp4/i);

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

test('gallery posts reject more than 5 images or 5 videos and allow mixed media', async () => {
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

    const sixVideos = Array.from({ length: 6 }, (_, index) => ({
        ...video.body.data,
        id: `vid${index}`,
    }));
    const tooManyVideos = await request(context.baseUrl, '/api/admin/gallery', {
        method: 'POST',
        token: adminToken,
        body: { title: 'Too many clips', category: 'video', media: sixVideos },
    });
    assert.equal(tooManyVideos.status, 422);
    assert.equal(tooManyVideos.body.error.details[0].code, 'TOO_MANY_VIDEOS');

    const mixed = await request(context.baseUrl, '/api/admin/gallery', {
        method: 'POST',
        token: adminToken,
        body: {
            title: 'Mixed',
            category: 'process',
            status: 'published',
            media: [image.body.data, video.body.data],
        },
    });
    assert.equal(mixed.status, 201);
    assert.equal(mixed.body.data.media.length, 2);
});

test('gallery posts persist original YouTube, Shorts, and Facebook URLs through save, get, and edit', async () => {
    const cases = [
        { id: 'yt-watch', title: 'YouTube watch', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', provider: 'youtube', videoId: 'dQw4w9WgXcQ' },
        { id: 'yt-shorts', title: 'YouTube shorts', url: 'https://www.youtube.com/shorts/dQw4w9WgXcQ', provider: 'youtube', videoId: 'dQw4w9WgXcQ' },
        { id: 'fb-video', title: 'Facebook video', url: 'https://www.facebook.com/watch/?v=123456789012345', provider: 'facebook', videoId: '123456789012345' },
        { id: 'fb-reel', title: 'Facebook reel', url: 'https://www.facebook.com/reel/987654321098765', provider: 'facebook', videoId: '987654321098765' },
        { id: 'fb-page', title: 'Facebook page video', url: 'https://www.facebook.com/PhanQuanGuitars/videos/123456789012345/', provider: 'facebook', videoId: '123456789012345' },
        { id: 'fb-watch', title: 'fb.watch', url: 'https://fb.watch/abcDE12/', provider: 'facebook', videoId: 'abcDE12' },
    ];

    for (const item of cases) {
        const created = await request(context.baseUrl, '/api/admin/gallery', {
            method: 'POST',
            token: adminToken,
            body: {
                title: item.title,
                category: 'video',
                status: 'published',
                media: [{ id: item.id, kind: 'video', sourceUrl: item.url, url: item.url }],
            },
        });
        assert.equal(created.status, 201, item.title);
        assert.equal(created.body.data.media[0].sourceUrl, item.url);
        assert.equal(created.body.data.media[0].url, item.url);
        assert.equal(created.body.data.media[0].provider, item.provider);
        assert.equal(created.body.data.media[0].videoId, item.videoId);

        const publicPost = await request(context.baseUrl, `/api/gallery/${created.body.data.id}`);
        assert.equal(publicPost.status, 200);
        assert.equal(publicPost.body.data.media[0].sourceUrl, item.url);
        assert.equal(publicPost.body.data.media[0].provider, item.provider);

        const adminGet = await request(context.baseUrl, `/api/admin/gallery/${created.body.data.id}`, {
            token: adminToken,
        });
        assert.equal(adminGet.body.data.media[0].sourceUrl, item.url);

        const renamed = await request(context.baseUrl, `/api/admin/gallery/${created.body.data.id}`, {
            method: 'PATCH',
            token: adminToken,
            body: {
                title: `${item.title} updated`,
                media: adminGet.body.data.media,
            },
        });
        assert.equal(renamed.status, 200);
        assert.equal(renamed.body.data.title, `${item.title} updated`);
        assert.equal(renamed.body.data.media[0].sourceUrl, item.url);

        const titleOnly = await request(context.baseUrl, `/api/admin/gallery/${created.body.data.id}`, {
            method: 'PATCH',
            token: adminToken,
            body: { excerpt: 'Keep the video' },
        });
        assert.equal(titleOnly.body.data.media[0].sourceUrl, item.url);
    }

    const posterImage = await upload(adminToken, pngBytes, 'image/png', 'fb-poster.png');
    assert.equal(posterImage.status, 201);
    const withPoster = await request(context.baseUrl, '/api/admin/gallery', {
        method: 'POST',
        token: adminToken,
        body: {
            title: 'Facebook with poster',
            category: 'video',
            status: 'published',
            media: [{
                id: 'fb-poster',
                kind: 'video',
                sourceUrl: 'https://www.facebook.com/reel/987654321098765',
                url: 'https://www.facebook.com/reel/987654321098765',
                thumbnail: posterImage.body.data.path,
            }],
        },
    });
    assert.equal(withPoster.status, 201);
    assert.equal(withPoster.body.data.media[0].provider, 'facebook');
    assert.equal(withPoster.body.data.media[0].thumbnail, posterImage.body.data.path);
    const publicPoster = await request(context.baseUrl, `/api/gallery/${withPoster.body.data.id}`);
    assert.equal(publicPoster.body.data.media[0].thumbnail, posterImage.body.data.path);
    const editedPoster = await request(context.baseUrl, `/api/admin/gallery/${withPoster.body.data.id}`, {
        method: 'PATCH',
        token: adminToken,
        body: {
            title: 'Facebook with poster updated',
            media: publicPoster.body.data.media,
        },
    });
    assert.equal(editedPoster.status, 200);
    assert.equal(editedPoster.body.data.media[0].thumbnail, posterImage.body.data.path);
    assert.equal(editedPoster.body.data.media[0].sourceUrl, 'https://www.facebook.com/reel/987654321098765');

    const iframe = await request(context.baseUrl, '/api/admin/gallery', {
        method: 'POST',
        token: adminToken,
        body: {
            title: 'Iframe html',
            category: 'video',
            media: [{ id: 'iframe', kind: 'video', url: '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>' }],
        },
    });
    assert.equal(iframe.status, 422);

    const legacy = await GalleryPost.create({
        title: 'Legacy youtube path',
        category: 'video',
        status: 'published',
        media: [{
            id: 'legacy-yt',
            kind: 'video',
            path: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        }],
    });
    const legacyPublic = await request(context.baseUrl, `/api/gallery/${legacy._id}`);
    assert.equal(legacyPublic.status, 200);
    assert.equal(legacyPublic.body.data.media[0].provider, 'youtube');
    assert.equal(legacyPublic.body.data.media[0].sourceUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    assert.equal(legacyPublic.body.data.media[0].videoId, 'dQw4w9WgXcQ');
});

test('gallery posts accept YouTube, Vimeo, and direct video URLs and reject invalid ones', async () => {
    const youtube = await request(context.baseUrl, '/api/admin/gallery', {
        method: 'POST',
        token: adminToken,
        body: {
            title: 'Live session',
            category: 'video',
            status: 'published',
            media: [{
                id: 'yt1',
                kind: 'video',
                url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            }],
        },
    });
    assert.equal(youtube.status, 201);
    assert.equal(youtube.body.data.media[0].provider, 'youtube');
    assert.equal(youtube.body.data.media[0].videoId, 'dQw4w9WgXcQ');

    const publicPost = await request(context.baseUrl, `/api/gallery/${youtube.body.data.id}`);
    assert.equal(publicPost.status, 200);
    assert.equal(publicPost.body.data.media[0].provider, 'youtube');

    const vimeo = await request(context.baseUrl, '/api/admin/gallery', {
        method: 'POST',
        token: adminToken,
        body: {
            title: 'Workshop film',
            category: 'video',
            media: [{ id: 'vm1', kind: 'video', url: 'https://vimeo.com/123456789' }],
        },
    });
    assert.equal(vimeo.status, 201);
    assert.equal(vimeo.body.data.media[0].provider, 'vimeo');

    const direct = await request(context.baseUrl, '/api/admin/gallery', {
        method: 'POST',
        token: adminToken,
        body: {
            title: 'Direct clip',
            category: 'video',
            media: [{ id: 'd1', kind: 'video', url: 'https://cdn.example.com/session.mp4' }],
        },
    });
    assert.equal(direct.status, 201);
    assert.equal(direct.body.data.media[0].provider, 'direct');

    const invalid = await request(context.baseUrl, '/api/admin/gallery', {
        method: 'POST',
        token: adminToken,
        body: {
            title: 'Bad url',
            category: 'video',
            media: [{ id: 'bad', kind: 'video', url: 'javascript:alert(1)' }],
        },
    });
    assert.equal(invalid.status, 422);

    const page = await request(context.baseUrl, '/api/admin/gallery', {
        method: 'POST',
        token: adminToken,
        body: {
            title: 'Not a video file',
            category: 'video',
            media: [{ id: 'page', kind: 'video', url: 'https://example.com/about' }],
        },
    });
    assert.equal(page.status, 422);
});

test('published gallery posts appear on home only when showAtHome is saved as true', async () => {
    const image = await upload(adminToken, pngBytes, 'image/png', 'home.png');
    assert.equal(image.status, 201);
    const created = await request(context.baseUrl, '/api/admin/gallery', {
        method: 'POST',
        token: adminToken,
        body: {
            title: 'Bench light',
            excerpt: 'A quiet morning in the shop.',
            category: 'process',
            status: 'published',
            media: [image.body.data],
        },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.showAtHome, false);

    const hidden = await request(context.baseUrl, '/api/gallery?showAtHome=true');
    assert.equal(hidden.status, 200);
    assert.equal(hidden.body.data.some((item) => item.id === created.body.data.id), false);

    const enabled = await request(context.baseUrl, `/api/admin/gallery/${created.body.data.id}`, {
        method: 'PATCH',
        token: adminToken,
        body: { showAtHome: true },
    });
    assert.equal(enabled.status, 200);
    assert.equal(enabled.body.data.showAtHome, true);

    const home = await request(context.baseUrl, '/api/gallery?showAtHome=true');
    assert.equal(home.body.data.some((item) => item.id === created.body.data.id), true);
    assert.equal(home.body.data.find((item) => item.id === created.body.data.id).excerpt, 'A quiet morning in the shop.');

    const detail = await request(context.baseUrl, `/api/gallery/${created.body.data.id}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.title, 'Bench light');

    const disabled = await request(context.baseUrl, `/api/admin/gallery/${created.body.data.id}`, {
        method: 'PATCH',
        token: adminToken,
        body: { showAtHome: false },
    });
    assert.equal(disabled.body.data.showAtHome, false);
    const after = await request(context.baseUrl, '/api/gallery?showAtHome=true');
    assert.equal(after.body.data.some((item) => item.id === created.body.data.id), false);

    const draftHome = await request(context.baseUrl, '/api/admin/gallery', {
        method: 'POST',
        token: adminToken,
        body: {
            title: 'Unpublished home draft',
            category: 'process',
            status: 'draft',
            showAtHome: true,
        },
    });
    assert.equal(draftHome.status, 201);
    const publicHome = await request(context.baseUrl, '/api/gallery?showAtHome=true');
    assert.equal(publicHome.body.data.some((item) => item.id === draftHome.body.data.id), false);
});

test('art-of-making is a valid gallery category and stays independent from showAtHome', async () => {
    const created = await request(context.baseUrl, '/api/admin/gallery', {
        method: 'POST',
        token: adminToken,
        body: {
            title: 'From the bench',
            excerpt: 'Craft in progress.',
            category: 'art-of-making',
            status: 'published',
        },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.category, 'art-of-making');
    assert.equal(created.body.data.showAtHome, false);

    const filtered = await request(context.baseUrl, '/api/gallery?category=art-of-making');
    assert.equal(filtered.status, 200);
    assert.equal(filtered.body.data.some((item) => item.id === created.body.data.id), true);

    const processOnly = await request(context.baseUrl, '/api/gallery?category=process');
    assert.equal(processOnly.body.data.some((item) => item.id === created.body.data.id), false);

    const home = await request(context.baseUrl, '/api/gallery?showAtHome=true');
    assert.equal(home.body.data.some((item) => item.id === created.body.data.id), false);

    const enabled = await request(context.baseUrl, `/api/admin/gallery/${created.body.data.id}`, {
        method: 'PATCH',
        token: adminToken,
        body: { showAtHome: true },
    });
    assert.equal(enabled.status, 200);
    assert.equal(enabled.body.data.category, 'art-of-making');
    assert.equal(enabled.body.data.showAtHome, true);

    const otherHome = await request(context.baseUrl, '/api/admin/gallery', {
        method: 'POST',
        token: adminToken,
        body: {
            title: 'Finish detail',
            category: 'finish',
            status: 'published',
            showAtHome: true,
        },
    });
    assert.equal(otherHome.status, 201);
    assert.equal(otherHome.body.data.category, 'finish');
    const homeBoth = await request(context.baseUrl, '/api/gallery?showAtHome=true');
    assert.equal(homeBoth.body.data.some((item) => item.id === created.body.data.id), true);
    assert.equal(homeBoth.body.data.some((item) => item.id === otherHome.body.data.id), true);
});
