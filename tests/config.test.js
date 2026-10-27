const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { describeSecret, getConfig } = require('../config/env');

const productionSecrets = {
    NODE_ENV: 'production',
    PORT: '8080',
    JWT_SECRET: '1234567890123456',
    REFRESH_SECRET: 'abcdefabcdefabcd',
    MONGO_URI: 'mongodb://127.0.0.1:27017',
};

describe('secret diagnostics', () => {
    it('reports presence and length without the secret value', () => {
        assert.deepEqual(describeSecret(undefined), { present: false, lengthOk: false });
        assert.deepEqual(describeSecret(''), { present: false, lengthOk: false });
        assert.deepEqual(describeSecret('short-secret'), { present: true, lengthOk: false });
        assert.deepEqual(describeSecret('1234567890123456'), { present: true, lengthOk: true });
        assert.equal(JSON.stringify(describeSecret('1234567890123456')).includes('1234567890123456'), false);
    });
});

describe('production config', () => {
    it('allows the PhanQuan frontend when CORS_ORIGIN is missing', () => {
        const config = getConfig({ ...productionSecrets });
        assert.deepEqual(config.corsOrigins, [
            'https://phanquanguitars.com',
            'https://www.phanquanguitars.com',
            'https://phanquan-guitars.netlify.app',
        ]);
        assert.equal(config.trustProxy, false);
        assert.deepEqual(config.warnings, []);
    });

    it('keeps configured origins and adds the PhanQuan frontend', () => {
        const config = getConfig({
            ...productionSecrets,
            CORS_ORIGIN: 'https://timbocraft.example, https://guitars.example',
        });
        assert.deepEqual(config.corsOrigins, [
            'https://timbocraft.example',
            'https://guitars.example',
            'https://phanquanguitars.com',
            'https://www.phanquanguitars.com',
            'https://phanquan-guitars.netlify.app',
        ]);
    });

    it('keeps localhost origins in development', () => {
        const config = getConfig({
            ...productionSecrets,
            NODE_ENV: 'development',
        });
        assert.deepEqual(config.corsOrigins, [
            'http://localhost:5173',
            'http://127.0.0.1:5173',
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'https://phanquanguitars.com',
            'https://www.phanquanguitars.com',
            'https://phanquan-guitars.netlify.app',
        ]);
    });

    it('trusts one proxy hop on Railway', () => {
        const config = getConfig({
            ...productionSecrets,
            CORS_ORIGIN: 'https://guitars.example',
            RAILWAY_ENVIRONMENT: 'production',
        });
        assert.deepEqual(config.corsOrigins, [
            'https://guitars.example',
            'https://phanquanguitars.com',
            'https://www.phanquanguitars.com',
            'https://phanquan-guitars.netlify.app',
        ]);
        assert.equal(config.trustProxy, true);
        assert.deepEqual(config.warnings, []);
    });

    it('uses the PhanQuan site for admin email links in production', () => {
        const config = getConfig({ ...productionSecrets });
        assert.equal(config.frontendBaseUrl, 'https://phanquanguitars.com');
        assert.equal(config.publicBaseUrl, '');
    });

    it('keeps explicit frontend and API origins', () => {
        const config = getConfig({
            ...productionSecrets,
            NODE_ENV: 'development',
            FRONTEND_BASE_URL: 'http://127.0.0.1:5173',
            PUBLIC_BASE_URL: 'http://127.0.0.1:5050',
        });
        assert.equal(config.frontendBaseUrl, 'http://127.0.0.1:5173');
        assert.equal(config.publicBaseUrl, 'http://127.0.0.1:5050');
    });

    it('keeps an explicit TRUST_PROXY=false', () => {
        const config = getConfig({
            ...productionSecrets,
            CORS_ORIGIN: 'https://guitars.example',
            RAILWAY_ENVIRONMENT: 'production',
            TRUST_PROXY: 'false',
        });
        assert.equal(config.trustProxy, false);
    });
});
