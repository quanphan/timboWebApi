const { createHash } = require('node:crypto');

const DRAFT_ID_PATTERN = /(?:^|\n)draftId=([A-Za-z0-9_-]{8,80})(?=\n|$)/;

function stable(value) {
    if (Array.isArray(value)) {
        return value.map((item) => stable(item));
    }
    if (value && typeof value === 'object') {
        return Object.keys(value).sort().reduce((sorted, key) => {
            sorted[key] = stable(value[key]);
            return sorted;
        }, {});
    }
    return value === undefined ? null : value;
}

function inquirySubmissionKey(inquiry) {
    const payload = stable({
        customer: inquiry.customer,
        configuration: inquiry.configuration,
        message: inquiry.message ?? null,
        referenceImages: inquiry.referenceImages || [],
    });
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function extractDraftId(notes) {
    if (typeof notes !== 'string') {
        return null;
    }
    const match = notes.match(DRAFT_ID_PATTERN);
    return match ? match[1] : null;
}

module.exports = { extractDraftId, inquirySubmissionKey };
