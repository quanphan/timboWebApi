const { ApiError } = require('../utils/errors');

function asyncHandler(handler) {
    return function wrapped(req, res, next) {
        Promise.resolve(handler(req, res, next)).catch(next);
    };
}

function notFoundHandler(req, res) {
    res.status(404).json({
        success: false,
        error: {
            code: 'NOT_FOUND',
            message: 'The requested resource was not found.',
        },
    });
}

function normalizeError(error) {
    if (error instanceof ApiError) {
        return error;
    }
    if (error && (
        error.name === 'MongoNotConnectedError'
        || error.name === 'MongoNetworkError'
        || error.name === 'MongoServerSelectionError'
        || error.name === 'MongooseServerSelectionError'
    )) {
        return new ApiError(500, 'DATA_UNAVAILABLE', 'The database is not available.');
    }
    if (error && error.name === 'ValidationError') {
        const details = Object.values(error.errors || {}).map((item) => ({
            field: item.path,
            code: 'INVALID',
            message: item.message,
        }));
        return new ApiError(422, 'VALIDATION_ERROR', 'Request data is invalid.', details);
    }
    if (error && (error.code === 11000 || error.code === 11001)) {
        return new ApiError(409, 'CONFLICT', 'A record with this value already exists.');
    }
    if (error && error.name === 'CastError') {
        return new ApiError(400, 'BAD_REQUEST', 'A resource id is invalid.');
    }
    if (error && (error.type === 'entity.parse.failed' || (error instanceof SyntaxError && error.status === 400))) {
        return new ApiError(400, 'BAD_REQUEST', 'Request body must be valid JSON.');
    }
    if (error && (error.type === 'entity.too.large' || error.status === 413)) {
        return new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
    }
    return null;
}

function createErrorHandler({ nodeEnv }) {
    return function errorHandler(error, req, res, next) {
        if (res.headersSent) {
            next(error);
            return;
        }
        const normalized = normalizeError(error);
        const status = normalized ? normalized.status : 500;
        const code = normalized ? normalized.code : 'INTERNAL_ERROR';
        if (status >= 500) {
            console.error(JSON.stringify({
                level: 'error',
                method: req.method,
                path: req.path,
                code,
                name: error.name,
            }));
        }
        const body = {
            success: false,
            error: {
                code,
                message: normalized
                    ? normalized.message
                    : (nodeEnv === 'development' ? 'An unexpected error occurred.' : 'An unexpected error occurred.'),
            },
        };
        if (normalized && normalized.details && normalized.details.length) {
            body.error.details = normalized.details;
        }
        res.status(status).json(body);
    };
}

module.exports = { asyncHandler, createErrorHandler, notFoundHandler };
