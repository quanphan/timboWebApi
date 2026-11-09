const fs = require('fs/promises');
const GalleryPost = require('../models/GalleryPost');
const GalleryCategory = require('../models/GalleryCategory');
const { GALLERY_CATEGORIES, LEGACY_GALLERY_CATEGORIES } = GalleryPost;
const { ApiError } = require('../utils/errors');
const { pageMeta } = require('../utils/http');
const { parsePagination } = require('../utils/pagination');
const { cleanString } = require('../utils/text');
const { parseGalleryUrl, resolveGalleryFile } = require('../utils/galleryPaths');
const { parseGalleryVideoUrl, normalizeThumbnailUrl } = require('../utils/galleryVideo');

const TITLE_MAX = 160;
const EXCERPT_MAX = 400;
const CONTENT_MAX = 8000;
const MEDIA_IMAGE_MAX = 5;
const MEDIA_VIDEO_MAX = 5;
const MEDIA_MAX = MEDIA_IMAGE_MAX + MEDIA_VIDEO_MAX;
const RESERVED_GALLERY_FILTERS = ['all', 'video'];
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DEFAULT_GALLERY_CATEGORIES = [
    { slug: 'process', sortOrder: 10, translations: { en: { name: 'Build process' }, vi: { name: 'Quá trình chế tác' } } },
    { slug: 'art-of-making', sortOrder: 20, translations: { en: { name: 'Art of Making' }, vi: { name: 'Nghệ thuật chế tác' } } },
    { slug: 'materials', sortOrder: 30, translations: { en: { name: 'Materials & wood' }, vi: { name: 'Vật liệu & gỗ' } } },
    { slug: 'finish', sortOrder: 40, translations: { en: { name: 'Finish' }, vi: { name: 'Hoàn thiện' } } },
    { slug: 'instruments', sortOrder: 50, translations: { en: { name: 'Finished guitars' }, vi: { name: 'Guitar hoàn thiện' } } },
];

function presentCategory(doc) {
    const raw = doc && typeof doc.toObject === 'function' ? doc.toObject() : doc;
    return {
        id: String(raw._id),
        slug: raw.slug,
        isActive: raw.isActive !== false,
        sortOrder: Number.isFinite(Number(raw.sortOrder)) ? Number(raw.sortOrder) : 0,
        translations: {
            en: { name: (raw.translations && raw.translations.en && raw.translations.en.name) || '' },
            vi: { name: (raw.translations && raw.translations.vi && raw.translations.vi.name) || '' },
        },
    };
}

async function ensureDefaultCategories() {
    const existing = await GalleryCategory.find({}).select('slug').lean();
    const have = new Set(existing.map((item) => item.slug));
    const missing = DEFAULT_GALLERY_CATEGORIES.filter((item) => !have.has(item.slug));
    if (missing.length) {
        await GalleryCategory.insertMany(missing);
    }
}

function isValidCategorySlug(value) {
    return typeof value === 'string' && SLUG_PATTERN.test(value) && value.length <= 80;
}

async function assertAssignableCategory(slug) {
    if (RESERVED_GALLERY_FILTERS.includes(slug) && slug !== 'video') {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Gallery post is invalid.', [{
            field: 'category',
            code: 'INVALID',
            message: 'Select a valid gallery category.',
        }]);
    }
    if (LEGACY_GALLERY_CATEGORIES.includes(slug)) return;
    const found = await GalleryCategory.findOne({ slug }).lean();
    if (!found) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Gallery post is invalid.', [{
            field: 'category',
            code: 'UNKNOWN_CATEGORY',
            message: 'Select a valid gallery category.',
        }]);
    }
}

function galleryDateSortPipeline(match, skip, limit) {
    return [
        { $match: match },
        {
            $addFields: {
                pinSort: { $cond: [{ $eq: ['$pin', true] }, 1, 0] },
                _hasDisplayDate: { $cond: [{ $ifNull: ['$publishedAt', false] }, 1, 0] },
            },
        },
        { $sort: { pinSort: -1, _hasDisplayDate: -1, publishedAt: -1, _id: -1 } },
        { $skip: skip },
        { $limit: limit },
        { $project: { pinSort: 0, _hasDisplayDate: 0 } },
    ];
}

function inferProvider(item) {
    if (parseGalleryUrl(item.path || item.url || '')) return item.provider === 'upload' || !item.provider ? 'upload' : item.provider;
    const parsed = parseGalleryVideoUrl(item.sourceUrl || item.path || item.url);
    if (parsed.ok) return parsed.provider;
    if (item.provider && ['upload', 'youtube', 'vimeo', 'facebook', 'direct'].includes(item.provider)) {
        return item.provider;
    }
    return 'upload';
}

function presentMedia(item, { admin = false } = {}) {
    const sourceUrl = item.sourceUrl || item.path || '';
    const provider = inferProvider(item);
    const parsed = provider === 'upload' ? null : parseGalleryVideoUrl(sourceUrl);
    const thumbnail =
        item.thumbnail ||
        (parsed && parsed.ok && parsed.thumbnail ? parsed.thumbnail : '');
    const base = {
        id: item.id,
        kind: item.kind,
        type: item.kind,
        url: sourceUrl,
        sourceUrl,
        provider,
        videoId: item.videoId || (parsed && parsed.ok ? parsed.videoId : '') || '',
        thumbnail,
        sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : 0,
    };
    if (!admin) return base;
    return {
        ...base,
        path: item.path || sourceUrl,
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

function localeBlock(raw) {
    const block = raw && typeof raw === 'object' ? raw : {};
    return {
        title: block.title || '',
        excerpt: block.excerpt || '',
        content: block.content || '',
    };
}

function presentTranslations(post) {
    return {
        vi: localeBlock(post.translations && post.translations.vi),
        en: localeBlock(post.translations && post.translations.en),
    };
}

function presentPost(post, { admin = false } = {}) {
    const media = (post.media || [])
        .map((item, index) => {
            const raw = typeof item.toObject === 'function' ? item.toObject() : item;
            return presentMedia({ ...raw, sortOrder: raw.sortOrder ?? index }, { admin });
        })
        .sort((a, b) => a.sortOrder - b.sortOrder);
    const translations = presentTranslations(post);
    const data = {
        id: String(post._id),
        title: post.title || translations.vi.title || translations.en.title,
        excerpt: post.excerpt || translations.vi.excerpt || translations.en.excerpt || '',
        content: post.content || translations.vi.content || translations.en.content || '',
        translations,
        category: post.category,
        publishedAt: post.publishedAt ? new Date(post.publishedAt).toISOString() : null,
        order: post.order || 0,
        cover: coverOf(post, { admin }),
        media,
        coverMediaId: post.coverMediaId || (media[0] ? media[0].id : ''),
        showAtHome: Boolean(post.showAtHome),
        pin: post.pin === true,
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
    const kind = item.kind === 'video' || item.type === 'video' ? 'video' : item.kind === 'image' || item.type === 'image' ? 'image' : '';
    const urlPath = cleanString(item.sourceUrl || item.url || item.path);
    const parsedFile = parseGalleryUrl(urlPath);
    if (!id) {
        errors.push({ field: `media.${index}.id`, code: 'INVALID', message: 'Media id is required.' });
    }
    if (!kind) {
        errors.push({ field: `media.${index}.kind`, code: 'INVALID', message: 'Media kind is invalid.' });
    }
    const sortOrder = Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : index;
    const thumbnailRaw = item.thumbnail === undefined ? '' : cleanString(item.thumbnail);
    let thumbnail = '';
    if (thumbnailRaw) {
        thumbnail = normalizeThumbnailUrl(thumbnailRaw);
        if (!thumbnail) {
            errors.push({ field: `media.${index}.thumbnail`, code: 'INVALID', message: 'Thumbnail must be an image URL or gallery image.' });
        } else if (thumbnail.startsWith('/uploads/gallery/') && !resolveGalleryFile(galleryDir, thumbnail)) {
            errors.push({ field: `media.${index}.thumbnail`, code: 'INVALID', message: 'Thumbnail is not a gallery image file.' });
        }
    }

    if (parsedFile) {
        if (!resolveGalleryFile(galleryDir, urlPath)) {
            errors.push({ field: `media.${index}.path`, code: 'INVALID', message: 'Media path is not a gallery file.' });
        }
        if (kind && ((kind === 'image' && parsedFile.kind !== 'images') || (kind === 'video' && parsedFile.kind !== 'videos'))) {
            errors.push({ field: `media.${index}.kind`, code: 'INVALID', message: 'Media kind does not match the file.' });
        }
        return {
            id,
            kind,
            path: urlPath,
            sourceUrl: '',
            provider: 'upload',
            videoId: '',
            thumbnail,
            sortOrder,
            mime: cleanString(item.mime).slice(0, 80),
            size: Number.isFinite(Number(item.size)) ? Number(item.size) : 0,
            originalName: cleanString(item.originalName).slice(0, 80),
        };
    }

    const expectedProvider = ['youtube', 'facebook', 'vimeo', 'direct'].includes(item.provider)
        ? item.provider
        : 'auto';
    const parsedVideo = parseGalleryVideoUrl(urlPath, { expectedProvider });
    if (!parsedVideo.ok) {
        errors.push({
            field: `media.${index}.url`,
            code: parsedVideo.code || 'INVALID_VIDEO_URL',
            message: 'Use a YouTube, Facebook, Vimeo, or direct MP4/WebM URL.',
        });
        return null;
    }
    if (kind && kind !== 'video') {
        errors.push({ field: `media.${index}.kind`, code: 'INVALID', message: 'External URLs must be video items.' });
    }
    const storedUrl = parsedVideo.sourceUrl || parsedVideo.url;
    return {
        id,
        kind: 'video',
        path: storedUrl,
        sourceUrl: storedUrl,
        provider: parsedVideo.provider,
        videoId: parsedVideo.videoId,
        thumbnail: thumbnail || parsedVideo.thumbnail,
        sortOrder,
        mime: '',
        size: 0,
        originalName: '',
    };
}

function validateBody(body, galleryDir, { partial = false } = {}) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new ApiError(400, 'BAD_REQUEST', 'Request body must be a JSON object.');
    }
    const errors = [];
    let translations;
    if (body.translations !== undefined) {
        if (!body.translations || typeof body.translations !== 'object' || Array.isArray(body.translations)) {
            errors.push({ field: 'translations', code: 'INVALID', message: 'Translations must be an object.' });
        } else {
            translations = {
                vi: localeBlock({
                    title: optionalText(body.translations.vi && body.translations.vi.title, TITLE_MAX, 'translations.vi.title', errors),
                    excerpt: optionalText(body.translations.vi && body.translations.vi.excerpt, EXCERPT_MAX, 'translations.vi.excerpt', errors),
                    content: optionalText(body.translations.vi && body.translations.vi.content, CONTENT_MAX, 'translations.vi.content', errors),
                }),
                en: localeBlock({
                    title: optionalText(body.translations.en && body.translations.en.title, TITLE_MAX, 'translations.en.title', errors),
                    excerpt: optionalText(body.translations.en && body.translations.en.excerpt, EXCERPT_MAX, 'translations.en.excerpt', errors),
                    content: optionalText(body.translations.en && body.translations.en.content, CONTENT_MAX, 'translations.en.content', errors),
                }),
            };
        }
    }
    const title = body.title === undefined ? undefined : optionalText(body.title, TITLE_MAX, 'title', errors);
    const excerpt = body.excerpt === undefined ? undefined : optionalText(body.excerpt, EXCERPT_MAX, 'excerpt', errors);
    const content = body.content === undefined ? undefined : optionalText(body.content, CONTENT_MAX, 'content', errors);
    const resolvedTitle = title
        || (translations && (translations.vi.title || translations.en.title))
        || '';
    if (!partial || body.title !== undefined || body.translations !== undefined) {
        if (!partial && !resolvedTitle) {
            errors.push({ field: 'title', code: 'REQUIRED', message: 'Title is required.' });
        }
    }
    let category;
    if (body.category !== undefined) {
        category = cleanString(body.category).toLowerCase();
        if (!isValidCategorySlug(category) || category === 'all') {
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
                    message: `A gallery post can include at most ${MEDIA_VIDEO_MAX} videos.`,
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
    let showAtHome;
    if (body.showAtHome !== undefined) {
        if (body.showAtHome === true || body.showAtHome === 'true') {
            showAtHome = true;
        } else if (body.showAtHome === false || body.showAtHome === 'false') {
            showAtHome = false;
        } else {
            errors.push({ field: 'showAtHome', code: 'INVALID', message: 'showAtHome must be true or false.' });
        }
    } else if (!partial) {
        showAtHome = false;
    }
    let pin;
    if (body.pin !== undefined) {
        if (body.pin === true || body.pin === 'true') {
            pin = true;
        } else if (body.pin === false || body.pin === 'false') {
            pin = false;
        } else {
            errors.push({ field: 'pin', code: 'INVALID', message: 'pin must be true or false.' });
        }
    } else if (!partial) {
        pin = false;
    }
    if (errors.length) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Gallery post is invalid.', errors);
    }
    const updates = {};
    if (title !== undefined) updates.title = title;
    else if (resolvedTitle) updates.title = resolvedTitle;
    if (excerpt !== undefined) updates.excerpt = excerpt;
    else if (translations) updates.excerpt = translations.vi.excerpt || translations.en.excerpt;
    if (content !== undefined) updates.content = content;
    else if (translations) updates.content = translations.vi.content || translations.en.content;
    if (translations) updates.translations = translations;
    else if (!partial) {
        updates.translations = {
            vi: {
                title: updates.title || '',
                excerpt: updates.excerpt || '',
                content: updates.content || '',
            },
            en: { title: '', excerpt: '', content: '' },
        };
    }
    if (category !== undefined) updates.category = category;
    if (status !== undefined) updates.status = status;
    if (publishedAt !== undefined) updates.publishedAt = publishedAt;
    if (order !== undefined) updates.order = order;
    if (media !== undefined) updates.media = media;
    if (coverMediaId !== undefined) updates.coverMediaId = coverMediaId;
    if (showAtHome !== undefined) updates.showAtHome = showAtHome;
    if (pin !== undefined) updates.pin = pin;
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
    if (!parseGalleryUrl(urlPath)) return;
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

function listFilter(query, { publicOnly = false } = {}) {
    const filter = {};
    if (publicOnly) {
        filter.status = 'published';
    } else {
        const status = cleanString(query.status);
        if (status === 'draft' || status === 'published') filter.status = status;
    }
    const category = cleanString(query.category).toLowerCase();
    if (category === 'video') {
        filter.$or = [
            { 'media.kind': 'video' },
            { 'media.type': 'video' },
        ];
    } else if (category && category !== 'all' && isValidCategorySlug(category)) {
        filter.category = category;
    }
    if (publicOnly) {
        const home = cleanString(query.showAtHome);
        if (home === 'true' || home === '1') {
            filter.showAtHome = true;
        }
    }
    return filter;
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
            await ensureDefaultCategories();
            const { page, limit, skip } = parsePagination(query, 50);
            const filter = listFilter(query, { publicOnly: true });
            const [total, posts] = await Promise.all([
                GalleryPost.countDocuments(filter),
                GalleryPost.aggregate(galleryDateSortPipeline(filter, skip, limit)),
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
            const filter = listFilter(query);
            const [total, posts] = await Promise.all([
                GalleryPost.countDocuments(filter),
                GalleryPost.aggregate(galleryDateSortPipeline(filter, skip, limit)),
            ]);
            return { posts: posts.map((post) => presentPost(post, { admin: true })), meta: pageMeta(page, limit, total) };
        },
        async getAdmin(id) {
            const post = await GalleryPost.findById(id);
            if (!post) throw new ApiError(404, 'NOT_FOUND', 'Gallery post was not found.');
            return presentPost(post, { admin: true });
        },
        async create(body, user) {
            await ensureDefaultCategories();
            const input = validateBody(body, galleryDir);
            if (input.category) await assertAssignableCategory(input.category);
            if (input.status === 'published' && input.publishedAt === undefined) {
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
            await ensureDefaultCategories();
            const input = validateBody(body, galleryDir, { partial: true });
            if (input.category) await assertAssignableCategory(input.category);
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
        async listPublicCategories() {
            await ensureDefaultCategories();
            const items = await GalleryCategory.find({ isActive: true }).sort({ sortOrder: 1, slug: 1 }).lean();
            return items.map(presentCategory);
        },
        async listAdminCategories() {
            await ensureDefaultCategories();
            const items = await GalleryCategory.find({}).sort({ sortOrder: 1, slug: 1 }).lean();
            const slugs = items.map((item) => item.slug);
            const counts = slugs.length
                ? await GalleryPost.aggregate([
                    { $match: { category: { $in: slugs } } },
                    { $group: { _id: '$category', count: { $sum: 1 } } },
                ])
                : [];
            const usage = new Map(counts.map((item) => [item._id, item.count]));
            return items.map((item) => ({ ...presentCategory(item), usageCount: usage.get(item.slug) || 0 }));
        },
        async createCategory(body) {
            await ensureDefaultCategories();
            const parsed = readCategoryBody(body);
            if (await GalleryCategory.findOne({ slug: parsed.slug })) {
                throw new ApiError(422, 'VALIDATION_ERROR', 'Gallery category is invalid.', [{
                    field: 'slug',
                    code: 'DUPLICATE',
                    message: 'That slug is already used.',
                }]);
            }
            const created = await GalleryCategory.create(parsed);
            return presentCategory(created);
        },
        async updateCategory(id, body) {
            const item = await GalleryCategory.findById(id);
            if (!item) throw new ApiError(404, 'NOT_FOUND', 'Gallery category was not found.');
            const parsed = readCategoryBody(body, { partial: true, currentSlug: item.slug });
            if (parsed.slug && parsed.slug !== item.slug) {
                if (await GalleryCategory.findOne({ slug: parsed.slug })) {
                    throw new ApiError(422, 'VALIDATION_ERROR', 'Gallery category is invalid.', [{
                        field: 'slug',
                        code: 'DUPLICATE',
                        message: 'That slug is already used.',
                    }]);
                }
                await GalleryPost.updateMany({ category: item.slug }, { $set: { category: parsed.slug } });
            }
            if (parsed.translations) {
                parsed.translations = {
                    en: { name: (parsed.translations.en && parsed.translations.en.name) || (item.translations && item.translations.en && item.translations.en.name) || '' },
                    vi: { name: (parsed.translations.vi && parsed.translations.vi.name) || (item.translations && item.translations.vi && item.translations.vi.name) || '' },
                };
            }
            Object.assign(item, parsed);
            await item.save();
            return presentCategory(item);
        },
        async reorderCategories(body) {
            const ids = Array.isArray(body && body.ids) ? body.ids.map((value) => String(value)) : [];
            if (!ids.length) {
                throw new ApiError(422, 'VALIDATION_ERROR', 'Gallery category is invalid.', [{
                    field: 'ids',
                    code: 'REQUIRED',
                    message: 'Category order is required.',
                }]);
            }
            await Promise.all(ids.map((id, index) => GalleryCategory.updateOne(
                { _id: id },
                { $set: { sortOrder: (index + 1) * 10 } },
            )));
            return this.listAdminCategories();
        },
        async deleteCategory(id) {
            const item = await GalleryCategory.findById(id);
            if (!item) throw new ApiError(404, 'NOT_FOUND', 'Gallery category was not found.');
            const usage = await GalleryPost.countDocuments({ category: item.slug });
            if (usage > 0) {
                throw new ApiError(409, 'IN_USE', 'This category still has gallery posts.');
            }
            await GalleryCategory.deleteOne({ _id: item._id });
            return { deleted: true };
        },
    };
}

function readCategoryName(value, field, errors) {
    const name = cleanString(value);
    if (!name) {
        errors.push({ field, code: 'REQUIRED', message: 'Category name is required.' });
        return '';
    }
    if (name.length > 80) {
        errors.push({ field, code: 'TOO_LONG', message: 'Category name is too long.' });
    }
    return name;
}

function readCategoryBody(body, { partial = false, currentSlug = '' } = {}) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new ApiError(400, 'BAD_REQUEST', 'Request body must be a JSON object.');
    }
    const errors = [];
    let slug;
    if (body.slug !== undefined || !partial) {
        slug = cleanString(body.slug).toLowerCase();
        if (!isValidCategorySlug(slug) || RESERVED_GALLERY_FILTERS.includes(slug)) {
            errors.push({ field: 'slug', code: 'INVALID', message: 'Use a stable slug. all and video are reserved.' });
        }
    }
    const enName = body.nameEn !== undefined || (body.translations && body.translations.en)
        ? readCategoryName(body.nameEn || (body.translations && body.translations.en && body.translations.en.name), 'nameEn', errors)
        : undefined;
    const viName = body.nameVi !== undefined || (body.translations && body.translations.vi)
        ? readCategoryName(body.nameVi || (body.translations && body.translations.vi && body.translations.vi.name), 'nameVi', errors)
        : undefined;
    if (!partial && (enName === undefined || viName === undefined)) {
        if (enName === undefined) readCategoryName('', 'nameEn', errors);
        if (viName === undefined) readCategoryName('', 'nameVi', errors);
    }
    let isActive;
    if (body.isActive !== undefined) {
        if (body.isActive === true || body.isActive === 'true') isActive = true;
        else if (body.isActive === false || body.isActive === 'false') isActive = false;
        else errors.push({ field: 'isActive', code: 'INVALID', message: 'isActive must be true or false.' });
    } else if (!partial) {
        isActive = true;
    }
    let sortOrder;
    if (body.sortOrder !== undefined) {
        sortOrder = Number(body.sortOrder);
        if (!Number.isFinite(sortOrder) || sortOrder < -10000 || sortOrder > 10000) {
            errors.push({ field: 'sortOrder', code: 'INVALID', message: 'Sort order is invalid.' });
        }
    }
    if (errors.length) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Gallery category is invalid.', errors);
    }
    const updates = {};
    if (slug !== undefined) updates.slug = slug;
    if (enName !== undefined || viName !== undefined) {
        updates.translations = {
            en: { name: enName !== undefined ? enName : '' },
            vi: { name: viName !== undefined ? viName : '' },
        };
    }
    if (isActive !== undefined) updates.isActive = isActive;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;
    if (partial && updates.translations) {
        updates.translations = {
            en: { name: enName !== undefined ? enName : undefined },
            vi: { name: viName !== undefined ? viName : undefined },
        };
    }
    return updates;
}

module.exports = { createGalleryService, GALLERY_CATEGORIES };
