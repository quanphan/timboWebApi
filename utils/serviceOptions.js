const crypto = require('crypto');
const { ApiError } = require('./errors');
const { cleanString } = require('./text');

const ID_PATTERN = /^[a-zA-Z0-9_-]{1,40}$/;
const MAX_GROUPS = 8;
const MAX_VALUES = 40;
const MAX_COMBOS = 200;
const MAX_LABEL = 80;

function newOptionId(prefix) {
    return `${prefix}${crypto.randomBytes(6).toString('hex')}`;
}

function comboKey(valueIds) {
    return [...new Set((valueIds || []).map(String))].sort().join('|');
}

function readOptionalPrice(value, field) {
    if (value === undefined || value === null || value === '') {
        return null;
    }
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Service record is invalid.', [{
            field,
            code: 'INVALID',
            message: 'Price must be a non-negative number.',
        }]);
    }
    return amount;
}

function presentGroupLocale(value, fallbackName) {
    return {
        name: value && value.name ? value.name : fallbackName,
    };
}

function presentValueLocale(value, fallbackLabel) {
    return {
        label: value && value.label ? value.label : fallbackLabel,
    };
}

function presentOptionGroups(groups) {
    if (!Array.isArray(groups)) return [];
    return groups.map((group) => {
        const name = group.name || (group.translations && group.translations.en && group.translations.en.name) || '';
        return {
            id: String(group.id),
            name,
            translations: {
                vi: presentGroupLocale(group.translations && group.translations.vi, name),
                en: presentGroupLocale(group.translations && group.translations.en, name),
            },
            values: Array.isArray(group.values)
                ? group.values.map((item) => {
                    const label = item.label || (item.translations && item.translations.en && item.translations.en.label) || '';
                    const price = item.price == null || Number(item.price) <= 0 ? null : item.price;
                    return {
                        id: String(item.id),
                        label,
                        translations: {
                            vi: presentValueLocale(item.translations && item.translations.vi, label),
                            en: presentValueLocale(item.translations && item.translations.en, label),
                        },
                        price,
                    };
                })
                : [],
        };
    }).filter((group) => group.id && group.values.length > 0);
}

function presentVariantPrices(rows, validIds) {
    if (!Array.isArray(rows)) return [];
    return rows.map((row) => {
        const valueIds = Array.isArray(row.valueIds) ? row.valueIds.map(String).filter((id) => validIds.has(id)) : [];
        const price = row.price == null || Number(row.price) <= 0 ? null : row.price;
        return { valueIds, price };
    }).filter((row) => row.valueIds.length > 0 && row.price != null);
}

function collectValueIds(groups) {
    const ids = new Set();
    for (const group of groups || []) {
        for (const value of group.values || []) ids.add(String(value.id));
    }
    return ids;
}

function findValue(groups, valueId) {
    for (const group of groups || []) {
        const match = (group.values || []).find((item) => String(item.id) === String(valueId));
        if (match) return match;
    }
    return null;
}

function resolveServiceItemPrice(item, selectedIds) {
    const defaultPrice = item && item.price != null && Number(item.price) > 0 ? item.price : null;
    const groups = presentOptionGroups(item && item.optionGroups);
    if (!groups.length) return defaultPrice;
    const selected = Array.isArray(selectedIds) ? selectedIds.map(String) : [];
    const combos = presentVariantPrices(item && item.variantPrices, collectValueIds(groups));
    const key = comboKey(selected);
    const combo = combos.find((row) => comboKey(row.valueIds) === key);
    if (combo) return combo.price;
    const priced = selected
        .map((id) => findValue(groups, id))
        .filter((value) => value && value.price != null);
    if (priced.length === 1) return priced[0].price;
    return defaultPrice;
}

function readLocaleName(value, field, key) {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'object' || Array.isArray(value)) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Service record is invalid.', [{
            field,
            code: 'INVALID',
            message: 'Translation must be an object.',
        }]);
    }
    const text = cleanString(value[key]);
    if (text.length > MAX_LABEL) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Service record is invalid.', [{
            field: `${field}.${key}`,
            code: 'INVALID',
            message: 'Option label is too long.',
        }]);
    }
    return text || null;
}

function readStableId(value, prefix) {
    const id = cleanString(value);
    if (id && ID_PATTERN.test(id)) return id;
    return newOptionId(prefix);
}

function readOptionGroups(value) {
    if (value === undefined) return undefined;
    if (value === null) return [];
    if (!Array.isArray(value)) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Service record is invalid.', [{
            field: 'optionGroups',
            code: 'INVALID',
            message: 'Option groups must be an array.',
        }]);
    }
    if (value.length > MAX_GROUPS) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Service record is invalid.', [{
            field: 'optionGroups',
            code: 'INVALID',
            message: `Use at most ${MAX_GROUPS} option groups.`,
        }]);
    }
    const seen = new Set();
    return value.map((group, groupIndex) => {
        if (!group || typeof group !== 'object' || Array.isArray(group)) {
            throw new ApiError(422, 'VALIDATION_ERROR', 'Service record is invalid.', [{
                field: `optionGroups.${groupIndex}`,
                code: 'INVALID',
                message: 'Option group is invalid.',
            }]);
        }
        const id = readStableId(group.id, 'g');
        if (seen.has(id)) {
            throw new ApiError(422, 'VALIDATION_ERROR', 'Service record is invalid.', [{
                field: `optionGroups.${groupIndex}.id`,
                code: 'INVALID',
                message: 'Option group ids must be unique.',
            }]);
        }
        seen.add(id);
        const translations = {
            en: { name: readLocaleName(group.translations && group.translations.en, `optionGroups.${groupIndex}.translations.en`, 'name') },
            vi: { name: readLocaleName(group.translations && group.translations.vi, `optionGroups.${groupIndex}.translations.vi`, 'name') },
        };
        const name = translations.en.name || translations.vi.name || cleanString(group.name);
        if (!name) {
            throw new ApiError(422, 'VALIDATION_ERROR', 'Service record is invalid.', [{
                field: `optionGroups.${groupIndex}.translations.en.name`,
                code: 'REQUIRED',
                message: 'Each option group needs a name.',
            }]);
        }
        if (!Array.isArray(group.values) || group.values.length === 0) {
            throw new ApiError(422, 'VALIDATION_ERROR', 'Service record is invalid.', [{
                field: `optionGroups.${groupIndex}.values`,
                code: 'REQUIRED',
                message: 'Each option group needs at least one value.',
            }]);
        }
        if (group.values.length > MAX_VALUES) {
            throw new ApiError(422, 'VALIDATION_ERROR', 'Service record is invalid.', [{
                field: `optionGroups.${groupIndex}.values`,
                code: 'INVALID',
                message: `Use at most ${MAX_VALUES} values in a group.`,
            }]);
        }
        const values = group.values.map((item, valueIndex) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
                throw new ApiError(422, 'VALIDATION_ERROR', 'Service record is invalid.', [{
                    field: `optionGroups.${groupIndex}.values.${valueIndex}`,
                    code: 'INVALID',
                    message: 'Option value is invalid.',
                }]);
            }
            const valueId = readStableId(item.id, 'v');
            if (seen.has(valueId)) {
                throw new ApiError(422, 'VALIDATION_ERROR', 'Service record is invalid.', [{
                    field: `optionGroups.${groupIndex}.values.${valueIndex}.id`,
                    code: 'INVALID',
                    message: 'Option value ids must be unique.',
                }]);
            }
            seen.add(valueId);
            const valueTranslations = {
                en: { label: readLocaleName(item.translations && item.translations.en, `optionGroups.${groupIndex}.values.${valueIndex}.translations.en`, 'label') },
                vi: { label: readLocaleName(item.translations && item.translations.vi, `optionGroups.${groupIndex}.values.${valueIndex}.translations.vi`, 'label') },
            };
            const label = valueTranslations.en.label || valueTranslations.vi.label || cleanString(item.label);
            if (!label) {
                throw new ApiError(422, 'VALIDATION_ERROR', 'Service record is invalid.', [{
                    field: `optionGroups.${groupIndex}.values.${valueIndex}.translations.en.label`,
                    code: 'REQUIRED',
                    message: 'Each option value needs a label.',
                }]);
            }
            return {
                id: valueId,
                label,
                translations: valueTranslations,
                price: readOptionalPrice(item.price, `optionGroups.${groupIndex}.values.${valueIndex}.price`),
            };
        });
        return { id, name, translations, values };
    });
}

function readVariantPrices(value, groups) {
    if (value === undefined) return undefined;
    if (value === null) return [];
    if (!Array.isArray(value)) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Service record is invalid.', [{
            field: 'variantPrices',
            code: 'INVALID',
            message: 'Combination prices must be an array.',
        }]);
    }
    if (value.length > MAX_COMBOS) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Service record is invalid.', [{
            field: 'variantPrices',
            code: 'INVALID',
            message: `Use at most ${MAX_COMBOS} combination prices.`,
        }]);
    }
    const validIds = collectValueIds(groups || []);
    const seen = new Set();
    return value.map((row, index) => {
        if (!row || typeof row !== 'object' || Array.isArray(row)) {
            throw new ApiError(422, 'VALIDATION_ERROR', 'Service record is invalid.', [{
                field: `variantPrices.${index}`,
                code: 'INVALID',
                message: 'Combination price is invalid.',
            }]);
        }
        const valueIds = Array.isArray(row.valueIds) ? [...new Set(row.valueIds.map(String))] : [];
        if (!valueIds.length || valueIds.some((id) => !validIds.has(id))) {
            throw new ApiError(422, 'VALIDATION_ERROR', 'Service record is invalid.', [{
                field: `variantPrices.${index}.valueIds`,
                code: 'INVALID',
                message: 'Combination prices must use option values from this item.',
            }]);
        }
        const key = comboKey(valueIds);
        if (seen.has(key)) {
            throw new ApiError(422, 'VALIDATION_ERROR', 'Service record is invalid.', [{
                field: `variantPrices.${index}.valueIds`,
                code: 'INVALID',
                message: 'Each combination can have only one price.',
            }]);
        }
        seen.add(key);
        const price = readOptionalPrice(row.price, `variantPrices.${index}.price`);
        if (price == null) {
            throw new ApiError(422, 'VALIDATION_ERROR', 'Service record is invalid.', [{
                field: `variantPrices.${index}.price`,
                code: 'REQUIRED',
                message: 'Combination price is required when a combination is listed.',
            }]);
        }
        return { valueIds, price };
    });
}

module.exports = {
    comboKey,
    presentOptionGroups,
    presentVariantPrices,
    collectValueIds,
    readOptionGroups,
    readVariantPrices,
    resolveServiceItemPrice,
};
