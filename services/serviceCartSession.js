const crypto = require('node:crypto');

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function sessionSecret(config) {
    return String(config?.jwtSecret || 'test-jwt-secret-value');
}

function hashToken(token) {
    return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function signSession(secret, sessionId, expiresAtMs) {
    return crypto.createHmac('sha256', secret).update(`${sessionId}.${expiresAtMs}`).digest('base64url');
}

function tokensEqual(left, right) {
    const a = Buffer.from(String(left || ''));
    const b = Buffer.from(String(right || ''));
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

function issueSession(config) {
    const sessionId = crypto.randomUUID();
    const expiresAtMs = Date.now() + SESSION_TTL_MS;
    const token = signSession(sessionSecret(config), sessionId, expiresAtMs);
    return {
        sessionId,
        token,
        tokenHash: hashToken(token),
        expiresAt: new Date(expiresAtMs),
    };
}

function readSessionHeaders(req) {
    const sessionId = String(req.get('x-cart-session') || '').trim();
    const token = String(req.get('x-cart-token') || '').trim();
    return { sessionId, token };
}

module.exports = {
    SESSION_TTL_MS,
    hashToken,
    issueSession,
    readSessionHeaders,
    tokensEqual,
};
