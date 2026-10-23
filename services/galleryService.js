const fs = require('fs/promises');
const GalleryPost = require('../models/GalleryPost');
const { GALLERY_CATEGORIES } = GalleryPost;
const { ApiError } = require('../utils/errors');
const { pageMeta } = require('../utils/http');
const { parsePagination } = require('../utils/pagination');
const { cleanString } = require('../utils/text');
const { parseGalleryUrl, resolveGalleryFile } = require('../utils/galleryPaths');

const TITLE_MAX = 160;
const EXCERPT_MAX = 400;
const CONTENT_MAX = 8000;
const MEDIA_IMAGE_MAX = 5;
const MEDIA_VIDEO_MAX = 1;
const MEDIA_MAX = MEDIA_IMAGE_MAX + MEDIA_VIDEO_MAX;

function presentMedia(item, { admin = false } = {}) {
    const publicPath = item.path;
    const base = {
        id: item.id,
        kind: item.kind,
        url: publicPath,
    };
    if (!admin) return base;
    return {
        ...base,
        path: publicPath,
        mime: item.mime || '',
        size: item.size || 0,
        originalName: item.originalName || '',
    };
}

function coverOf(post, { admin = false } = {}) {
    const media = Array.isArray(post.media) ? post.media : [];
    const cover = media.find((item) => item.id === post.coverMediaId) || media[0] || null;
    return cover ? presentMedia(cover, { admin }) : null;
}

function presentPost(post, { admin = false } = {}) {
    const media = (post.media || []).map((item) => presentMedia(item, { admin }));
    const data = {
        id: String(post._id),
        title: post.title,
        excerpt: post.excerpt || '',
        content: post.content || '',
        category: post.category,
        publishedAt: post.publishedAt ? new Date(post.publishedAt).toISOString() : null,
        order: post.order || 0,
        cover: coverOf(post, { admin }),
        media,
        coverMediaId: post.coverMediaId || (media[0] ? media[0].id : ''),
    };
    if (admin) {
        data.status = post.status;
        data.createdAt = post.createdAt ? new Date(post.createdAt).toISOString() : null;
        data.updatedAt = post.updatedAt ? new Date(post.updatedAt).toISOString() : null;
        data.updatedBy = post.updatedBy ? String(post.updatedBy) : null;
    }
    return data;
}

function optionalText(value, max, field, errors) {
    const cleaned = cleanString(value);
    if (!cleaned) return '';
    if (cleaned.length > max) {
        errors.push({ field, code: 'TOO_LONG', message: `${field} is too long.` });
    }
    return cleaned;
}

function validateMediaItem(item, galleryDir, errors, index) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
        errors.push({ field: `media.${index}`, code: 'INVALID', message: 'Media item is invalid.' });
        return null;
    }
    const id = cleanString(item.id);
    const kind = item.kind === 'video' ? 'video' : item.kind === 'image' ? 'image' : '';
    const urlPath = cleanString(item.path || item.url);
    const parsed = parseGalleryUrl(urlPath);
    if (!id) {
        errors.push({ field: `media.${index}.id`, code: 'INVALID', message: 'Media id is required.' });
    }
    if (!kind) {
        errors.push({ field: `media.${index}.kind`, code: 'INVALID', message: 'Media kind is invalid.' });
    }
    if (!parsed || !resolveGalleryFile(galleryDir, urlPath)) {
        errors.push({ field: `media.${index}.path`, code: 'INVALID', message: 'Media path is not a gallery file.' });
    }
    if (parsed && kind && ((kind === 'image' && parsed.kind !== 'images') || (kind === 'video' && parsed.kind !== 'videos'))) {
        errors.push({ field: `media.${index}.kind`, code: 'INVALID', message: 'Media kind does not match the file.' });
    }
    return {
        id,
        kind,
        path: urlPath,
        mime: cleanString(item.mime).slice(0, 80),
        size: Number.isFinite(Number(item.size)) ? Number(item.size) : 0,
        originalName: cleanString(item.originalName).slice(0, 80),
    };
}

function validateBody(body, galleryDir, { partial = false } = {}) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new ApiError(400, 'BAD_REQUEST', 'Request body must be a JSON object.');
    }
    const errors = [];
    const title = body.title === undefined ? undefined : optionalText(body.title, TITLE_MAX, 'title', errors);
    if (!partial || body.title !== undefined) {
        if (!title) errors.push({ field: 'title', code: 'REQUIRED', message: 'Title is required.' });
    }
    const excerpt = body.excerpt === undefined ? undefined : optionalText(body.excerpt, EXCERPT_MAX, 'excerpt', errors);
    const content = body.content === undefined ? undefined : optionalText(body.content, CONTENT_MAX, 'content', errors);
    let category;
    if (body.category !== undefined) {
        category = cleanString(body.category);
        if (!GALLERY_CATEGORIES.includes(category)) {
            errors.push({ field: 'category', code: 'INVALID', message: 'Select a valid gallery category.' });
        }
    } else if (!partial) {
        errors.push({ field: 'category', code: 'REQUIRED', message: 'Category is required.' });
    }
    let status;
    if (body.status !== undefined) {
        status = body.status === 'published' ? 'published' : body.status === 'draft' ? 'draft' : '';
        if (!status) errors.push({ field: 'status', code: 'INVALID', message: 'Status must be draft or published.' });
    } else if (!partial) {
        status = 'draft';
    }
    let publishedAt;
    if (body.publishedAt !== undefined) {
        if (!body.publishedAt) {
            publishedAt = null;
        } else {
            const date = new Date(body.publishedAt);
            if (Number.isNaN(date.getTime())) {
                errors.push({ field: 'publishedAt', code: 'INVALID', message: 'publishedAt is invalid.' });
            } else {
                publishedAt = date;
            }
        }
    }
    let order;
    if (body.order !== undefined) {
        order = Number(body.order);
        if (!Number.isFinite(order) || order < -10000 || order > 10000) {
            errors.push({ field: 'order', code: 'INVALID', message: 'Order is invalid.' });
        }
    }
    let media;
    if (body.media !== undefined) {
        if (!Array.isArray(body.media)) {
            errors.push({ field: 'media', code: 'INVALID', message: 'Media must be an array.' });
        } else if (body.media.length > MEDIA_MAX) {
            errors.push({ field: 'media', code: 'TOO_LONG', message: 'Too many media files.' });
        } else {
            media = body.media.map((item, index) => validateMediaItem(item, galleryDir, errors, index)).filter(Boolean);
            const imageCount = media.filter((item) => item.kind === 'image').length;
            const videoCount = media.filter((item) => item.kind === 'video').length;
            if (imageCount > MEDIA_IMAGE_MAX) {
                errors.push({
                    field: 'media',
                    code: 'TOO_MANY_IMAGES',
                    message: `A gallery post can include at most ${MEDIA_IMAGE_MAX} images.`,
                });
            }
            if (videoCount > MEDIA_VIDEO_MAX) {
                errors.push({
                    field: 'media',
                    code: 'TOO_MANY_VIDEOS',
                    message: 'A gallery post can include at most one video.',
                });
            }
            if (imageCount > 0 && videoCount > 0) {
                errors.push({
                    field: 'media',
                    code: 'MIXED_MEDIA',
                    message: 'A gallery post cannot mix images and video.',
                });
            }
        }
    } else if (!partial) {
        media = [];
    }
    let coverMediaId;
    if (body.coverMediaId !== undefined) {
        coverMediaId = cleanString(body.coverMediaId);
    }
    if (errors.length) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Gallery post is invalid.', errors);
    }
    const updates = {};
    if (title !== undefined) updates.title = title;
    if (excerpt !== undefined) updates.excerpt = excerpt;
    if (content !== undefined) updates.content = content;
    if (category !== undefined) updates.category = category;
    if (status !== undefined) updates.status = status;
    if (publishedAt !== undefined) updates.publishedAt = publishedAt;
    if (order !== undefined) updates.order = order;
    if (media !== undefined) updates.media = media;
    if (coverMediaId !== undefined) updates.coverMediaId = coverMediaId;
    if (updates.status === 'published' && updates.publishedAt === undefined && !partial) {
        updates.publishedAt = new Date();
    }
    return updates;
}

async function pathsStillUsed(urlPath, exceptPostId) {
    const filter = { 'media.path': urlPath };
    if (exceptPostId) filter._id = { $ne: exceptPostId };
    return GalleryPost.exists(filter);
}

async function deleteGalleryFile(galleryDir, urlPath, exceptPostId) {
    if (!(await pathsStillUsed(urlPath, exceptPostId))) {
        const absolute = resolveGalleryFile(galleryDir, urlPath);
        if (!absolute) return;
        await fs.unlink(absolute).catch(() => {});
    }
}

async function deleteRemovedFiles(galleryDir, previous, next, postId) {
    const nextPaths = new Set((next || []).map((item) => item.path));
    const removed = (previous || []).filter((item) => item.path && !nextPaths.has(item.path));
    await Promise.all(removed.map((item) => deleteGalleryFile(galleryDir, item.path, postId)));
}

function applyCover(post) {
    const media = post.media || [];
    if (!media.length) {
        post.coverMediaId = '';
        return;
    }
    if (!media.some((item) => item.id === post.coverMediaId)) {
        post.coverMediaId = media[0].id;
    }
}

function createGalleryService(config) {
    const galleryDir = config.galleryDir;
    return {
        async listPublic(query) {
            const { page, limit, skip } = parsePagination(query, 50);
            const filter = { status: 'published' };
            const category = cleanString(query.category);
            if (category && GALLERY_CATEGORIES.includes(category)) {
                filter.category = category;
            }
            const [total, posts] = await Promise.all([
                GalleryPost.countDocuments(filter),
                GalleryPost.find(filter).sort({ order: 1, publishedAt: -1, createdAt: -1 }).skip(skip).limit(limit),
            ]);
            return { posts: posts.map((post) => presentPost(post)), meta: pageMeta(page, limit, total) };
        },
        async getPublic(id) {
            const post = await GalleryPost.findOne({ _id: id, status: 'published' });
            if (!post) throw new ApiError(404, 'NOT_FOUND', 'Gallery post was not found.');
            return presentPost(post);
        },
        async listAdmin(query) {
            const { page, limit, skip } = parsePagination(query, 50);
            const filter = {};
            const status = cleanString(query.status);
            if (status === 'draft' || status === 'published') filter.status = status;
            const category = cleanString(query.category);
            if (category && GALLERY_CATEGORIES.includes(category)) filter.category = category;
            const [total, posts] = await Promise.all([
                GalleryPost.countDocuments(filter),
                GalleryPost.find(filter).sort({ order: 1, updatedAt: -1 }).skip(skip).limit(limit),
            ]);
            return { posts: posts.map((post) => presentPost(post, { admin: true })), meta: pageMeta(page, limit, total) };
        },
        async getAdmin(id) {
            const post = await GalleryPost.findById(id);
            if (!post) throw new ApiError(404, 'NOT_FOUND', 'Gallery post was not found.');
            return presentPost(post, { admin: true });
        },
        async create(body, user) {
            const input = validateBody(body, galleryDir);
            if (input.status === 'published' && !input.publishedAt) {
                input.publishedAt = new Date();
            }
            const post = new GalleryPost({
                ...input,
                createdAt: new Date(),
                updatedAt: new Date(),
                createdBy: user && user._id ? user._id : null,
                updatedBy: user && user._id ? user._id : null,
            });
            applyCover(post);
            await post.save();
            return presentPost(post, { admin: true });
        },
        async update(id, body, user) {
            const post = await GalleryPost.findById(id);
            if (!post) throw new ApiError(404, 'NOT_FOUND', 'Gallery post was not found.');
            const input = validateBody(body, galleryDir, { partial: true });
            const previousMedia = [...(post.media || [])];
            if (input.status === 'published' && !post.publishedAt && input.publishedAt === undefined) {
                input.publishedAt = new Date();
            }
            Object.assign(post, input, {
                updatedAt: new Date(),
                updatedBy: user && user._id ? user._id : null,
            });
            applyCover(post);
            await post.save();
            if (input.media) {
                await deleteRemovedFiles(galleryDir, previousMedia, post.media, post._id);
            }
            return presentPost(post, { admin: true });
        },
        async remove(id) {
            const post = await GalleryPost.findById(id);
            if (!post) throw new ApiError(404, 'NOT_FOUND', 'Gallery post was not found.');
            await GalleryPost.deleteOne({ _id: post._id });
            await deleteRemovedFiles(galleryDir, post.media, [], post._id);
            return { deleted: true };
        },
    };
}

module.exports = { createGalleryService, GALLERY_CATEGORIES };
