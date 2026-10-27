const axios = require('axios');

function createResendTransport({ apiKey, http = axios }) {
    return {
        async send({ from, to, subject, html, text }) {
            await http.post('https://api.resend.com/emails', {
                from,
                to: [to],
                subject,
                html,
                text,
            }, {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                timeout: 10000,
            });
        },
    };
}

module.exports = { createResendTransport };
