const axios = require('axios');

function createResendTransport({ apiKey, http = axios }) {
    return {
        async send({ from, to, subject, html, text, replyTo }) {
            const payload = {
                from,
                to: [to],
                subject,
                html,
                text,
            };
            if (replyTo && !/[\r\n]/.test(String(replyTo))) {
                payload.reply_to = replyTo;
            }
            const response = await http.post('https://api.resend.com/emails', payload, {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                timeout: 10000,
            });
            return response && response.data ? response.data : {};
        },
    };
}

module.exports = { createResendTransport };
