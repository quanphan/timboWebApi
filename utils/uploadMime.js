const path = require('path');

const TYPES = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.mp4': 'video/mp4',
    '.m4v': 'video/mp4',
    '.mov': 'video/mp4',
    '.webm': 'video/webm',
};

function contentTypeForUpload(filePath) {
    const ext = path.extname(String(filePath || '')).toLowerCase();
    return TYPES[ext] || '';
}

function setUploadHeaders(res, filePath) {
    const type = contentTypeForUpload(filePath);
    if (type) res.setHeader('Content-Type', type);
}

module.exports = { contentTypeForUpload, setUploadHeaders };
