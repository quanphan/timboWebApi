const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { getConfig } = require('../config/env');

const productionSecrets = {
    NODE_ENV: 'production',
    PORT: '8080',
    JWT_SECRET: '1234567890123456',
    REFRESH_SECRET: 'abcdefabcdefabcd',
    MONGO_URI: 'mongodb://127.0.0.1:27017',
};

describe('production config', () => {
    it('allows the PhanQuan frontend when CORS_ORIGIN is missing', () => {
        const config = getConfig({ ...productionSecrets });
        assert.deepEqual(config.corsOrigins, ['https://phanquan-guitars.netlify.app']);
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
            'https://phanquan-guitars.netlify.app',
        ]);
        assert.equal(config.trustProxy, true);
        assert.deepEqual(config.warnings, []);
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
