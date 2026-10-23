const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { request, startTestApp, stopTestApp } = require('./support/app');

let context;

before(async () => {
    context = await startTestApp();
});

after(async () => {
    await stopTestApp(context);
});

test('GET /api/health reports database readiness without secrets', async () => {
    const response = await request(context.baseUrl, '/api/health');
    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.status, 'ok');
    assert.equal(response.body.data.database, 'up');
    assert.equal(JSON.stringify(response.body).includes('mongodb'), false);
    assert.equal(response.body.data.timestamp !== undefined, true);
});

test('unknown routes return the JSON error envelope', async () => {
    const response = await request(context.baseUrl, '/api/does-not-exist');
    assert.equal(response.status, 404);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, 'NOT_FOUND');
});
