const assert = require('node:assert/strict');
const http = require('node:http');
const { after, before, describe, it } = require('node:test');
const { createApp } = require('../app');
const { getConfig } = require('../config/env');

const PHANQUAN_ORIGIN = 'https://phanquan-guitars.netlify.app';
const TIMBOCRAFT_ORIGIN = 'https://timbocraft.example';

function listen(app) {
    return new Promise((resolve) => {
        const server = app.listen(0, '127.0.0.1', () => resolve(server));
    });
}

function send(url, method, headers) {
    return new Promise((resolve, reject) => {
        const req = http.request(url, { method, headers }, (res) => {
            res.resume();
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers }));
        });
        req.on('error', reject);
        req.end();
    });
}

describe('CORS preflight', () => {
    let server;
    let baseUrl;

    before(async () => {
        const config = getConfig({
            NODE_ENV: 'production',
            PORT: '8080',
            JWT_SECRET: '1234567890123456',
            REFRESH_SECRET: 'abcdefabcdefabcd',
            MONGO_URI: 'mongodb://127.0.0.1:27017',
            CORS_ORIGIN: TIMBOCRAFT_ORIGIN,
        });
        server = await listen(createApp({ config }));
        baseUrl = `http://127.0.0.1:${server.address().port}`;
    });

    after(async () => {
        await new Promise((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
        });
    });

    it('allows the PhanQuan Netlify origin without using a wildcard', async () => {
        const response = await send(`${baseUrl}/api/health`, 'OPTIONS', {
            Origin: PHANQUAN_ORIGIN,
            'Access-Control-Request-Method': 'GET',
            'Access-Control-Request-Headers': 'Content-Type,Authorization',
        });
        assert.equal(response.status, 204);
        assert.equal(response.headers['access-control-allow-origin'], PHANQUAN_ORIGIN);
        assert.equal(response.headers['access-control-allow-credentials'], 'true');
        assert.equal(response.headers['access-control-allow-origin'] === '*', false);
        assert.match(response.headers['access-control-allow-methods'], /GET/);
        assert.match(response.headers['access-control-allow-headers'], /Authorization/);
    });

    it('keeps an existing configured origin allowed', async () => {
        const response = await send(`${baseUrl}/api/health`, 'OPTIONS', {
            Origin: TIMBOCRAFT_ORIGIN,
            'Access-Control-Request-Method': 'POST',
        });
        assert.equal(response.status, 204);
        assert.equal(response.headers['access-control-allow-origin'], TIMBOCRAFT_ORIGIN);
        assert.equal(response.headers['access-control-allow-credentials'], 'true');
    });

    it('does not reflect an unknown origin', async () => {
        const response = await send(`${baseUrl}/api/health`, 'OPTIONS', {
            Origin: 'https://evil.example',
            'Access-Control-Request-Method': 'GET',
        });
        assert.equal(response.headers['access-control-allow-origin'], undefined);
    });
});
