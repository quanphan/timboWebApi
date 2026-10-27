const { createHash } = require('node:crypto');
const AdminNotification = require('../../models/AdminNotification');
const { createResendTransport } = require('./resendClient');

function contactAdminPath(id) {
    return `/admin/messages/${encodeURIComponent(String(id))}`;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function oneLine(value) {
    return String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
}

function displayValue(value) {
    const text = oneLine(value);
    return text || 'Not provided';
}

function isoTime(value) {
    const date = value instanceof Date ? value : new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) return new Date().toISOString();
    return date.toISOString();
}

function adminLink(frontendBaseUrl, path) {
    if (!frontendBaseUrl) return '';
    return `${frontendBaseUrl}${path}`;
}

function imageLink(publicBaseUrl, imagePath) {
    if (!imagePath) return '';
    if (!publicBaseUrl) return imagePath;
    return `${publicBaseUrl}${imagePath}`;
}

function inquiryAdminPath(id) {
    return `/admin/inquiries/${encodeURIComponent(String(id))}`;
}

function formatSelections(selections) {
    if (!selections || typeof selections !== 'object' || Array.isArray(selections)) return [];
    return Object.keys(selections).sort().map((key) => {
        const value = selections[key];
        const rendered = Array.isArray(value) ? value.map((item) => oneLine(item)).join(', ') : oneLine(value);
        return `${key}: ${rendered || 'Not provided'}`;
    });
}

function contentHash(payload) {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function linesToHtml(lines) {
    return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('');
}

function buildMessage({ subject, lines, adminPath, link }) {
    const textLines = [...lines, '', `Admin path: ${adminPath}`, 'This admin path requires an authenticated admin session.'];
    if (link) textLines.push(`Admin link: ${link}`);
    const html = [
        `<h1>${escapeHtml(subject)}</h1>`,
        linesToHtml(lines),
        `<p>Admin path: ${escapeHtml(adminPath)}</p>`,
        '<p>This admin path requires an authenticated admin session.</p>',
        link ? `<p><a href="${escapeHtml(link)}">Open in admin</a></p>` : '',
    ].join('');
    return { subject, text: textLines.join('\n'), html };
}

function contactMessage(record, bases) {
    const createdAt = isoTime(record.createdAt);
    const adminPath = contactAdminPath(record._id || record.id);
    const lines = [
        'Event: contact message',
        `Created: ${createdAt}`,
        `Name: ${displayValue(record.name)}`,
        `Email: ${displayValue(record.email)}`,
        `Phone: ${displayValue(record.phone)}`,
        `Subject: ${displayValue(record.subject)}`,
        `Inquiry type: ${displayValue(record.inquiryType)}`,
        `Product: ${displayValue(record.productRef || record.productId)}`,
        `Message: ${displayValue(record.message)}`,
        `Reference: ${String(record._id || record.id)}`,
    ];
    return buildMessage({
        subject: `New contact message from ${displayValue(record.name)}`,
        lines,
        adminPath,
        link: adminLink(bases.frontendBaseUrl, adminPath),
    });
}

function customBuildMessage(record, bases) {
    const createdAt = isoTime(record.createdAt);
    const customer = record.customer || {};
    const configuration = record.configuration || {};
    const selections = formatSelections(configuration.selections);
    const images = Array.isArray(record.referenceImages) ? record.referenceImages : [];
    const lines = [
        'Event: custom build inquiry',
        `Created: ${createdAt}`,
        `Name: ${displayValue(customer.name)}`,
        `Email: ${displayValue(customer.email)}`,
        `Phone: ${displayValue(customer.phone)}`,
        `Message: ${displayValue(record.message)}`,
        `Reference: ${record.id}`,
        'Configuration:',
        ...(selections.length ? selections : ['Not provided']),
        `Notes: ${displayValue(configuration.notes)}`,
        'Reference images:',
        ...(images.length
            ? images.map((imagePath) => imageLink(bases.publicBaseUrl, imagePath))
            : ['Not provided']),
    ];
    const path = inquiryAdminPath(record.id);
    return buildMessage({
        subject: `New custom build inquiry from ${displayValue(customer.name)}`,
        lines,
        adminPath: path,
        link: adminLink(bases.frontendBaseUrl, path),
    });
}

function contactDedupeKey(record) {
    return contentHash({
        name: record.name || '',
        email: record.email || '',
        phone: record.phone || '',
        subject: record.subject || '',
        message: record.message || '',
        inquiryType: record.inquiryType || '',
        productId: record.productId || '',
        productRef: record.productRef || '',
        draftId: record.draftId || '',
    });
}

function logProviderError(error) {
    console.error(JSON.stringify({
        level: 'error',
        message: 'Admin notification failed',
        name: error && error.name ? error.name : 'Error',
        status: error && error.response ? error.response.status || null : null,
    }));
}

function isDuplicateKey(error) {
    return Boolean(error && (error.code === 11000 || error.code === 11001));
}

function createNotificationService(config = {}, dependencies = {}) {
    const apiKey = config.resendApiKey || '';
    const to = config.notificationEmail || '';
    const from = config.emailFrom || '';
    const enabled = Boolean(apiKey && to && from && !/[\r\n]/.test(from) && !/[\r\n]/.test(to));
    const transport = enabled
        ? (dependencies.transport || createResendTransport({ apiKey }))
        : null;
    const deliveries = dependencies.AdminNotification || AdminNotification;
    const bases = {
        publicBaseUrl: config.publicBaseUrl || '',
        frontendBaseUrl: config.frontendBaseUrl || '',
    };

    async function claim(eventType, dedupeKey, resourceId) {
        try {
            await deliveries.create({ eventType, dedupeKey, resourceId });
            return true;
        } catch (error) {
            if (isDuplicateKey(error)) return false;
            logProviderError(error);
            return false;
        }
    }

    async function release(eventType, dedupeKey) {
        await deliveries.deleteOne({ eventType, dedupeKey });
    }

    async function deliver(eventType, dedupeKey, resourceId, message) {
        if (!transport) return { sent: false, reason: 'disabled' };
        const claimed = await claim(eventType, dedupeKey, resourceId);
        if (!claimed) return { sent: false, reason: 'duplicate' };
        try {
            await transport.send({ from, to, ...message });
            return { sent: true };
        } catch (error) {
            logProviderError(error);
            try {
                await release(eventType, dedupeKey);
            } catch (releaseError) {
                logProviderError(releaseError);
            }
            return { sent: false, reason: 'provider' };
        }
    }

    return {
        async notifyContact(record) {
            try {
                const message = contactMessage(record, bases);
                return await deliver('contact', contactDedupeKey(record), String(record._id || record.id), message);
            } catch (error) {
                logProviderError(error);
                return { sent: false, reason: 'provider' };
            }
        },
        async notifyCustomBuild(record) {
            try {
                const message = customBuildMessage(record, bases);
                return await deliver(
                    'custom-build-inquiry',
                    record.submissionKey,
                    String(record.id),
                    message,
                );
            } catch (error) {
                logProviderError(error);
                return { sent: false, reason: 'provider' };
            }
        },
    };
}

module.exports = {
    createNotificationService,
    contactMessage,
    customBuildMessage,
};
