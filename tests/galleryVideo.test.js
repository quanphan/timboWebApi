const assert = require('node:assert/strict');
const { test } = require('node:test');
const { parseGalleryVideoUrl } = require('../utils/galleryVideo');

test('parseGalleryVideoUrl keeps original YouTube, Shorts, and Facebook URLs', () => {
    const youtube = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    const parsedYoutube = parseGalleryVideoUrl(youtube);
    assert.equal(parsedYoutube.ok, true);
    assert.equal(parsedYoutube.provider, 'youtube');
    assert.equal(parsedYoutube.videoId, 'dQw4w9WgXcQ');
    assert.equal(parsedYoutube.sourceUrl, youtube);

    const shorts = 'https://www.youtube.com/shorts/dQw4w9WgXcQ';
    const parsedShorts = parseGalleryVideoUrl(shorts);
    assert.equal(parsedShorts.ok, true);
    assert.equal(parsedShorts.sourceUrl, shorts);

    const facebook = 'https://www.facebook.com/watch/?v=123456789012345';
    const parsedFacebook = parseGalleryVideoUrl(facebook);
    assert.equal(parsedFacebook.ok, true);
    assert.equal(parsedFacebook.provider, 'facebook');
    assert.equal(parsedFacebook.sourceUrl, facebook);

    const reel = 'https://www.facebook.com/reel/987654321098765';
    const parsedReel = parseGalleryVideoUrl(reel);
    assert.equal(parsedReel.ok, true);
    assert.equal(parsedReel.provider, 'facebook');
    assert.equal(parsedReel.videoId, '987654321098765');
    assert.equal(parsedReel.sourceUrl, reel);

    const pageVideo = 'https://www.facebook.com/PhanQuanGuitars/videos/123456789012345/';
    const parsedPage = parseGalleryVideoUrl(pageVideo);
    assert.equal(parsedPage.ok, true);
    assert.equal(parsedPage.sourceUrl, pageVideo);
    assert.equal(parsedPage.videoId, '123456789012345');

    const watchShort = 'https://fb.watch/abcDE12/';
    const parsedWatch = parseGalleryVideoUrl(watchShort);
    assert.equal(parsedWatch.ok, true);
    assert.equal(parsedWatch.provider, 'facebook');
    assert.equal(parsedWatch.sourceUrl, watchShort);
    assert.equal(parsedWatch.videoId, 'abcDE12');

    assert.equal(parseGalleryVideoUrl('<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>').ok, false);
    assert.equal(parseGalleryVideoUrl(facebook, { expectedProvider: 'youtube' }).code, 'PROVIDER_MISMATCH');
});
