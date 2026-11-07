const YOUTUBE_ID = /^[a-zA-Z0-9_-]{11}$/;
const VIMEO_ID = /^\d{6,12}$/;
const IMAGE_PATH = /\.(jpe?g|png|webp|gif)(\?|#|$)/i;
const DIRECT_VIDEO = /\.(mp4|webm)(\?|#|$)/i;
const FACEBOOK_HOSTS = new Set(['facebook.com', 'm.facebook.com', 'web.facebook.com', 'fb.com', 'fb.watch']);
const YOUTUBE_HOSTS = new Set(['youtu.be', 'youtube.com', 'm.youtube.com', 'youtube-nocookie.com']);
const VIMEO_HOSTS = new Set(['vimeo.com', 'player.vimeo.com']);

function parseHttpUrl(raw) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return null;
    let parsed;
    try {
        parsed = new URL(trimmed);
    } catch {
        return null;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed;
}

function hostOf(parsed) {
    return parsed.hostname.replace(/^www\./i, '').toLowerCase();
}

function youtubeFrom(id, sourceUrl) {
    return {
        ok: true,
        provider: 'youtube',
        videoId: id,
        url: sourceUrl,
        sourceUrl,
        thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    };
}

function parseYouTube(parsed, sourceUrl) {
    const host = hostOf(parsed);
    if (!YOUTUBE_HOSTS.has(host)) return null;
    let id = '';
    if (host === 'youtu.be') {
        id = parsed.pathname.split('/').filter(Boolean)[0] || '';
    } else {
        id = parsed.searchParams.get('v') || '';
        const parts = parsed.pathname.split('/').filter(Boolean);
        if (!id && ['embed', 'shorts', 'live', 'v'].includes(parts[0])) id = parts[1] || '';
    }
    id = String(id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 11);
    if (!YOUTUBE_ID.test(id)) return { ok: false, code: 'INVALID_VIDEO_URL' };
    return youtubeFrom(id, sourceUrl);
}

function parseVimeo(parsed, sourceUrl) {
    const host = hostOf(parsed);
    if (!VIMEO_HOSTS.has(host)) return null;
    const parts = parsed.pathname.split('/').filter(Boolean);
    const id =
        host === 'player.vimeo.com' && parts[0] === 'video'
            ? parts[1] || ''
            : [...parts].reverse().find((part) => VIMEO_ID.test(part)) || '';
    if (!VIMEO_ID.test(id)) return { ok: false, code: 'INVALID_VIDEO_URL' };
    return {
        ok: true,
        provider: 'vimeo',
        videoId: id,
        url: sourceUrl,
        sourceUrl,
        thumbnail: '',
    };
}

const FACEBOOK_ID = /^(PFBID[a-zA-Z0-9]+|\d{8,}|[A-Za-z0-9_-]{5,})$/;
const FACEBOOK_RESERVED = new Set(['watch', 'videos', 'reel', 'reels', 'video', 'share', 'plugins', 'video.php']);

function isFacebookToken(value) {
    const token = String(value || '');
    if (!token || FACEBOOK_RESERVED.has(token.toLowerCase())) return false;
    return FACEBOOK_ID.test(token);
}

function facebookVideoId(parsed) {
    const parts = parsed.pathname.split('/').filter(Boolean);
    const fromQuery = parsed.searchParams.get('v') || parsed.searchParams.get('reel_id') || '';
    if (isFacebookToken(fromQuery)) return fromQuery;
    for (let index = 0; index < parts.length; index += 1) {
        const part = parts[index].toLowerCase();
        const next = parts[index + 1] || '';
        if (['videos', 'reel', 'reels', 'video', 'v', 'r'].includes(part) && isFacebookToken(next)) {
            return next;
        }
    }
    if (hostOf(parsed) === 'fb.watch' && isFacebookToken(parts[0] || '')) return parts[0];
    const last = parts[parts.length - 1] || '';
    return isFacebookToken(last) ? last : '';
}

function isFacebookVideoPath(parsed) {
    const host = hostOf(parsed);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (host === 'fb.watch') return isFacebookToken(parts[0] || '');
    const path = parsed.pathname.toLowerCase();
    if (/\/video\.php$/i.test(path)) return isFacebookToken(parsed.searchParams.get('v') || '');
    if (parts[0] && parts[0].toLowerCase() === 'watch') return isFacebookToken(parsed.searchParams.get('v') || '');
    for (let index = 0; index < parts.length; index += 1) {
        const part = parts[index].toLowerCase();
        const next = parts[index + 1] || '';
        if (['videos', 'reel', 'reels', 'video', 'v', 'r'].includes(part) && isFacebookToken(next)) return true;
    }
    return false;
}

function parseFacebook(parsed, sourceUrl) {
    const host = hostOf(parsed);
    if (!FACEBOOK_HOSTS.has(host)) return null;
    if (parsed.pathname.toLowerCase().includes('/plugins/video.php')) {
        const nested = parsed.searchParams.get('href');
        const nestedParsed = parseHttpUrl(nested);
        if (!nestedParsed || nestedParsed.pathname.toLowerCase().includes('/plugins/video.php')) {
            return { ok: false, code: 'INVALID_VIDEO_URL' };
        }
        return parseFacebook(nestedParsed, nested) || { ok: false, code: 'UNSUPPORTED_VIDEO_URL' };
    }
    if (!isFacebookVideoPath(parsed)) return { ok: false, code: 'UNSUPPORTED_VIDEO_URL' };
    return {
        ok: true,
        provider: 'facebook',
        videoId: facebookVideoId(parsed),
        url: sourceUrl,
        sourceUrl,
        thumbnail: '',
    };
}

function parseGalleryVideoUrl(raw, { expectedProvider } = {}) {
    const sourceUrl = String(raw || '').trim();
    if (!sourceUrl) return { ok: false, code: 'VIDEO_URL_REQUIRED' };
    if (/<\s*iframe[\s>]/i.test(sourceUrl) || /<\s*script[\s>]/i.test(sourceUrl)) {
        return { ok: false, code: 'UNSUPPORTED_VIDEO_URL' };
    }
    const parsed = parseHttpUrl(sourceUrl);
    if (!parsed) return { ok: false, code: 'INVALID_VIDEO_URL' };

    const detected = parseYouTube(parsed, sourceUrl) || parseFacebook(parsed, sourceUrl) || parseVimeo(parsed, sourceUrl);
    if (detected) {
        if (detected.ok === false) return detected;
        const expected = expectedProvider && expectedProvider !== 'auto' ? expectedProvider : '';
        if (expected && detected.provider !== expected) return { ok: false, code: 'PROVIDER_MISMATCH' };
        return detected;
    }

    if (DIRECT_VIDEO.test(parsed.pathname)) {
        if (expectedProvider && expectedProvider !== 'auto' && expectedProvider !== 'direct') {
            return { ok: false, code: 'PROVIDER_MISMATCH' };
        }
        return {
            ok: true,
            provider: 'direct',
            videoId: '',
            url: sourceUrl,
            sourceUrl,
            thumbnail: '',
        };
    }

    return { ok: false, code: 'UNSUPPORTED_VIDEO_URL' };
}

function normalizeThumbnailUrl(raw) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return '';
    if (/^\/uploads\/gallery\/images\/[a-f0-9]{32}\.(jpg|png|webp|gif)$/i.test(trimmed)) return trimmed;
    const parsed = parseHttpUrl(trimmed);
    if (!parsed || !IMAGE_PATH.test(parsed.pathname)) return '';
    return parsed.href;
}

module.exports = {
    parseGalleryVideoUrl,
    normalizeThumbnailUrl,
};
