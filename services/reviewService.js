const Review = require('../models/Review');
const Product = require('../models/Product');
const { ApiError } = require('../utils/errors');
const { publicReview } = require('../utils/presenters');
const { cleanString } = require('../utils/text');

function optionalScore(value, field, errors) {
    if (value === undefined || value === null || value === '') {
        return undefined;
    }
    const score = Number(value);
    if (!Number.isInteger(score) || score < 1 || score > 5) {
        errors.push({ field, code: 'INVALID', message: `${field} must be an integer from 1 to 5.` });
        return undefined;
    }
    return score;
}

function createReviewService() {
    return {
        async listForProduct(productId) {
            const product = await Product.findById(productId);
            if (!product) {
                throw new ApiError(404, 'NOT_FOUND', 'Product was not found.');
            }
            const reviews = await Review.find({ productId }).sort({ createdAt: -1 });
            return reviews.map(publicReview);
        },

        async create(user, productId, body) {
            const product = await Product.findById(productId);
            if (!product) {
                throw new ApiError(404, 'NOT_FOUND', 'Product was not found.');
            }
            if (!body || typeof body !== 'object' || Array.isArray(body)) {
                throw new ApiError(400, 'BAD_REQUEST', 'Request body must be a JSON object.');
            }
            const errors = [];
            const rating = optionalScore(body.rating, 'rating', errors);
            if (body.rating === undefined) {
                errors.push({ field: 'rating', code: 'REQUIRED', message: 'Rating is required.' });
            }
            const content = cleanString(body.content);
            if (!content || content.length > 2000) {
                errors.push({ field: 'content', code: 'INVALID', message: 'Content is required and must be 2000 characters or fewer.' });
            }
            const quality = optionalScore(body.quality, 'quality', errors);
            const shipping = optionalScore(body.shipping, 'shipping', errors);
            const service = optionalScore(body.service, 'service', errors);
            if (errors.length) {
                throw new ApiError(422, 'VALIDATION_ERROR', 'Review is invalid.', errors);
            }
            const review = await Review.create({
                productId: product._id,
                name: user.name || user.email,
                rating,
                content,
                quality,
                shipping,
                service,
                recommend: Boolean(body.recommend),
            });
            return publicReview(review);
        },
    };
}

module.exports = { createReviewService };
