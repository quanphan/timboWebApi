const fs = require('fs');
const path = require('path');

const PAGE_UPLOAD_PREFIX = '/uploads/pages/';
const PAGE_FILE_NAME = /^[a-f0-9]{32}\.(jpg|png|webp|gif)$/;
const PAGE_PUBLIC_PATH = /^\/uploads\/pages\/([a-f0-9]{32}\.(jpg|png|webp|gif))$/;

function pagesDir(uploadsDir) {
    return path.resolve(uploadsDir, 'pages');
}

function publicPageImagePath(filename) {
    return `${PAGE_UPLOAD_PREFIX}${filename}`;
}

function parsePageImagePath(value) {
    const text = String(value || '').trim();
    const match = PAGE_PUBLIC_PATH.exec(text);
    return match ? match[1] : null;
}

function resolvePageImageFile(uploadsDir, filename) {
    if (!PAGE_FILE_NAME.test(filename)) return null;
    const root = pagesDir(uploadsDir);
    const full = path.resolve(root, filename);
    const relative = path.relative(root, full);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || relative.includes('..')) {
        return null;
    }
    return full;
}

function collectPageImageFilenames(docs) {
    const names = new Set();
    function add(value) {
        const filename = parsePageImagePath(value);
        if (filename) names.add(filename);
    }
    for (const doc of docs || []) {
        for (const bucket of [doc.draft, doc.published]) {
            if (!bucket) continue;
            for (const language of ['en', 'vi']) {
                const sections = bucket[language] && Array.isArray(bucket[language].sections)
                    ? bucket[language].sections
                    : [];
                for (const section of sections) {
                    add(section.image);
                    add(section.videoUrl);
                    for (const item of section.images || []) add(item.path);
                }
            }
        }
    }
    return names;
}

function ensureWritableDirectory(dir) {
    try {
        fs.mkdirSync(dir, { recursive: true });
        fs.accessSync(dir, fs.constants.W_OK);
        return { ok: true, error: null };
    } catch (error) {
        return { ok: false, error };
    }
}

module.exports = {
    PAGE_FILE_NAME,
    PAGE_PUBLIC_PATH,
    PAGE_UPLOAD_PREFIX,
    collectPageImageFilenames,
    ensureWritableDirectory,
    pagesDir,
    parsePageImagePath,
    publicPageImagePath,
    resolvePageImageFile,
};
