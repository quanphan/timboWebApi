const crypto = require('crypto');
const fs = require('fs/promises');
const PageContent = require('../models/PageContent');
const { ApiError } = require('../utils/errors');
const {
    collectPageImageFilenames,
    ensureWritableDirectory,
    pagesDir,
    parsePageImagePath,
    publicPageImagePath,
    resolvePageImageFile,
} = require('../utils/pageImagePaths');
const { cleanString } = require('../utils/text');

const PAGE_KEYS = ['about', 'build-process'];
const LANGUAGES = ['en', 'vi'];
const SECTION_TYPES = [
    'hero',
    'text',
    'image',
    'text-image',
    'quote',
    'cta',
    'process-step',
    'gallery',
    'video',
];
const LAYOUTS = ['image-left', 'image-right', 'center'];
const MAX_SECTIONS = 40;
const MAX_GALLERY = 8;
const LIMITS = {
    title: 200,
    subtitle: 300,
    body: 8000,
    quote: 2000,
    imageAlt: 200,
    ctaLabel: 80,
    ctaUrl: 500,
    videoUrl: 500,
    number: 12,
    id: 40,
};

function assertPageKey(pageKey) {
    const key = cleanString(pageKey);
    if (!PAGE_KEYS.includes(key)) {
        throw new ApiError(404, 'NOT_FOUND', 'Page was not found.');
    }
    return key;
}

function stripUnsafeText(value, max) {
    let text = typeof value === 'string' ? value : '';
    text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
    text = text.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');
    text = text.replace(/<[^>]*>/g, '');
    text = text.replace(/javascript:/gi, '');
    if (text.length > max) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Page content is invalid.', [{
            field: 'text',
            code: 'TOO_LONG',
            message: `Text must be ${max} characters or fewer.`,
        }]);
    }
    return text.trim();
}

function sanitizeHttpOrPath(value, field, max) {
    const text = stripUnsafeText(value, max);
    if (!text) return '';
    if (/^javascript:/i.test(text) || /^data:/i.test(text) || /^vbscript:/i.test(text)) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Page content is invalid.', [{
            field,
            code: 'INVALID',
            message: 'URL scheme is not allowed.',
        }]);
    }
    if (/^https?:\/\//i.test(text)) {
        try {
            const parsed = new URL(text);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
                throw new Error('bad protocol');
            }
        } catch {
            throw new ApiError(422, 'VALIDATION_ERROR', 'Page content is invalid.', [{
                field,
                code: 'INVALID',
                message: 'URL is invalid.',
            }]);
        }
        return text;
    }
    if (text.startsWith('/') && !text.startsWith('//') && !text.includes('..') && !text.includes('\\')) {
        return text;
    }
    throw new ApiError(422, 'VALIDATION_ERROR', 'Page content is invalid.', [{
        field,
        code: 'INVALID',
        message: 'URL must be http(s) or a site path.',
    }]);
}

function sanitizeImagePath(value, field) {
    const text = stripUnsafeText(value, 240);
    if (!text) return '';
    if (
        text.startsWith('/uploads/')
        && !text.includes('..')
        && !text.includes('\\')
        && !text.startsWith('/uploads/custom-build/')
    ) {
        return text;
    }
    throw new ApiError(422, 'VALIDATION_ERROR', 'Page content is invalid.', [{
        field,
        code: 'INVALID',
        message: 'Image must be a stored /uploads path.',
    }]);
}

function sanitizeVideoUrl(value) {
    const text = stripUnsafeText(value, LIMITS.videoUrl);
    if (!text) return '';
    if (text.startsWith('/uploads/') && !text.includes('..') && !text.includes('\\') && !text.startsWith('/uploads/custom-build/')) {
        return text;
    }
    return sanitizeHttpOrPath(text, 'videoUrl', LIMITS.videoUrl);
}

function emptyLocale() {
    return { title: '', sections: [] };
}

function readSection(raw, index) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Page content is invalid.', [{
            field: `sections.${index}`,
            code: 'INVALID',
            message: 'Section is invalid.',
        }]);
    }
    const unknown = Object.keys(raw).filter((key) => ![
        'id', 'type', 'visible', 'title', 'subtitle', 'body', 'quote',
        'image', 'imageAlt', 'images', 'videoUrl', 'ctaLabel', 'ctaUrl', 'layout', 'number',
    ].includes(key));
    if (unknown.length) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Page content is invalid.', [{
            field: unknown[0],
            code: 'UNKNOWN_FIELD',
            message: 'Unknown section field.',
        }]);
    }
    const type = cleanString(raw.type);
    if (!SECTION_TYPES.includes(type)) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Page content is invalid.', [{
            field: 'type',
            code: 'INVALID',
            message: 'Section type is not supported.',
        }]);
    }
    const layout = cleanString(raw.layout) || 'image-left';
    if (!LAYOUTS.includes(layout)) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Page content is invalid.', [{
            field: 'layout',
            code: 'INVALID',
            message: 'Layout is not supported.',
        }]);
    }
    let id = stripUnsafeText(raw.id, LIMITS.id).replace(/[^a-zA-Z0-9_-]/g, '');
    if (!id) id = crypto.randomBytes(8).toString('hex');
    const images = Array.isArray(raw.images) ? raw.images : [];
    if (images.length > MAX_GALLERY) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Page content is invalid.', [{
            field: 'images',
            code: 'TOO_LONG',
            message: `At most ${MAX_GALLERY} gallery images are allowed.`,
        }]);
    }
    return {
        id,
        type,
        visible: raw.visible !== false,
        title: stripUnsafeText(raw.title, LIMITS.title),
        subtitle: stripUnsafeText(raw.subtitle, LIMITS.subtitle),
        body: stripUnsafeText(raw.body, LIMITS.body),
        quote: stripUnsafeText(raw.quote, LIMITS.quote),
        image: sanitizeImagePath(raw.image, 'image'),
        imageAlt: stripUnsafeText(raw.imageAlt, LIMITS.imageAlt),
        images: images.map((item, imageIndex) => {
            if (!item || typeof item !== 'object') {
                throw new ApiError(422, 'VALIDATION_ERROR', 'Page content is invalid.', [{
                    field: `images.${imageIndex}`,
                    code: 'INVALID',
                    message: 'Gallery item is invalid.',
                }]);
            }
            return {
                path: sanitizeImagePath(item.path, 'images'),
                alt: stripUnsafeText(item.alt, LIMITS.imageAlt),
            };
        }).filter((item) => item.path),
        videoUrl: sanitizeVideoUrl(raw.videoUrl),
        ctaLabel: stripUnsafeText(raw.ctaLabel, LIMITS.ctaLabel),
        ctaUrl: raw.ctaUrl ? sanitizeHttpOrPath(raw.ctaUrl, 'ctaUrl', LIMITS.ctaUrl) : '',
        layout,
        number: stripUnsafeText(raw.number, LIMITS.number),
    };
}

function readLocale(raw, field) {
    if (raw == null) return emptyLocale();
    if (typeof raw !== 'object' || Array.isArray(raw)) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Page content is invalid.', [{
            field,
            code: 'INVALID',
            message: 'Locale content is invalid.',
        }]);
    }
    const unknown = Object.keys(raw).filter((key) => key !== 'title' && key !== 'sections');
    if (unknown.length) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Page content is invalid.', [{
            field: unknown[0],
            code: 'UNKNOWN_FIELD',
            message: 'Unknown locale field.',
        }]);
    }
    const sections = Array.isArray(raw.sections) ? raw.sections : [];
    if (sections.length > MAX_SECTIONS) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Page content is invalid.', [{
            field: 'sections',
            code: 'TOO_LONG',
            message: `At most ${MAX_SECTIONS} sections are allowed.`,
        }]);
    }
    const seen = new Set();
    const normalized = sections.map((section, index) => {
        const next = readSection(section, index);
        if (seen.has(next.id)) {
            next.id = `${next.id}-${crypto.randomBytes(3).toString('hex')}`;
        }
        seen.add(next.id);
        return next;
    });
    return {
        title: stripUnsafeText(raw.title, LIMITS.title),
        sections: normalized,
    };
}

function actorId(user) {
    if (!user) return null;
    return user._id || user.id || null;
}

function presentLocale(value) {
    const locale = value || emptyLocale();
    return {
        title: locale.title || '',
        sections: Array.isArray(locale.sections) ? locale.sections.map((section) => ({
            id: section.id,
            type: section.type,
            visible: section.visible !== false,
            title: section.title || '',
            subtitle: section.subtitle || '',
            body: section.body || '',
            quote: section.quote || '',
            image: section.image || '',
            imageAlt: section.imageAlt || '',
            images: Array.isArray(section.images) ? section.images : [],
            videoUrl: section.videoUrl || '',
            ctaLabel: section.ctaLabel || '',
            ctaUrl: section.ctaUrl || '',
            layout: section.layout || 'image-left',
            number: section.number || '',
        })) : [],
    };
}

function presentLocales(value) {
    return {
        en: presentLocale(value && value.en),
        vi: presentLocale(value && value.vi),
    };
}

function hasPublishedContent(doc) {
    if (!doc || !doc.publishedAt || !doc.published) return false;
    const en = doc.published.en && Array.isArray(doc.published.en.sections) ? doc.published.en.sections.length : 0;
    const vi = doc.published.vi && Array.isArray(doc.published.vi.sections) ? doc.published.vi.sections.length : 0;
    return en > 0 || vi > 0;
}

function presentPublic(doc) {
    if (!hasPublishedContent(doc)) return null;
    return {
        pageKey: doc.pageKey,
        publishedAt: doc.publishedAt ? new Date(doc.publishedAt).toISOString() : null,
        locales: presentLocales(doc.published),
    };
}

function presentAdmin(doc, pageKey) {
    if (!doc) {
        return {
            pageKey,
            exists: false,
            revision: 0,
            updatedAt: null,
            publishedAt: null,
            draft: presentLocales(null),
            published: null,
        };
    }
    return {
        pageKey: doc.pageKey,
        exists: true,
        revision: doc.revision || 1,
        updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
        publishedAt: doc.publishedAt ? new Date(doc.publishedAt).toISOString() : null,
        updatedBy: doc.updatedBy ? String(doc.updatedBy) : null,
        draft: presentLocales(doc.draft),
        published: hasPublishedContent(doc) ? presentLocales(doc.published) : null,
    };
}

function assertRevision(doc, expectedRevision) {
    if (expectedRevision === undefined || expectedRevision === null || expectedRevision === '') {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Page content is invalid.', [{
            field: 'expectedRevision',
            code: 'REQUIRED',
            message: 'expectedRevision is required.',
        }]);
    }
    const expected = Number(expectedRevision);
    if (!Number.isInteger(expected) || expected < 0) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Page content is invalid.', [{
            field: 'expectedRevision',
            code: 'INVALID',
            message: 'Revision is invalid.',
        }]);
    }
    const current = doc ? (doc.revision || 1) : 0;
    if (expected !== current) {
        throw new ApiError(409, 'CONFLICT', 'This page was updated by someone else. Reload and try again.');
    }
}

async function getPublic(pageKey) {
    const key = assertPageKey(pageKey);
    const doc = await PageContent.findOne({ pageKey: key }).lean();
    return presentPublic(doc);
}

async function getAdmin(pageKey) {
    const key = assertPageKey(pageKey);
    const doc = await PageContent.findOne({ pageKey: key }).lean();
    return presentAdmin(doc, key);
}

async function saveDraft(pageKey, body, user) {
    const key = assertPageKey(pageKey);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new ApiError(400, 'BAD_REQUEST', 'Request body must be a JSON object.');
    }
    const language = cleanString(body.language);
    if (!LANGUAGES.includes(language)) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Page content is invalid.', [{
            field: 'language',
            code: 'INVALID',
            message: 'Language must be en or vi.',
        }]);
    }
    const locale = readLocale(body.locale, 'locale');
    const doc = await PageContent.findOne({ pageKey: key });
    assertRevision(doc, body.expectedRevision);

    if (!doc) {
        const draft = { en: emptyLocale(), vi: emptyLocale() };
        draft[language] = locale;
        const created = await PageContent.create({
            pageKey: key,
            revision: 1,
            draft,
            published: undefined,
            publishedAt: null,
            updatedBy: actorId(user),
        });
        return presentAdmin(created, key);
    }

    const draft = {
        en: presentLocale(doc.draft && doc.draft.en),
        vi: presentLocale(doc.draft && doc.draft.vi),
    };
    draft[language] = locale;
    doc.draft = draft;
    doc.revision = (doc.revision || 1) + 1;
    doc.updatedBy = actorId(user);
    await doc.save();
    return presentAdmin(doc, key);
}

async function publish(pageKey, body, user) {
    const key = assertPageKey(pageKey);
    const doc = await PageContent.findOne({ pageKey: key });
    if (!doc) {
        throw new ApiError(404, 'NOT_FOUND', 'Save a draft before publishing.');
    }
    assertRevision(doc, body && body.expectedRevision);
    const draft = presentLocales(doc.draft);
    if (draft.en.sections.length === 0 && draft.vi.sections.length === 0) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Page content is invalid.', [{
            field: 'sections',
            code: 'REQUIRED',
            message: 'Add at least one section before publishing.',
        }]);
    }
    doc.published = draft;
    doc.publishedAt = new Date();
    doc.publishedBy = actorId(user);
    doc.updatedBy = actorId(user);
    doc.revision = (doc.revision || 1) + 1;
    await doc.save();
    return presentAdmin(doc, key);
}

async function revert(pageKey, body, user) {
    const key = assertPageKey(pageKey);
    const doc = await PageContent.findOne({ pageKey: key });
    if (!doc || !hasPublishedContent(doc)) {
        throw new ApiError(404, 'NOT_FOUND', 'There is no published version to restore.');
    }
    assertRevision(doc, body && body.expectedRevision);
    doc.draft = presentLocales(doc.published);
    doc.updatedBy = actorId(user);
    doc.revision = (doc.revision || 1) + 1;
    await doc.save();
    return presentAdmin(doc, key);
}

async function listPageImageOrphans(uploadsDir) {
    const root = pagesDir(uploadsDir);
    const writable = ensureWritableDirectory(root);
    const docs = await PageContent.find({}).lean();
    const referenced = collectPageImageFilenames(docs);
    if (!writable.ok) {
        return {
            dryRun: true,
            writable: false,
            orphans: [],
            referencedCount: referenced.size,
            message: 'The page upload directory is missing or not writable.',
        };
    }
    let entries = [];
    try {
        entries = await fs.readdir(root, { withFileTypes: true });
    } catch (error) {
        throw new ApiError(503, 'DATA_UNAVAILABLE', 'The page upload directory is not available.');
    }
    const orphans = [];
    for (const entry of entries) {
        if (!entry.isFile()) continue;
        const full = resolvePageImageFile(uploadsDir, entry.name);
        if (!full) continue;
        if (referenced.has(entry.name)) continue;
        orphans.push({
            filename: entry.name,
            path: publicPageImagePath(entry.name),
        });
    }
    return {
        dryRun: true,
        writable: true,
        orphans,
        referencedCount: referenced.size,
        message: orphans.length
            ? 'These files are not referenced by any page draft or published record.'
            : 'No unreferenced page images were found.',
    };
}

async function deletePageImageOrphans(uploadsDir, body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new ApiError(400, 'BAD_REQUEST', 'Request body must be a JSON object.');
    }
    if (body.confirm !== true) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Page content is invalid.', [{
            field: 'confirm',
            code: 'REQUIRED',
            message: 'Set confirm to true to delete unreferenced page images.',
        }]);
    }
    const requested = Array.isArray(body.paths) ? body.paths : [];
    if (!requested.length) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Page content is invalid.', [{
            field: 'paths',
            code: 'REQUIRED',
            message: 'Provide the public /uploads/pages paths returned by the dry-run list.',
        }]);
    }
    const listing = await listPageImageOrphans(uploadsDir);
    if (!listing.writable) {
        throw new ApiError(503, 'DATA_UNAVAILABLE', 'The page upload directory is not available.');
    }
    const allowed = new Set(listing.orphans.map((item) => item.path));
    const deleted = [];
    const skipped = [];
    for (const value of requested) {
        const filename = parsePageImagePath(value);
        const publicPath = filename ? publicPageImagePath(filename) : '';
        if (!filename || !allowed.has(publicPath)) {
            skipped.push({ path: String(value || ''), reason: 'referenced-or-unknown' });
            continue;
        }
        const full = resolvePageImageFile(uploadsDir, filename);
        if (!full) {
            skipped.push({ path: publicPath, reason: 'invalid-path' });
            continue;
        }
        try {
            await fs.unlink(full);
            deleted.push({ filename, path: publicPath });
        } catch (error) {
            if (error && error.code === 'ENOENT') {
                skipped.push({ path: publicPath, reason: 'missing' });
            } else {
                throw new ApiError(503, 'DATA_UNAVAILABLE', 'The page upload directory is not available.');
            }
        }
    }
    return {
        dryRun: false,
        deleted,
        skipped,
        remaining: listing.orphans.filter((item) => !deleted.some((entry) => entry.path === item.path)),
    };
}

module.exports = {
    PAGE_KEYS,
    SECTION_TYPES,
    createPageContentService(config = {}) {
        const uploadsDir = config.uploadsDir;
        return {
            getPublic,
            getAdmin,
            saveDraft,
            publish,
            revert,
            listOrphans() {
                if (!uploadsDir) {
                    throw new ApiError(503, 'DATA_UNAVAILABLE', 'The page upload directory is not available.');
                }
                return listPageImageOrphans(uploadsDir);
            },
            deleteOrphans(body) {
                if (!uploadsDir) {
                    throw new ApiError(503, 'DATA_UNAVAILABLE', 'The page upload directory is not available.');
                }
                return deletePageImageOrphans(uploadsDir, body);
            },
        };
    },
};
