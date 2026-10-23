const CATEGORY_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const OPTION_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isCategoryId(value) {
    return typeof value === 'string' && value.length <= 40 && CATEGORY_ID_PATTERN.test(value);
}

function isOptionId(value) {
    return typeof value === 'string' && value.length <= 80 && OPTION_ID_PATTERN.test(value);
}

module.exports = { isCategoryId, isOptionId };
