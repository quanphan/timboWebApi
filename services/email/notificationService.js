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

const CUSTOM_BUILD_COPY = {
    en: {
        hello: 'Hello {name},',
        confirmation:
            'Thank you for your custom guitar inquiry. PhanQuan Guitars has received your request. We will contact you shortly via email or phone to discuss the design, specifications and quotation.',
        disclaimer: 'This is a build inquiry, not a confirmed order or a final quotation.',
        inquiryId: 'Inquiry ID',
        name: 'Name',
        email: 'Email',
        phone: 'Phone',
        country: 'Country',
        configuration: 'Configuration',
        description: 'Description',
        images: 'Reference images',
        notProvided: 'Not provided',
        subject: 'PhanQuan Guitars — custom guitar inquiry {id}',
        fields: {
            'instrument-type': 'Instrument type',
            instrumentTypeId: 'Instrument type',
            series: 'Series',
            seriesId: 'Series',
            'body-shape': 'Body shape',
            shapeId: 'Body shape',
            scale: 'Scale length',
            scaleId: 'Scale length',
            'string-count': 'Number of strings',
            stringCount: 'Number of strings',
        },
    },
    vi: {
        hello: 'Xin chào {name},',
        confirmation:
            'Cảm ơn bạn đã gửi yêu cầu custom guitar đến PhanQuan Guitars. Chúng tôi đã nhận được thông tin và sẽ sớm liên hệ qua email hoặc điện thoại để trao đổi chi tiết về thiết kế, cấu hình và báo giá.',
        disclaimer: 'Đây là yêu cầu custom, chưa phải xác nhận đơn hàng hoặc báo giá cuối cùng.',
        inquiryId: 'Mã enquiry',
        name: 'Họ tên',
        email: 'Email',
        phone: 'Điện thoại',
        country: 'Quốc gia',
        configuration: 'Cấu hình',
        description: 'Mô tả',
        images: 'Hình tham khảo',
        notProvided: 'Không có',
        subject: 'PhanQuan Guitars — yêu cầu custom guitar {id}',
        fields: {
            'instrument-type': 'Loại nhạc cụ',
            instrumentTypeId: 'Loại nhạc cụ',
            series: 'Series',
            seriesId: 'Series',
            'body-shape': 'Dáng thân',
            shapeId: 'Dáng thân',
            scale: 'Chiều dài scale',
            scaleId: 'Chiều dài scale',
            'string-count': 'Số dây',
            stringCount: 'Số dây',
        },
    },
};

const CUSTOM_BUILD_FIELD_ORDER = [
    'instrument-type',
    'series',
    'body-shape',
    'scale',
    'string-count',
];

const CUSTOM_BUILD_FIELD_ALIASES = {
    instrumentTypeId: 'instrument-type',
    seriesId: 'series',
    shapeId: 'body-shape',
    scaleId: 'scale',
    stringCount: 'string-count',
};

function canonicalConfigKey(key) {
    return CUSTOM_BUILD_FIELD_ALIASES[key] || key;
}

function humanizeOptionId(value) {
    const text = oneLine(value);
    if (!text) return '';
    const catalogId = /^[a-z][a-z0-9-]*\.[a-z0-9._-]+$/i.test(text);
    const leaf = catalogId ? text.slice(text.lastIndexOf('.') + 1) : text;
    return leaf
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function parseInquiryNotes(notes) {
    const parsed = { language: 'en', country: '', wizard: [] };
    if (typeof notes !== 'string' || !notes.trim()) return parsed;
    let inWizard = false;
    for (const rawLine of notes.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;
        if (/^wizard:?$/i.test(line)) {
            inWizard = true;
            continue;
        }
        const separator = line.indexOf('=');
        if (separator <= 0) continue;
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim();
        if (key === 'language' && (value === 'vi' || value === 'en')) {
            parsed.language = value;
        } else if (key === 'country') {
            parsed.country = value;
        } else if (
            inWizard
            || key.endsWith('Id')
            || key === 'stringCount'
            || key === 'customColorNote'
            || key === 'specialRequests'
            || key === 'customerSuppliedParts'
        ) {
            parsed.wizard.push([key, value]);
        }
    }
    return parsed;
}

function copyFor(language) {
    return CUSTOM_BUILD_COPY[language] || CUSTOM_BUILD_COPY.en;
}

function formatConfigValue(value) {
    if (Array.isArray(value)) {
        return value.map((item) => humanizeOptionId(item) || oneLine(item)).filter(Boolean).join(', ');
    }
    if (value === true || value === 'true' || value === '1') return 'Yes';
    if (value === false || value === 'false') return '';
    return humanizeOptionId(value) || oneLine(value);
}

function customBuildConfigLines(record, language) {
    const copy = copyFor(language);
    const notes = parseInquiryNotes(record.configuration?.notes);
    const selections = record.configuration?.selections && typeof record.configuration.selections === 'object'
        ? record.configuration.selections
        : {};
    const rows = new Map();
    for (const [key, value] of Object.entries(selections)) {
        if (key === 'inquiryKind') continue;
        const rendered = formatConfigValue(value);
        if (rendered) rows.set(canonicalConfigKey(key), rendered);
    }
    for (const [key, value] of notes.wizard) {
        const rendered = formatConfigValue(value);
        if (rendered) rows.set(canonicalConfigKey(key), rendered);
    }
    const orderedKeys = [
        ...CUSTOM_BUILD_FIELD_ORDER.filter((key) => rows.has(key)),
        ...[...rows.keys()].filter((key) => !CUSTOM_BUILD_FIELD_ORDER.includes(key)).sort(),
    ];
    if (!orderedKeys.length) return [copy.notProvided];
    return orderedKeys.map((key) => {
        const label = copy.fields[key] || key;
        return `${label}: ${rows.get(key)}`;
    });
}

function customBuildImageLines(record, bases, emptyLabel) {
    const images = Array.isArray(record.referenceImages) ? record.referenceImages : [];
    if (!images.length) return [emptyLabel];
    return images.map((imagePath) => imageLink(bases.publicBaseUrl, imagePath));
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
        `Inquiry ID: ${displayValue(record.id)}`,
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

function customBuildCustomerMessage(record, bases) {
    const notes = parseInquiryNotes(record.configuration?.notes);
    const language = notes.language === 'vi' ? 'vi' : 'en';
    const copy = copyFor(language);
    const customer = record.customer || {};
    const name = displayValue(customer.name);
    return buildCustomerMessage({
        subject: copy.subject.replace('{id}', displayValue(record.id)),
        lines: [
            copy.hello.replace('{name}', name),
            '',
            copy.confirmation,
            copy.disclaimer,
            '',
            `${copy.inquiryId}: ${displayValue(record.id)}`,
            `${copy.name}: ${name}`,
            `${copy.email}: ${displayValue(customer.email)}`,
            `${copy.phone}: ${displayValue(customer.phone)}`,
            `${copy.country}: ${displayValue(notes.country)}`,
            `${copy.configuration}:`,
            ...customBuildConfigLines(record, language),
            `${copy.description}: ${displayValue(record.message)}`,
            `${copy.images}:`,
            ...customBuildImageLines(record, bases, copy.notProvided),
        ],
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

    async function deliver(eventType, dedupeKey, resourceId, message, recipient) {
        if (!transport) return { sent: false, reason: 'disabled' };
        const claimed = await claim(eventType, dedupeKey, resourceId);
        if (!claimed) return { sent: false, reason: 'duplicate' };
        try {
            await transport.send({ from, ...message, to: recipient || to });
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
                const resourceId = String(record.id);
                const dedupeKey = record.submissionKey || resourceId;
                const workshop = await deliver(
                    'custom-build-inquiry',
                    dedupeKey,
                    resourceId,
                    customBuildMessage(record, bases),
                );
                const customerEmail = oneLine(record.customer?.email);
                const customer = customerEmail
                    ? await deliver(
                        'custom-build-customer',
                        dedupeKey,
                        resourceId,
                        customBuildCustomerMessage(record, bases),
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
    customBuildMessage,
    customBuildCustomerMessage,
    serviceCartAdminMessage,
    serviceCartCustomerMessage,
};
