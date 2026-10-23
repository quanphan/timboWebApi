const rateLimit = require('express-rate-limit');

function createSensitiveLimiter(config) {
    if (!config.rateLimitEnabled) {
        return function skipRateLimit(req, res, next) {
            next();
        };
    }
    return rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 30,
        standardHeaders: true,
        legacyHeaders: false,
        message: {
            success: false,
            error: {
                code: 'RATE_LIMITED',
                message: 'Too many requests. Try again later.',
            },
        },
    });
}

module.exports = { createSensitiveLimiter };
