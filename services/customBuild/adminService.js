const AdminAuditLog = require('../../models/AdminAuditLog');
const CustomBuildInquiry = require('../../models/CustomBuildInquiry');
const { ApiError } = require('../../utils/errors');
const { pageMeta } = require('../../utils/http');
const { parsePagination } = require('../../utils/pagination');
const { publicRole } = require('../../utils/roles');
const { escapeRegex } = require('../../utils/text');

const ADMIN_STATUSES = ['new', 'ready_to_build', 'building', 'completed', 'cancelled'];
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function presentInquiry(doc) {
    return {
        id: doc.id,
        status: doc.status === 'received' ? 'new' : doc.status,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt || doc.createdAt,
        customer: {
            name: doc.customer.name,
            email: doc.customer.email,
            phone: doc.customer.phone || null,
        },
        configuration: {
            selections: doc.configuration.selections,
            notes: doc.configuration.notes || null,
        },
        message: doc.message || null,
        referenceImages: Array.isArray(doc.referenceImages) ? doc.referenceImages : [],
        draftId: doc.draftId || null,
    };
}

function parseBoundary(value, field, endOfDay) {
    if (value === undefined || value === null || value === '') {
        return null;
    }
    const text = String(value).trim();
    if (!DATE_ONLY.test(text) && Number.isNaN(Date.parse(text))) {
        throw new ApiError(400, 'BAD_REQUEST', `${field} is not a valid date.`);
    }
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) {
        throw new ApiError(400, 'BAD_REQUEST', `${field} is not a valid date.`);
    }
    if (DATE_ONLY.test(text) && endOfDay) {
        date.setUTCHours(23, 59, 59, 999);
    }
    return date;
}

function buildListFilter(query) {
    const filter = {};
    const status = query.status === undefined || query.status === null ? '' : String(query.status).trim();
    if (status) {
        if (!ADMIN_STATUSES.includes(status)) {
            throw new ApiError(400, 'BAD_REQUEST', 'Status filter is not valid.');
        }
        filter.status = status === 'new' ? { $in: ['new', 'received'] } : status;
    }

    const start = parseBoundary(query.startDate, 'startDate', false);
    const end = parseBoundary(query.endDate, 'endDate', true);
    if (start && end && start > end) {
        throw new ApiError(400, 'BAD_REQUEST', 'startDate must be on or before endDate.');
    }
    if (start || end) {
        filter.createdAt = {};
        if (start) {
            filter.createdAt.$gte = start;
        }
        if (end) {
            filter.createdAt.$lte = end;
        }
    }

    const q = query.q === undefined || query.q === null ? '' : String(query.q).trim();
    if (q) {
        if (q.length > 80) {
            throw new ApiError(400, 'BAD_REQUEST', 'Search text must be 80 characters or fewer.');
        }
        const pattern = new RegExp(escapeRegex(q), 'i');
        filter.$or = [
            { id: pattern },
            { 'customer.name': pattern },
            { 'customer.email': pattern },
        ];
    }
    return filter;
}

async function writeAudit(actor, action, inquiry, nextStatus) {
    await AdminAuditLog.create({
        action,
        actorId: String(actor._id),
        actorRole: publicRole(actor),
        inquiryId: inquiry.id,
        previousStatus: inquiry.status,
        nextStatus: nextStatus || null,
    });
}

function createCustomBuildAdminService() {
    return {
        async list(query) {
            const { page, limit, skip } = parsePagination(query);
            const filter = buildListFilter(query);
            const [total, records] = await Promise.all([
                CustomBuildInquiry.countDocuments(filter),
                CustomBuildInquiry.find(filter)
                    .sort({ createdAt: -1, id: 1 })
                    .skip(skip)
                    .limit(limit)
                    .lean(),
            ]);
            return {
                inquiries: records.map(presentInquiry),
                meta: pageMeta(page, limit, total),
            };
        },

        async getById(id) {
            const record = await CustomBuildInquiry.findOne({ id }).lean();
            if (!record) {
                throw new ApiError(404, 'NOT_FOUND', 'Custom build inquiry was not found.');
            }
            return presentInquiry(record);
        },

        async updateStatus(actor, id, body) {
            if (!body || typeof body !== 'object' || Array.isArray(body)) {
                throw new ApiError(400, 'BAD_REQUEST', 'Request body must be a JSON object.');
            }
            const unknown = Object.keys(body).filter((key) => key !== 'status');
            if (unknown.length > 0) {
                throw new ApiError(422, 'VALIDATION_ERROR', 'Inquiry update is invalid.', unknown.map((field) => ({
                    field,
                    code: 'UNKNOWN_FIELD',
                    message: 'Only status can be updated.',
                })));
            }
            if (!ADMIN_STATUSES.includes(body.status)) {
                throw new ApiError(422, 'VALIDATION_ERROR', 'Inquiry update is invalid.', [{
                    field: 'status',
                    code: 'INVALID',
                    message: 'Status must be new, ready_to_build, building, completed, or cancelled.',
                }]);
            }
            const record = await CustomBuildInquiry.findOne({ id });
            if (!record) {
                throw new ApiError(404, 'NOT_FOUND', 'Custom build inquiry was not found.');
            }
            if (record.status !== body.status) {
                await writeAudit(actor, 'inquiry.status', record, body.status);
                record.status = body.status;
                await record.save();
            }
            return presentInquiry(record);
        },

        async deleteInquiry(actor, id) {
            const record = await CustomBuildInquiry.findOne({ id });
            if (!record) {
                throw new ApiError(404, 'NOT_FOUND', 'Custom build inquiry was not found.');
            }
            await writeAudit(actor, 'inquiry.delete', record, null);
            await record.deleteOne();
            return { deleted: true, id: record.id };
        },
    };
}

module.exports = { ADMIN_STATUSES, createCustomBuildAdminService };
