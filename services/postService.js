const Post = require('../models/Post');
const { ApiError } = require('../utils/errors');
const { pageMeta } = require('../utils/http');
const { parsePagination } = require('../utils/pagination');
const { publicPost } = require('../utils/presenters');
const { cleanString } = require('../utils/text');

function validatePost(body, { partial = false } = {}) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new ApiError(400, 'BAD_REQUEST', 'Request body must be a JSON object.');
    }
    const title = body.title === undefined ? undefined : cleanString(body.title);
    const content = body.content === undefined ? undefined : cleanString(body.content);
    const errors = [];
    if (!partial || body.title !== undefined) {
        if (!title || title.length > 160) {
            errors.push({ field: 'title', code: 'INVALID', message: 'Title is required and must be 160 characters or fewer.' });
        }
    }
    if (!partial || body.content !== undefined) {
        if (!content || content.length > 20000) {
            errors.push({ field: 'content', code: 'INVALID', message: 'Content is required.' });
        }
    }
    if (errors.length) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Post is invalid.', errors);
    }
    const updates = {};
    if (title !== undefined) updates.title = title;
    if (content !== undefined) updates.content = content;
    if (body.published !== undefined) updates.published = Boolean(body.published);
    return updates;
}

function createPostService() {
    return {
        async listPublic(query) {
            const { page, limit, skip } = parsePagination(query);
            const filter = { published: { $ne: false } };
            const [total, posts] = await Promise.all([
                Post.countDocuments(filter),
                Post.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
            ]);
            return { posts: posts.map(publicPost), meta: pageMeta(page, limit, total) };
        },

        async getPublic(id) {
            const post = await Post.findOne({ _id: id, published: { $ne: false } });
            if (!post) {
                throw new ApiError(404, 'NOT_FOUND', 'Post was not found.');
            }
            return publicPost(post);
        },

        async create(body) {
            const input = validatePost(body);
            const post = await Post.create({ ...input, published: input.published !== false });
            return publicPost(post);
        },

        async update(id, body) {
            const input = validatePost(body, { partial: true });
            const post = await Post.findById(id);
            if (!post) {
                throw new ApiError(404, 'NOT_FOUND', 'Post was not found.');
            }
            Object.assign(post, input, { updatedAt: new Date() });
            await post.save();
            return publicPost(post);
        },

        async remove(id) {
            const post = await Post.findByIdAndDelete(id);
            if (!post) {
                throw new ApiError(404, 'NOT_FOUND', 'Post was not found.');
            }
            return { deleted: true };
        },
    };
}

module.exports = { createPostService };
