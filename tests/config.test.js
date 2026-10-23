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
    it('keeps listening when CORS_ORIGIN is missing', () => {
        const config = getConfig({ ...productionSecrets });
        assert.deepEqual(config.corsOrigins, []);
        assert.equal(config.trustProxy, false);
        assert.equal(config.warnings.length, 1);
    });

    it('trusts one proxy hop on Railway', () => {
        const config = getConfig({
            ...productionSecrets,
            CORS_ORIGIN: 'https://guitars.example',
            RAILWAY_ENVIRONMENT: 'production',
        });
        assert.deepEqual(config.corsOrigins, ['https://guitars.example']);
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
