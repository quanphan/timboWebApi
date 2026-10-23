const crypto = require('crypto');
const jwt = require('jsonwebtoken');

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function signAccessToken(user, config) {
    return jwt.sign(
        { sub: String(user._id), email: user.email },
        config.jwtSecret,
        { expiresIn: config.accessTtl },
    );
}

function createRefreshToken() {
    return crypto.randomBytes(32).toString('base64url');
}

module.exports = { createRefreshToken, hashToken, signAccessToken };
