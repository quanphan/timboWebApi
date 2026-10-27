const mongoose = require('mongoose');
const Message = require('../models/Message');
const { ApiError } = require('../utils/errors');
const { pageMeta } = require('../utils/http');
const { parsePagination } = require('../utils/pagination');
const { publicMessage } = require('../utils/presenters');
const { cleanString } = require('../utils/text');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INQUIRY_TYPES = new Set(['custom-guitar', 'ready-stock', 'technical', 'collaboration']);
const NAME_MAX = 100;
const MESSAGE_MAX = 2000;
const SUBJECT_MAX = 200;
const PRODUCT_REF_MAX = 160;
const PRODUCT_ID_MAX = 80;
const DRAFT_ID_MAX = 80;

function optionalField(value, max, field, errors) {
    const cleaned = cleanString(value);
    if (!cleaned) return undefined;
    if (cleaned.length > max) {
        errors.push({ field, code: 'TOO_LONG', message: `${field} is too long.` });
        return undefined;
    }
    return cleaned;
}

function createContactService({ notifications } = {}) {
    const notify = notifications || { async notifyContact() {} };
    return {
        async create(body) {
            if (!body || typeof body !== 'object' || Array.isArray(body)) {
                throw new ApiError(400, 'BAD_REQUEST', 'Request body must be a JSON object.');
            }
            const name = cleanString(body.name);
            const email = cleanString(body.email).toLowerCase();
            const message = cleanString(body.message);
            const inquiryType = cleanString(body.inquiryType);
            const errors = [];
            if (!name || name.length > NAME_MAX) {
                errors.push({ field: 'name', code: 'REQUIRED', message: 'Name is required.' });
            }
            if (!EMAIL_PATTERN.test(email) || email.length > 254) {
                errors.push({ field: 'email', code: 'INVALID', message: 'Enter a valid email address.' });
            }
            if (!message || message.length > MESSAGE_MAX) {
                errors.push({ field: 'message', code: 'REQUIRED', message: 'Message is required and must be 2000 characters or fewer.' });
            }
            if (inquiryType && !INQUIRY_TYPES.has(inquiryType)) {
                errors.push({ field: 'inquiryType', code: 'INVALID', message: 'Select a valid inquiry type.' });
            }
            const phone = optionalField(body.phone, 40, 'phone', errors);
            const subject = optionalField(body.subject, SUBJECT_MAX, 'subject', errors);
            const productId = optionalField(body.productId, PRODUCT_ID_MAX, 'productId', errors);
            const productRef = optionalField(body.productRef, PRODUCT_REF_MAX, 'productRef', errors);
            const draftId = inquiryType === 'custom-guitar'
                ? optionalField(body.draftId, DRAFT_ID_MAX, 'draftId', errors)
                : undefined;
            if (errors.length) {
                throw new ApiError(422, 'VALIDATION_ERROR', 'Contact message is invalid.', errors);
            }
            const saved = await Message.create({
                name,
                email,
                phone,
                subject,
                message,
                inquiryType: INQUIRY_TYPES.has(inquiryType) ? inquiryType : undefined,
                productId,
                productRef,
                draftId,
            });
            await notify.notifyContact(saved);
            return { id: String(saved._id), received: true };
        },

        async getById(id) {
            if (!mongoose.isValidObjectId(id)) {
                throw new ApiError(404, 'NOT_FOUND', 'Message was not found.');
            }
            const message = await Message.findById(id);
            if (!message) {
                throw new ApiError(404, 'NOT_FOUND', 'Message was not found.');
            }
            return publicMessage(message);
        },

        async list(query) {
            const { page, limit, skip } = parsePagination(query);
            const [total, messages] = await Promise.all([
                Message.countDocuments(),
                Message.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
            ]);
            return {
                messages: messages.map(publicMessage),
                meta: pageMeta(page, limit, total),
            };
        },

        async remove(id) {
            const message = await Message.findByIdAndDelete(id);
            if (!message) {
                throw new ApiError(404, 'NOT_FOUND', 'Message was not found.');
            }
            return { deleted: true };
        },
    };
}

module.exports = { createContactService };
