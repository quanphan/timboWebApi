const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { ApiError } = require('../utils/errors');
const { publicGalleryUrl } = require('../utils/galleryPaths');

const IMAGE_TYPES = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
};

const VIDEO_TYPES = {
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mp4',
};

function detectImage(buffer) {
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return { kind: 'image', mime: 'image/jpeg', ext: '.jpg' };
    }
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (buffer.length >= png.length && buffer.subarray(0, png.length).equals(png)) {
        return { kind: 'image', mime: 'image/png', ext: '.png' };
    }
    if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
        && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
        return { kind: 'image', mime: 'image/webp', ext: '.webp' };
    }
    const gif = buffer.subarray(0, 6).toString('ascii');
    if (gif === 'GIF87a' || gif === 'GIF89a') {
        return { kind: 'image', mime: 'image/gif', ext: '.gif' };
    }
    return null;
}

function detectVideo(buffer) {
    if (buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
        return { kind: 'video', mime: 'video/mp4', ext: '.mp4' };
    }
    if (buffer.length >= 4 && buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
        return { kind: 'video', mime: 'video/webm', ext: '.webm' };
    }
    return null;
}

function detectMedia(buffer) {
    return detectImage(buffer) || detectVideo(buffer);
}

function claimedKind(mime) {
    if (IMAGE_TYPES[mime]) return 'image';
    if (VIDEO_TYPES[mime]) return 'video';
    return null;
}

function safeOriginalName(name) {
    return path.basename(String(name || ''))
        .replace(/[^\w.\-()+ ]+/g, '')
        .slice(0, 80);
}

function ensureGalleryDirs(galleryDir) {
    fs.mkdirSync(path.join(galleryDir, 'images'), { recursive: true });
    fs.mkdirSync(path.join(galleryDir, 'videos'), { recursive: true });
}

function createGalleryUploadMiddleware(config) {
    ensureGalleryDirs(config.galleryDir);
    const maxBytes = Math.max(config.galleryImageMaxBytes, config.galleryVideoMaxBytes);
    const storage = multer.diskStorage({
        destination(req, file, callback) {
            const kind = claimedKind(file.mimetype);
            if (!kind) {
                callback(new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Only JPEG, PNG, WebP, GIF, MP4, and WebM files are allowed.'));
                return;
            }
            const destination = path.join(config.galleryDir, kind === 'video' ? 'videos' : 'images');
            fs.mkdirSync(destination, { recursive: true });
            callback(null, destination);
        },
        filename(req, file, callback) {
            const ext = IMAGE_TYPES[file.mimetype] || VIDEO_TYPES[file.mimetype];
            if (!ext) {
                callback(new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Only JPEG, PNG, WebP, GIF, MP4, and WebM files are allowed.'));
                return;
            }
            callback(null, `${crypto.randomBytes(16).toString('hex')}${ext}`);
        },
    });
    const upload = multer({
        storage,
        limits: { fileSize: maxBytes, files: 1 },
        fileFilter(req, file, callback) {
            if (!claimedKind(file.mimetype)) {
                callback(new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Only JPEG, PNG, WebP, GIF, MP4, and WebM files are allowed.'));
                return;
            }
            callback(null, true);
        },
    });

    return function uploadGalleryFile(req, res, next) {
        upload.single('file')(req, res, (error) => {
            if (error) {
                if (error instanceof ApiError) {
                    next(error);
                    return;
                }
                if (error.code === 'LIMIT_FILE_SIZE') {
                    next(new ApiError(413, 'PAYLOAD_TOO_LARGE', 'This file is larger than the allowed gallery limit.'));
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
                const detected = !readError && buffer ? detectMedia(buffer) : null;
                const claimed = claimedKind(req.file.mimetype);
                if (readError || !detected || detected.kind !== claimed) {
                    fs.unlink(req.file.path, () => {
                        next(new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Only JPEG, PNG, WebP, GIF, MP4, and WebM files are allowed.'));
                    });
                    return;
                }
                const limit = detected.kind === 'video' ? config.galleryVideoMaxBytes : config.galleryImageMaxBytes;
                if (req.file.size > limit) {
                    fs.unlink(req.file.path, () => {
                        next(new ApiError(413, 'PAYLOAD_TOO_LARGE', 'This file is larger than the allowed gallery limit.'));
                    });
                    return;
                }
                const folder = detected.kind === 'video' ? 'videos' : 'images';
                const expectedDir = path.resolve(config.galleryDir, folder);
                if (path.resolve(req.file.destination) !== expectedDir) {
                    fs.unlink(req.file.path, () => {
                        next(new ApiError(400, 'BAD_REQUEST', 'Upload path is invalid.'));
                    });
                    return;
                }
                const filename = path.basename(req.file.filename);
                const publicPath = publicGalleryUrl(folder, filename);
                req.uploadResult = {
                    id: crypto.randomUUID(),
                    kind: detected.kind,
                    path: publicPath,
                    url: publicPath,
                    mime: detected.mime,
                    size: req.file.size,
                    originalName: safeOriginalName(req.file.originalname),
                };
                next();
            });
        });
    };
}

module.exports = { createGalleryUploadMiddleware, ensureGalleryDirs };
