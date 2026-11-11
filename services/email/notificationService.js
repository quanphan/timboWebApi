const { createHash } = require('node:crypto');
const AdminNotification = require('../../models/AdminNotification');
const CustomBuildOption = require('../../models/CustomBuildOption');
const { createResendTransport } = require('./resendClient');
const {
    customBuildCustomerEmail,
    customBuildWorkshopEmail,
    loadWizardCatalog,
} = require('./customBuildInquiryEmail');
const { contactCustomerEmail } = require('./contactCustomerEmail');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function buildCustomerMessage({ subject, lines }) {
    return {
        subject,
        text: lines.join('\n'),
        html: [`<h1>${escapeHtml(subject)}</h1>`, linesToHtml(lines)].join(''),
    };
}

function formatReferencePrice(item) {
    if (item?.priceOnRequest || item?.unitPrice == null) return 'Price on Request';
    const amount = item.lineTotal != null ? item.lineTotal : item.unitPrice;
    return item.currency ? `${amount} ${item.currency}` : String(amount);
}

function optionLine(option) {
    const group = oneLine(option?.groupNameEn || option?.groupNameVi);
    const label = oneLine(option?.labelEn || option?.labelVi);
    if (group && label) return `${group}: ${label}`;
    return label || group;
}

function cartItemLines(items) {
    const rows = Array.isArray(items) ? items : [];
    if (!rows.length) return ['Not provided'];
    const lines = [];
    rows.forEach((item, index) => {
        const title = oneLine(item.titleEn || item.titleVi);
        const category = oneLine(item.categoryNameEn || item.categoryNameVi);
        lines.push(`${index + 1}. ${title}${category ? ` (${category})` : ''}`);
        (item.options || []).map(optionLine).filter(Boolean).forEach((line) => {
            lines.push(`   ${line}`);
        });
        lines.push(`   Quantity: ${item.quantity ?? 1}`);
        lines.push(`   Reference price: ${formatReferencePrice(item)}`);
        if (item.indicative) lines.push('   Indicative workshop price, not a final quotation.');
    });
    return lines;
}

function serviceCartDetails(record) {
    const customer = record.customer || {};
    const selections = record.configuration?.selections || {};
    const items = Array.isArray(selections.items) ? selections.items : [];
    const lines = [
        `Inquiry ID: ${displayValue(record.id)}`,
        `Name: ${displayValue(customer.name)}`,
        `Email: ${displayValue(customer.email)}`,
        `Phone: ${displayValue(customer.phone)}`,
        `Country: ${displayValue(selections.country)}`,
        'Requested services and products:',
        ...cartItemLines(items),
    ];
    if (selections.quotationRequired) {
        lines.push('Reference total: Quotation Required');
    } else if (selections.subtotal != null) {
        const currency = items[0]?.currency;
        lines.push(`Reference total: ${currency ? `${selections.subtotal} ${currency}` : selections.subtotal}`);
    }
    const notes = oneLine(record.configuration?.notes || record.message);
    if (notes) {
        lines.push(`Notes: ${notes}`);
    }
    return { customer, selections, items, lines };
}

function serviceCartAdminMessage(record, bases) {
    const details = serviceCartDetails(record);
    const createdAt = isoTime(record.createdAt);
    const path = inquiryAdminPath(record.id);
    return buildMessage({
        subject: `New service cart quotation from ${displayValue(details.customer.name)}`,
        lines: [
            'Event: service cart quotation',
            `Created: ${createdAt}`,
            ...details.lines,
        ],
        adminPath: path,
        link: adminLink(bases.frontendBaseUrl, path),
    });
}

function serviceCartCustomerMessage(record) {
    const details = serviceCartDetails(record);
    return buildCustomerMessage({
        subject: `PhanQuan Guitars — quotation request ${displayValue(record.id)}`,
        lines: [
            `Hello ${displayValue(details.customer.name)},`,
            '',
            'We have received your request and will contact you shortly via email or phone to discuss the details and provide a quotation.',
            'Chúng tôi đã nhận được yêu cầu của bạn và sẽ sớm liên hệ qua email hoặc điện thoại để trao đổi và gửi báo giá chi tiết.',
            '',
            ...details.lines,
        ],
    });
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

function customBuildMessage(record, bases, catalog) {
    return customBuildWorkshopEmail(record, bases, catalog);
}

function customBuildCustomerMessage(record, bases, catalog) {
    return customBuildCustomerEmail(record, bases, catalog);
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

function logProviderError(error, message = 'Admin notification failed') {
    console.error(JSON.stringify({
        level: 'error',
        message,
        name: error && error.name ? error.name : 'Error',
        status: error && error.response ? error.response.status || null : null,
    }));
}

function logEmailAccepted(eventType, providerId) {
    if (!providerId) return;
    console.info(JSON.stringify({
        level: 'info',
        message: 'Email accepted by Resend',
        eventType,
        providerId,
    }));
}

function customerRecipient(email) {
    const value = oneLine(email).toLowerCase();
    if (!EMAIL_PATTERN.test(value) || value.length > 254) return '';
    return value;
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

    async function deliver(eventType, dedupeKey, resourceId, message, recipient) {
        if (!transport) return { sent: false, reason: 'disabled' };
        const claimed = await claim(eventType, dedupeKey, resourceId);
        if (!claimed) return { sent: false, reason: 'duplicate' };
        try {
            const payload = { from, ...message, to: recipient || to };
            const accepted = await transport.send(payload);
            logEmailAccepted(eventType, accepted && accepted.id);
            return { sent: true, providerId: accepted && accepted.id ? accepted.id : null };
        } catch (error) {
            logProviderError(
                error,
                String(eventType).endsWith('-customer')
                    ? 'Customer notification failed'
                    : 'Admin notification failed',
            );
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
            const resourceId = String(record._id || record.id);
            const dedupeKey = contactDedupeKey(record);
            let admin = { sent: false, reason: 'provider' };
            let customer = { sent: false, reason: 'provider' };
            try {
                admin = await deliver('contact', dedupeKey, resourceId, contactMessage(record, bases));
            } catch (error) {
                logProviderError(error, 'Admin notification failed');
            }
            try {
                const recipient = customerRecipient(record.email);
                customer = recipient
                    ? await deliver(
                        'contact-customer',
                        dedupeKey,
                        resourceId,
                        contactCustomerEmail(record),
                        recipient,
                    )
                    : { sent: false, reason: 'invalid' };
            } catch (error) {
                logProviderError(error, 'Customer notification failed');
            }
            return { admin, customer };
        },
        async notifyCustomBuild(record) {
            try {
                const resourceId = String(record.id);
                const dedupeKey = record.submissionKey || resourceId;
                const catalog = Object.prototype.hasOwnProperty.call(dependencies, 'catalog')
                    ? dependencies.catalog
                    : await loadWizardCatalog(dependencies.CustomBuildOption || CustomBuildOption);
                const workshop = await deliver(
                    'custom-build-inquiry',
                    dedupeKey,
                    resourceId,
                    customBuildMessage(record, bases, catalog),
                );
                const customerEmail = oneLine(record.customer?.email);
                const customer = customerEmail
                    ? await deliver(
                        'custom-build-customer',
                        dedupeKey,
                        resourceId,
                        customBuildCustomerMessage(record, bases, catalog),
                        customerEmail,
                    )
                    : { sent: false, reason: 'disabled' };
                return { workshop, customer };
            } catch (error) {
                logProviderError(error);
                return {
                    workshop: { sent: false, reason: 'provider' },
                    customer: { sent: false, reason: 'provider' },
                };
            }
        },
        async notifyServiceCart(record) {
            try {
                const resourceId = String(record.id);
                const dedupeKey = record.submissionKey || resourceId;
                const workshop = await deliver(
                    'service-cart-inquiry',
                    dedupeKey,
                    resourceId,
                    serviceCartAdminMessage(record, bases),
                );
                const customerEmail = oneLine(record.customer?.email);
                const customer = customerEmail
                    ? await deliver(
                        'service-cart-customer',
                        dedupeKey,
                        resourceId,
                        serviceCartCustomerMessage(record),
                        customerEmail,
                    )
                    : { sent: false, reason: 'disabled' };
                return { workshop, customer };
            } catch (error) {
                logProviderError(error);
                return {
                    workshop: { sent: false, reason: 'provider' },
                    customer: { sent: false, reason: 'provider' },
                };
            }
        },
    };
}

module.exports = {
    createNotificationService,
    contactMessage,
    contactCustomerEmail,
    customBuildMessage,
    customBuildCustomerMessage,
    serviceCartAdminMessage,
    serviceCartCustomerMessage,
};
