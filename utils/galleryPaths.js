const path = require('path');

const GALLERY_URL_PREFIX = '/uploads/gallery/';
const FILE_NAME_PATTERN = /^[a-f0-9]{32}\.(jpg|png|webp|gif|mp4|webm)$/;

function publicGalleryUrl(kind, filename) {
    return `${GALLERY_URL_PREFIX}${kind}/${filename}`;
}

function parseGalleryUrl(urlPath) {
    const value = String(urlPath || '');
    if (!value.startsWith(GALLERY_URL_PREFIX)) return null;
    const rest = value.slice(GALLERY_URL_PREFIX.length);
    const [kind, filename] = rest.split('/');
    if ((kind !== 'images' && kind !== 'videos') || !filename || rest.includes('..')) {
        return null;
    }
    if (!FILE_NAME_PATTERN.test(filename)) return null;
    return { kind, filename };
}

function resolveGalleryFile(galleryDir, urlPath) {
    const parsed = parseGalleryUrl(urlPath);
    if (!parsed) return null;
    const root = path.resolve(galleryDir);
    const absolute = path.resolve(root, parsed.kind, parsed.filename);
    if (absolute !== path.join(root, parsed.kind, parsed.filename)) return null;
    if (!absolute.startsWith(`${root}${path.sep}`)) return null;
    return absolute;
}

module.exports = {
    GALLERY_URL_PREFIX,
    parseGalleryUrl,
    publicGalleryUrl,
    resolveGalleryFile,
};
