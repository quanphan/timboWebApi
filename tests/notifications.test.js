const assert = require('node:assert/strict');
const { after, before, describe, it } = require('node:test');
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

function notificationsFor(sent, options) {
    return createNotificationService(mailConfig(), {
        transport: recordingTransport(sent, options),
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
        assert.equal(sent.length, 1);
        assert.match(sent[0].text, /Event: custom build inquiry/);
        assert.match(sent[0].text, /series: series.classic/);
        assert.match(sent[0].text, /draftId=draft-12345678/);
        assert.match(sent[0].text, new RegExp(IMAGE_PATH.replace(/\//g, '\\/')));
        assert.match(sent[0].text, /https:\/\/api\.example\/uploads\/custom-build\//);
        assert.match(sent[0].text, new RegExp(`https://phanquanguitars.com/admin/inquiries/${created.id}`));
        assert.equal(sent[0].text.includes('/api/admin/'), false);
        assert.equal(sent[0].text.includes('lan@example.com?'), false);
        assert.equal(sent[0].html.includes('<script'), false);
        const stored = await CustomBuildInquiry.countDocuments({ id: created.id });
        assert.equal(stored, 1);
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
