const assert = require('node:assert/strict');
const { after, before, describe, it } = require('node:test');
const AdminNotification = require('../models/AdminNotification');
const CustomBuildInquiry = require('../models/CustomBuildInquiry');
const Message = require('../models/Message');
const { getConfig } = require('../config/env');
const { createInquiryService } = require('../services/customBuild/inquiryService');
const { createContactService } = require('../services/contactService');
const { createNotificationService } = require('../services/email/notificationService');
const { startTestApp, stopTestApp } = require('./support/app');

const IMAGE_PATH = `/uploads/custom-build/${'ab'.repeat(16)}.jpg`;

function mailConfig() {
    return {
        resendApiKey: 're_test_key',
        notificationEmail: 'admin@example.com',
        emailFrom: 'PhanQuan Guitars <mail@example.com>',
        publicBaseUrl: 'https://api.example',
        frontendBaseUrl: 'https://phanquanguitars.com',
    };
}

function recordingTransport(sent, options = {}) {
    return {
        async send(message) {
            if (options.failTimes && sent.length < options.failTimes) {
                const error = new Error('provider down');
                error.name = 'AxiosError';
                error.response = { status: 503, data: { email: 'lan@example.com' } };
                error.config = { headers: { Authorization: 'Bearer re_test_key' } };
                sent.push({ failed: true });
                throw error;
            }
            const storedMessages = await Message.countDocuments();
            const storedInquiries = await CustomBuildInquiry.countDocuments();
            assert.equal(storedMessages + storedInquiries > 0, true);
            sent.push(message);
        },
    };
}

function sampleCatalog() {
    return {
        categories: [
            {
                id: 'instrument-type',
                options: [{
                    id: 'instrument-type.electric-guitar',
                    code: 'electric-guitar',
                    name: 'Electric Guitar',
                    translations: { en: { name: 'Electric Guitar' }, vi: { name: 'Guitar điện' } },
                    attributes: {},
                }],
            },
            {
                id: 'series',
                options: [{
                    id: 'series.classic',
                    code: 'classic',
                    name: 'Classic',
                    translations: { en: { name: 'Classic' }, vi: { name: 'Classic' } },
                    attributes: {},
                }],
            },
            {
                id: 'body-shape',
                options: [{
                    id: 'body-shape.double-cut',
                    code: 'double-cut',
                    name: 'Double cut',
                    translations: { en: { name: 'Double cut' }, vi: { name: 'Double Cut' } },
                    attributes: {},
                }],
            },
            {
                id: 'scale',
                options: [{
                    id: 'scale.25-5',
                    code: '25-5',
                    name: '25.5″',
                    translations: { en: { name: '25.5″' }, vi: { name: '25.5″' } },
                    attributes: { display: '25.5″', wizardId: '25.5' },
                }],
            },
            {
                id: 'string-count',
                options: [{
                    id: 'string-count.6',
                    code: '6',
                    name: '6 strings',
                    translations: { en: { name: '6 strings' }, vi: { name: '6 dây' } },
                    attributes: { value: 6, wizardId: '6' },
                }],
            },
        ],
    };
}

function notificationsFor(sent, options) {
    return createNotificationService(mailConfig(), {
        transport: recordingTransport(sent, options),
        catalog: Object.prototype.hasOwnProperty.call(options || {}, 'catalog')
            ? options.catalog
            : sampleCatalog(),
    });
}

function inquiryPayload(message = 'Please build this') {
    return {
        customer: { name: 'Lan Pham', email: 'lan@example.com', phone: '0901234567' },
        configuration: { selections: { series: 'series.classic' }, notes: 'draftId=draft-12345678' },
        message,
        referenceImages: [IMAGE_PATH],
    };
}

function inquiryService(notifications) {
    return createInquiryService({
        CustomBuildInquiry,
        notifications,
        validationService: {
            async inspectConfiguration(configuration) {
                return { errors: [], configuration };
            },
        },
    });
}

describe('admin notifications', { concurrency: false }, () => {
    let context;

    before(async () => {
        context = await startTestApp();
        await AdminNotification.syncIndexes();
        await AdminNotification.deleteMany({});
        await Message.deleteMany({});
        await CustomBuildInquiry.deleteMany({});
    });

    after(async () => {
        await stopTestApp(context);
    });

    it('emails a saved contact and leaves optional phone blank in the message', async () => {
        const sent = [];
        const service = createContactService({ notifications: notificationsFor(sent) });
        const created = await service.create({
            name: 'Lan Pham',
            email: 'lan@example.com',
            message: 'Is the bass available?',
        });
        assert.equal(created.received, true);
        assert.equal(sent.length, 1);
        assert.equal(sent[0].to, 'admin@example.com');
        assert.match(sent[0].text, /Event: contact message/);
        assert.match(sent[0].text, /Name: Lan Pham/);
        assert.match(sent[0].text, /Email: lan@example.com/);
        assert.match(sent[0].text, /Phone: Not provided/);
        assert.match(sent[0].text, /Is the bass available\?/);
        assert.match(sent[0].html, /Is the bass available\?/);
        assert.match(sent[0].text, new RegExp(`Admin path: /admin/messages/${created.id}`));
        assert.match(sent[0].text, new RegExp(`https://phanquanguitars.com/admin/messages/${created.id}`));
        assert.equal(sent[0].text.includes('/api/admin/messages'), false);
        assert.equal(sent[0].text.includes('lan@example.com?'), false);
        assert.equal(sent[0].text.includes('re_test_key'), false);
    });

    it('keeps the saved contact when the email provider fails', async () => {
        const sent = [];
        const errors = [];
        const original = console.error;
        console.error = (line) => errors.push(String(line));
        try {
            const service = createContactService({
                notifications: notificationsFor(sent, { failTimes: 1 }),
            });
            const created = await service.create({
                name: 'Minh',
                email: 'minh@example.com',
                phone: '0900000000',
                message: 'Need a setup',
            });
            assert.equal(created.received, true);
            const stored = await Message.findById(created.id);
            assert.equal(stored.email, 'minh@example.com');
            assert.equal(sent.some((item) => item && item.subject), false);
            const log = errors.join('\n');
            assert.match(log, /Admin notification failed/);
            assert.equal(log.includes('re_test_key'), false);
            assert.equal(log.includes('minh@example.com'), false);
        } finally {
            console.error = original;
        }
    });

    it('does not send another email for the same contact content', async () => {
        const sent = [];
        const service = createContactService({ notifications: notificationsFor(sent) });
        const body = {
            name: 'An',
            email: 'an@example.com',
            message: 'Same question',
        };
        const first = await service.create(body);
        const second = await service.create(body);
        assert.notEqual(first.id, second.id);
        assert.equal(sent.length, 1);
        assert.equal(await Message.countDocuments({ email: 'an@example.com' }), 2);
    });

    it('emails a new custom build inquiry once and includes configuration and image links', async () => {
        const sent = [];
        const service = inquiryService(notificationsFor(sent));
        const created = await service.createInquiry(inquiryPayload());
        const replay = await service.createInquiry(inquiryPayload());
        assert.equal(created.id, replay.id);
        assert.equal(created.status, 'received');
        assert.equal(sent.length, 2);
        const workshop = sent.find((item) => item.to === 'admin@example.com');
        const customer = sent.find((item) => item.to === 'lan@example.com');
        assert.equal(Boolean(workshop), true);
        assert.equal(Boolean(customer), true);
        assert.match(workshop.subject, /New Custom Guitar Inquiry/);
        assert.match(workshop.text, /CUSTOM BUILD INQUIRY/);
        assert.match(workshop.text, /Inquiry ID:/);
        assert.match(workshop.text, /Series: Classic/);
        assert.equal(workshop.text.includes('series: series.classic'), false);
        assert.equal(workshop.text.includes('draftId='), false);
        assert.match(workshop.text, new RegExp(IMAGE_PATH.replace(/\//g, '\\/')));
        assert.match(workshop.text, /https:\/\/api\.example\/uploads\/custom-build\//);
        assert.match(workshop.text, new RegExp(`https://phanquanguitars.com/admin/inquiries/${created.id}`));
        assert.equal(workshop.text.includes('/api/admin/'), false);
        assert.match(customer.text, /Thank you for your custom guitar inquiry/);
        assert.match(customer.text, /not a confirmed order or a final quotation/);
        assert.match(customer.text, new RegExp(`Inquiry ID: ${created.id}`));
        assert.match(customer.text, /Series: Classic/);
        assert.match(customer.text, new RegExp(IMAGE_PATH.replace(/\//g, '\\/')));
        assert.equal(customer.text.includes('Admin path:'), false);
        assert.equal(customer.text.includes('lan@example.com?'), false);
        assert.equal(workshop.html.includes('<script'), false);
        const stored = await CustomBuildInquiry.countDocuments({ id: created.id });
        assert.equal(stored, 1);
    });

    it('uses Vietnamese customer copy when the inquiry language is vi', async () => {
        const sent = [];
        const service = inquiryService(notificationsFor(sent));
        const created = await service.createInquiry({
            customer: { name: 'Lan Pham', email: 'lan-vi@example.com', phone: '0901234567' },
            configuration: {
                selections: {
                    'instrument-type': 'instrument-type.solid-body-electric',
                    series: 'series.classic',
                    'body-shape': 'body-shape.double-cut',
                    scale: '25.5',
                    'string-count': '6',
                },
                notes: 'language=vi\ncountry=Vietnam\nwizard:\ninstrumentTypeId=electric-guitar\nseriesId=classic\nshapeId=double-cut\nscaleId=25.5\nstringCount=6',
            },
            message: 'Muon dan 25.5.',
        });
        const customer = sent.find((item) => item.to === 'lan-vi@example.com');
        assert.equal(created.status, 'received');
        assert.match(customer.text, /Cảm ơn bạn đã gửi yêu cầu custom guitar đến PhanQuan Guitars/);
        assert.match(customer.text, /Đây là yêu cầu custom, chưa phải xác nhận đơn hàng hoặc báo giá cuối cùng/);
        assert.equal(customer.text.includes('Thank you for your custom guitar inquiry'), false);
        assert.match(customer.text, /Loại nhạc cụ: Guitar điện/);
        assert.match(customer.text, /Series: Classic/);
        assert.match(customer.text, /Dáng thân: Double Cut/);
        assert.match(customer.text, /Chiều dài scale: 25\.5″/);
        assert.match(customer.text, /Số dây: 6 dây/);
        assert.equal((customer.text.match(/Loại nhạc cụ:/g) || []).length, 1);
        assert.match(customer.text, /Muon dan 25.5/);
    });

    it('keeps a saved custom-build inquiry when the email provider fails', async () => {
        const sent = [];
        const errors = [];
        const original = console.error;
        console.error = (line) => errors.push(String(line));
        try {
            const service = inquiryService(notificationsFor(sent, { failTimes: 2 }));
            const created = await service.createInquiry({
                customer: { name: 'Minh', email: 'minh-build@example.com', phone: '0900000000' },
                configuration: { selections: { series: 'series.classic' }, notes: 'language=en' },
                message: 'Need a quote',
            });
            assert.equal(typeof created.id, 'string');
            assert.equal(await CustomBuildInquiry.countDocuments({ id: created.id }), 1);
            assert.equal(sent.some((item) => item && item.subject), false);
            assert.match(errors.join('\n'), /Admin notification failed/);
        } finally {
            console.error = original;
        }
    });

    it('does not email or save when the inquiry is invalid', async () => {
        const sent = [];
        const service = inquiryService(notificationsFor(sent));
        await assert.rejects(
            () => service.createInquiry({ customer: { name: 'Lan' } }),
            (error) => error.status === 422,
        );
        assert.equal(sent.length, 0);
    });

    it('saves when email settings are absent', async () => {
        let called = false;
        const service = createContactService({
            notifications: createNotificationService({}, {
                transport: { async send() { called = true; } },
            }),
        });
        const created = await service.create({
            name: 'Hoa',
            email: 'hoa@example.com',
            message: 'Hello',
        });
        assert.equal(created.received, true);
        assert.equal(called, false);
    });

    it('emails a service-cart inquiry to the workshop and the customer once', async () => {
        const sent = [];
        const notifications = notificationsFor(sent);
        const record = {
            id: 'inq_cart_mail',
            submissionKey: 'service-cart:sess-mail',
            createdAt: new Date('2026-11-07T00:00:00.000Z'),
            customer: { name: 'Lan Pham', email: 'lan@example.com', phone: '+84901234567' },
            configuration: {
                notes: 'Please call in the evening.',
                selections: {
                    inquiryKind: 'service-cart',
                    country: 'Vietnam',
                    quotationRequired: false,
                    subtotal: 60,
                    items: [{
                        titleEn: 'Setup',
                        categoryNameEn: 'Guitar Repair',
                        quantity: 1,
                        unitPrice: 60,
                        lineTotal: 60,
                        currency: 'USD',
                        indicative: true,
                        options: [{ groupNameEn: 'Scope', labelEn: 'Full' }],
                    }],
                },
            },
        };
        await CustomBuildInquiry.create({
            id: record.id,
            status: 'received',
            customer: record.customer,
            configuration: record.configuration,
            message: record.configuration.notes,
            submissionKey: record.submissionKey,
        });
        const first = await notifications.notifyServiceCart(record);
        const replay = await notifications.notifyServiceCart(record);
        assert.equal(first.workshop.sent, true);
        assert.equal(first.customer.sent, true);
        assert.equal(replay.workshop.reason, 'duplicate');
        assert.equal(replay.customer.reason, 'duplicate');
        assert.equal(sent.length, 2);

        const workshop = sent.find((item) => item.to === 'admin@example.com');
        const customer = sent.find((item) => item.to === 'lan@example.com');
        assert.equal(Boolean(workshop), true);
        assert.equal(Boolean(customer), true);
        assert.match(workshop.text, /Event: service cart quotation/);
        assert.match(workshop.text, /Inquiry ID: inq_cart_mail/);
        assert.match(workshop.text, /Setup \(Guitar Repair\)/);
        assert.match(workshop.text, /Scope: Full/);
        assert.match(workshop.text, /Quantity: 1/);
        assert.match(workshop.text, /Reference price: 60 USD/);
        assert.match(workshop.text, /Admin path: \/admin\/inquiries\/inq_cart_mail/);
        assert.match(customer.text, /Inquiry ID: inq_cart_mail/);
        assert.match(customer.text, /Name: Lan Pham/);
        assert.match(customer.text, /We have received your request and will contact you shortly via email or phone to discuss the details and provide a quotation\./);
        assert.match(customer.text, /Chúng tôi đã nhận được yêu cầu của bạn và sẽ sớm liên hệ qua email hoặc điện thoại để trao đổi và gửi báo giá chi tiết\./);
        assert.equal(customer.text.includes('Admin path:'), false);
        assert.equal(customer.text.includes('re_test_key'), false);
        assert.equal(await CustomBuildInquiry.countDocuments({ id: record.id }), 1);
    });

    it('keeps a saved service-cart inquiry when the email provider fails', async () => {
        const sent = [];
        const errors = [];
        const original = console.error;
        console.error = (line) => errors.push(String(line));
        try {
            const notifications = notificationsFor(sent, { failTimes: 2 });
            const record = {
                id: 'inq_cart_fail',
                submissionKey: 'service-cart:sess-fail',
                customer: { name: 'Minh', email: 'minh-cart@example.com', phone: '0900000000' },
                configuration: { selections: { inquiryKind: 'service-cart', items: [] } },
            };
            await CustomBuildInquiry.create({
                id: record.id,
                status: 'received',
                customer: record.customer,
                configuration: record.configuration,
                submissionKey: record.submissionKey,
            });
            const result = await notifications.notifyServiceCart(record);
            assert.equal(result.workshop.sent, false);
            assert.equal(result.customer.sent, false);
            assert.equal(await CustomBuildInquiry.countDocuments({ id: record.id }), 1);
            assert.equal(sent.some((item) => item && item.subject), false);
            assert.match(errors.join('\n'), /Admin notification failed/);
        } finally {
            console.error = original;
        }
    });

    it('reads email settings without accepting a public base URL that carries secrets', () => {
        const config = getConfig({
            NODE_ENV: 'test',
            RESEND_API_KEY: 're_test_key',
            NOTIFICATION_EMAIL: 'admin@example.com',
            EMAIL_FROM: 'PhanQuan Guitars <mail@example.com>',
            PUBLIC_BASE_URL: 'https://user:secret@api.example/private',
        });
        assert.equal(config.notificationEmail, 'admin@example.com');
        assert.equal(config.emailFrom, 'PhanQuan Guitars <mail@example.com>');
        assert.equal(config.publicBaseUrl, '');
        assert.equal(config.resendApiKey, 're_test_key');
    });
});
