function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

module.exports = { cleanString, escapeRegex };
