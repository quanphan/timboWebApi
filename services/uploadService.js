const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { ApiError } = require('../utils/errors');
const { ensureWritableDirectory } = require('../utils/pageImagePaths');

const ALLOWED_TYPES = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
};

function detectImage(buffer) {
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return { mime: 'image/jpeg', ext: '.jpg' };
    }
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (buffer.length >= png.length && buffer.subarray(0, png.length).equals(png)) {
        return { mime: 'image/png', ext: '.png' };
    }
    if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
        return { mime: 'image/webp', ext: '.webp' };
    }
    const gif = buffer.subarray(0, 6).toString('ascii');
    if (gif === 'GIF87a' || gif === 'GIF89a') {
        return { mime: 'image/gif', ext: '.gif' };
    }
    return null;
}

function uploadScope(req) {
    const scope = req.query.scope === undefined ? '' : String(req.query.scope);
    if (scope !== '' && scope !== 'guitars' && scope !== 'categories' && scope !== 'pages') {
        return null;
    }
    return scope;
}

function storageUnavailable() {
    return new ApiError(503, 'DATA_UNAVAILABLE', 'The upload directory is not available.');
}

function createUploadMiddleware(config) {
    const storage = multer.diskStorage({
        destination(req, file, callback) {
            const scope = uploadScope(req);
            if (scope === null) {
                callback(new ApiError(400, 'BAD_REQUEST', 'Upload scope must be guitars, categories, or pages.'));
                return;
            }
            const destination = scope ? path.join(config.uploadsDir, scope) : config.uploadsDir;
            const ready = ensureWritableDirectory(destination);
            if (!ready.ok) {
                callback(storageUnavailable());
                return;
            }
            callback(null, destination);
        },
        filename(req, file, callback) {
            const extension = ALLOWED_TYPES[file.mimetype];
            if (!extension) {
                callback(new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Only JPEG, PNG, WebP, and GIF images are allowed.'));
                return;
            }
            callback(null, `${crypto.randomBytes(16).toString('hex')}${extension}`);
        },
    });
    const upload = multer({
        storage,
        limits: { fileSize: 5 * 1024 * 1024, files: 1 },
        fileFilter(req, file, callback) {
            if (!ALLOWED_TYPES[file.mimetype]) {
                callback(new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Only JPEG, PNG, WebP, and GIF images are allowed.'));
                return;
            }
            callback(null, true);
        },
    });

    return function uploadSingle(req, res, next) {
        if (uploadScope(req) === null) {
            next(new ApiError(400, 'BAD_REQUEST', 'Upload scope must be guitars, categories, or pages.'));
            return;
        }
        upload.single('file')(req, res, (error) => {
            if (error) {
                if (error instanceof ApiError) {
                    next(error);
                    return;
                }
                if (error.code === 'LIMIT_FILE_SIZE') {
                    next(new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Image must be 5 MB or smaller.'));
                    return;
                }
                next(new ApiError(400, 'BAD_REQUEST', 'Upload failed.'));
                return;
            }
            if (!req.file) {
                next();
                return;
            }
            fs.readFile(req.file.path, (readError, buffer) => {
                const detected = !readError && buffer ? detectImage(buffer) : null;
                const claimed = ALLOWED_TYPES[req.file.mimetype];
                if (readError || !detected || detected.ext !== claimed) {
                    fs.unlink(req.file.path, () => {
                        next(new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Only JPEG, PNG, WebP, and GIF images are allowed.'));
                    });
                    return;
                }
                const relative = path.relative(config.uploadsDir, req.file.path);
                if (relative.startsWith('..') || path.isAbsolute(relative)) {
                    fs.unlink(req.file.path, () => {
                        next(new ApiError(400, 'BAD_REQUEST', 'Upload path is invalid.'));
                    });
                    return;
                }
                const url = `/uploads/${relative.split(path.sep).join('/')}`;
                req.uploadResult = { path: url, url };
                next();
            });
        });
    };
}

function publicUpload(file) {
    const filename = path.basename(file.filename);
    return { path: `/uploads/${filename}`, url: `/uploads/${filename}` };
}

const CUSTOM_BUILD_SCOPE = 'custom-build';
const CUSTOM_BUILD_TYPES = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
};
const CUSTOM_BUILD_PATH = /^\/uploads\/custom-build\/([a-f0-9]{32}\.(?:jpg|png|webp))$/i;
const CUSTOM_BUILD_MAX_IMAGES = 5;

function customBuildFilename(publicPath) {
    const match = CUSTOM_BUILD_PATH.exec(String(publicPath || '').trim());
    return match ? match[1].toLowerCase() : null;
}

function isCustomBuildUploadPath(publicPath) {
    return Boolean(customBuildFilename(publicPath));
}

function sanitizeCustomBuildUploadPaths(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const paths = [];
    for (const item of value) {
        if (typeof item !== 'string') continue;
        const trimmed = item.trim();
        const filename = customBuildFilename(trimmed);
        if (!filename) continue;
        const normalized = `/uploads/${CUSTOM_BUILD_SCOPE}/${filename}`;
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        paths.push(normalized);
        if (paths.length >= CUSTOM_BUILD_MAX_IMAGES) break;
    }
    return paths;
}

function createCustomBuildUploadMiddleware(config) {
    fs.mkdirSync(path.join(config.uploadsDir, CUSTOM_BUILD_SCOPE), { recursive: true });
    const storage = multer.diskStorage({
        destination(req, file, callback) {
            const destination = path.join(config.uploadsDir, CUSTOM_BUILD_SCOPE);
            fs.mkdirSync(destination, { recursive: true });
            callback(null, destination);
        },
        filename(req, file, callback) {
            const extension = CUSTOM_BUILD_TYPES[file.mimetype];
            if (!extension) {
                callback(new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Only JPEG, PNG, and WebP images are allowed.'));
                return;
            }
            callback(null, `${crypto.randomBytes(16).toString('hex')}${extension}`);
        },
    });
    const upload = multer({
        storage,
        limits: { fileSize: 5 * 1024 * 1024, files: 1 },
        fileFilter(req, file, callback) {
            if (!CUSTOM_BUILD_TYPES[file.mimetype]) {
                callback(new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Only JPEG, PNG, and WebP images are allowed.'));
                return;
            }
            callback(null, true);
        },
    });

    return function uploadSingle(req, res, next) {
        upload.single('file')(req, res, (error) => {
            if (error) {
                if (error instanceof ApiError) {
                    next(error);
                    return;
                }
                if (error.code === 'LIMIT_FILE_SIZE') {
                    next(new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Image must be 5 MB or smaller.'));
                    return;
                }
                next(new ApiError(400, 'BAD_REQUEST', 'Upload failed.'));
                return;
            }
            if (!req.file) {
                next();
                return;
            }
            fs.readFile(req.file.path, (readError, buffer) => {
                const detected = !readError && buffer ? detectImage(buffer) : null;
                const claimed = CUSTOM_BUILD_TYPES[req.file.mimetype];
                if (readError || !detected || !claimed || detected.ext !== claimed) {
                    fs.unlink(req.file.path, () => {
                        next(new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Only JPEG, PNG, and WebP images are allowed.'));
                    });
                    return;
                }
                const relative = path.relative(config.uploadsDir, req.file.path);
                if (relative.startsWith('..') || path.isAbsolute(relative)) {
                    fs.unlink(req.file.path, () => {
                        next(new ApiError(400, 'BAD_REQUEST', 'Upload path is invalid.'));
                    });
                    return;
                }
                const url = `/uploads/${relative.split(path.sep).join('/')}`;
                req.uploadResult = { path: url, url };
                next();
            });
        });
    };
}

function deleteCustomBuildUploadFile(config, publicPath) {
    const filename = customBuildFilename(publicPath);
    if (!filename) {
        throw new ApiError(400, 'BAD_REQUEST', 'Upload path is invalid.');
    }
    const folder = path.resolve(config.uploadsDir, CUSTOM_BUILD_SCOPE);
    const absolute = path.resolve(folder, filename);
    if (absolute !== path.join(folder, filename)) {
        throw new ApiError(400, 'BAD_REQUEST', 'Upload path is invalid.');
    }
    try {
        fs.unlinkSync(absolute);
        return { deleted: true };
    } catch (error) {
        if (error && error.code === 'ENOENT') {
            return { deleted: false };
        }
        throw error;
    }
}

function customBuildUploadExists(uploadsDir, publicPath) {
    const filename = customBuildFilename(publicPath);
    if (!filename || !uploadsDir) return false;
    const folder = path.resolve(uploadsDir, CUSTOM_BUILD_SCOPE);
    const absolute = path.resolve(folder, filename);
    if (absolute !== path.join(folder, filename)) return false;
    return fs.existsSync(absolute);
}

module.exports = {
    createUploadMiddleware,
    publicUpload,
    createCustomBuildUploadMiddleware,
    deleteCustomBuildUploadFile,
    customBuildUploadExists,
    isCustomBuildUploadPath,
    sanitizeCustomBuildUploadPaths,
    CUSTOM_BUILD_MAX_IMAGES,
};
