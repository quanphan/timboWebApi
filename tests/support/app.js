const fs = require('fs');
const os = require('os');
const path = require('path');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createApp } = require('../../app');

function testConfig(uploadsDir) {
    return {
        nodeEnv: 'test',
        port: 0,
        mongoUri: 'mongodb://127.0.0.1:9/isolated-test',
        dbName: 'isolated_test',
        jwtSecret: 'test-jwt-secret-value',
        refreshSecret: 'test-refresh-secret-value',
        accessTtl: '15m',
        refreshTtlMs: 7 * 24 * 60 * 60 * 1000,
        corsOrigins: ['http://localhost:5173'],
        trustProxy: false,
        jsonBodyLimit: '100kb',
        uploadsDir,
        galleryDir: path.join(uploadsDir, 'gallery'),
        galleryImageMaxBytes: 8 * 1024 * 1024,
        galleryVideoMaxBytes: 50 * 1024 * 1024,
        rateLimitEnabled: false,
        googleClientId: 'test-google-client-id',
    };
}

async function startTestApp() {
    const mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    if (uri.includes('timbowebdata')) {
        throw new Error('Refusing to use the timbowebdata database in tests.');
    }
    await mongoose.connect(uri);
    if (mongoose.connection.name === 'timbowebdata') {
        throw new Error('Refusing to use the timbowebdata database in tests.');
    }
    const uploadsDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'phanquan-uploads-'));
    const app = createApp({ config: testConfig(uploadsDir) });
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    return {
        mongod,
        uploadsDir,
        server,
        baseUrl: `http://127.0.0.1:${server.address().port}`,
    };
}

async function stopTestApp(context) {
    if (!context) {
        return;
    }
    await new Promise((resolve) => context.server.close(resolve));
    await mongoose.disconnect();
    await context.mongod.stop();
    await fs.promises.rm(context.uploadsDir, { recursive: true, force: true });
}

async function request(baseUrl, requestPath, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.token) {
        headers.authorization = `Bearer ${options.token}`;
    }
    let body;
    if (options.body !== undefined) {
        const hasContentType = Object.keys(headers).some((key) => key.toLowerCase() === 'content-type');
        if (options.json !== false && !hasContentType) {
            headers['content-type'] = 'application/json';
        }
        body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    }
    const response = await fetch(`${baseUrl}${requestPath}`, {
        method: options.method || 'GET',
        headers,
        body,
    });
    const text = await response.text();
    let parsed = text;
    if (text) {
        try {
            parsed = JSON.parse(text);
        } catch {
            parsed = text;
        }
    }
    return { status: response.status, body: parsed };
}

module.exports = { request, startTestApp, stopTestApp };
