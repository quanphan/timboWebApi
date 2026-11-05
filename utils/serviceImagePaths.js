const { ApiError } = require('./errors');

function readServiceImagePath(value, field = 'imagePath') {
    if (value === undefined || value === null || value === '') {
        return null;
    }
    const imagePath = String(value).trim();
    if (!imagePath.startsWith('/uploads/') || imagePath.includes('..') || imagePath.includes('\\')) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Service record is invalid.', [{
            field,
            code: 'INVALID',
            message: 'Image path must be a relative /uploads path.',
        }]);
    }
    return imagePath;
}

module.exports = { readServiceImagePath };
