const { randomUUID } = require('node:crypto');
const { ApiError } = require('../../utils/errors');
const { isCalculatedValueField } = require('./fields');
const { isPlainObject } = require('./objects');
const { extractDraftId, inquirySubmissionKey } = require('./submissionKey');

const NAME_MAX_LENGTH = 100;
const EMAIL_MAX_LENGTH = 254;
const PHONE_MIN_LENGTH = 7;
const PHONE_MAX_LENGTH = 30;
const MESSAGE_MAX_LENGTH = 2000;
const INQUIRY_STATUS = 'received';
const ALLOWED_INQUIRY_FIELDS = new Set(['customer', 'configuration', 'message']);
const ALLOWED_CUSTOMER_FIELDS = new Set(['name', 'email', 'phone']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9+().\-\s]+$/;
const NAME_PATTERN = /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .,'’-]*$/u;

function issue(field, code, message) {
    return { field, code, message };
}

function hasDisallowedControlChars(value) {
    return /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value);
}

function defaultId() {
    return `inq_${randomUUID()}`;
}

function toPublicInquiry(record) {
    const createdAt = record.createdAt instanceof Date
        ? record.createdAt.toISOString()
        : new Date(record.createdAt).toISOString();
    return {
        id: record.id,
        createdAt,
        status: record.status,
    };
}

function validateCustomer(customer, errors) {
    if (customer === undefined) {
        errors.push(issue('customer', 'REQUIRED', 'Customer contact details are required.'));
        return null;
    }
    if (!isPlainObject(customer)) {
        errors.push(issue('customer', 'INVALID_TYPE', 'Customer contact details must be an object.'));
        return null;
    }

    for (const key of Object.keys(customer)) {
        if (isCalculatedValueField(key)) {
            errors.push(issue(
                `customer.${key}`,
                'CALCULATED_VALUE_REJECTED',
                'Client-supplied prices and calculated values are not accepted.',
            ));
        } else if (!ALLOWED_CUSTOMER_FIELDS.has(key)) {
            errors.push(issue(`customer.${key}`, 'UNKNOWN_FIELD', 'This field is not accepted.'));
        }
    }

    let name = null;
    if (typeof customer.name !== 'string' || customer.name.trim() === '') {
        errors.push(issue('customer.name', 'REQUIRED', 'Name is required.'));
    } else if (customer.name.trim().length > NAME_MAX_LENGTH || hasDisallowedControlChars(customer.name)) {
        errors.push(issue('customer.name', 'INVALID_FORMAT', 'Name is too long or contains unsupported characters.'));
    } else if (!NAME_PATTERN.test(customer.name.trim())) {
        errors.push(issue('customer.name', 'INVALID_FORMAT', 'Name contains unsupported characters.'));
    } else {
        name = customer.name.trim();
    }

    let email = null;
    if (typeof customer.email !== 'string' || customer.email.trim() === '') {
        errors.push(issue('customer.email', 'REQUIRED', 'Email is required.'));
    } else {
        const normalizedEmail = customer.email.trim().toLowerCase();
        if (normalizedEmail.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(normalizedEmail)) {
            errors.push(issue('customer.email', 'INVALID_FORMAT', 'Enter a valid email address.'));
        } else {
            email = normalizedEmail;
        }
    }

    let phone = null;
    if (customer.phone !== undefined && customer.phone !== null && customer.phone !== '') {
        if (typeof customer.phone !== 'string') {
            errors.push(issue('customer.phone', 'INVALID_TYPE', 'Phone must be a string.'));
        } else {
            const trimmedPhone = customer.phone.trim();
            if (trimmedPhone !== '') {
                if (
                    trimmedPhone.length < PHONE_MIN_LENGTH
                    || trimmedPhone.length > PHONE_MAX_LENGTH
                    || !PHONE_PATTERN.test(trimmedPhone)
                ) {
                    errors.push(issue('customer.phone', 'INVALID_FORMAT', 'Enter a valid phone number.'));
                } else {
                    phone = trimmedPhone;
                }
            }
        }
    }

    if (errors.some((item) => item.field.startsWith('customer'))) {
        return null;
    }

    return { name, email, phone };
}

function validateMessage(message, errors) {
    if (message === undefined || message === null) {
        return null;
    }
    if (typeof message !== 'string') {
        errors.push(issue('message', 'INVALID_TYPE', 'Message must be a string.'));
        return null;
    }
    if (hasDisallowedControlChars(message)) {
        errors.push(issue('message', 'INVALID_FORMAT', 'Message contains unsupported characters.'));
        return null;
    }
    const trimmed = message.trim();
    if (trimmed.length > MESSAGE_MAX_LENGTH) {
        errors.push(issue('message', 'TOO_LONG', `Message must be ${MESSAGE_MAX_LENGTH} characters or fewer.`));
        return null;
    }
    return trimmed || null;
}

function createInquiryService({ CustomBuildInquiry, validationService, createId = defaultId }) {
    return {
        async createInquiry(payload) {
            if (!isPlainObject(payload)) {
                throw new ApiError(400, 'BAD_REQUEST', 'Request body must be a JSON object.');
            }

            const errors = [];
            for (const key of Object.keys(payload)) {
                if (isCalculatedValueField(key)) {
                    errors.push(issue(
                        key,
                        'CALCULATED_VALUE_REJECTED',
                        'Client-supplied prices and calculated values are not accepted.',
                    ));
                } else if (!ALLOWED_INQUIRY_FIELDS.has(key)) {
                    errors.push(issue(key, 'UNKNOWN_FIELD', 'This field is not accepted.'));
                }
            }

            const customer = validateCustomer(payload.customer, errors);
            const message = validateMessage(payload.message, errors);

            let configuration = null;
            if (payload.configuration === undefined) {
                errors.push(issue('configuration', 'REQUIRED', 'A custom build configuration is required.'));
            } else {
                const result = await validationService.inspectConfiguration(payload.configuration, 'configuration');
                errors.push(...result.errors);
                configuration = result.configuration;
            }

            if (errors.length > 0) {
                throw new ApiError(422, 'VALIDATION_ERROR', 'Custom build inquiry is invalid.', errors);
            }

            const submissionKey = inquirySubmissionKey({ customer, configuration, message });
            const draftId = extractDraftId(configuration && configuration.notes);
            const existing = await CustomBuildInquiry.findOne({ submissionKey });
            if (existing) {
                return toPublicInquiry(existing);
            }

            try {
                const record = await CustomBuildInquiry.create({
                    id: createId(),
                    status: INQUIRY_STATUS,
                    customer,
                    configuration,
                    message,
                    draftId,
                    submissionKey,
                });
                return toPublicInquiry(record);
            } catch (error) {
                if (error && (error.code === 11000 || error.code === 11001)) {
                    const raced = await CustomBuildInquiry.findOne({ submissionKey });
                    if (raced) {
                        return toPublicInquiry(raced);
                    }
                }
                throw error;
            }
        },
    };
}

module.exports = { createInquiryService };
