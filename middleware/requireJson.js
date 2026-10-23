const { ApiError } = require('../utils/errors');

function requireJson(req, res, next) {
    const contentType = req.headers['content-type'];
    if (typeof contentType !== 'string' || !contentType.toLowerCase().includes('application/json')) {
        next(new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json.'));
        return;
    }
    next();
}

module.exports = { requireJson };
