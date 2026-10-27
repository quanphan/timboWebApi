const {
    COMPATIBILITY_KEYS,
    COMPATIBILITY_KEY_CATEGORIES,
    allowedCompatibilityKeys,
    groupStep,
} = require('./wizardGroups');
const { optionCode } = require('./presenters');

function optionAliases(option, categoryId) {
    const aliases = new Set();
    const code = optionCode(option, categoryId);
    if (code) aliases.add(String(code));
    if (option.id) aliases.add(String(option.id));
    const prefix = `${categoryId}.`;
    if (typeof option.id === 'string' && option.id.startsWith(prefix)) {
        aliases.add(option.id.slice(prefix.length));
    }
    const wizardId = option.attributes?.wizardId;
    if (wizardId != null && wizardId !== '') aliases.add(String(wizardId));
    if (option.attributes?.value != null && option.attributes.value !== '') {
        aliases.add(String(option.attributes.value));
    }
    return aliases;
}

function aliasesForCategory(category) {
    const allowed = new Set();
    for (const option of category.options || []) {
        for (const alias of optionAliases(option, category.id)) {
            allowed.add(alias);
        }
    }
    return allowed;
}

function findOptionByAlias(category, value) {
    const needle = String(value);
    return (category.options || []).find((option) => optionAliases(option, category.id).has(needle)) || null;
}

function validateCompatibilityOrder(compatibility, categoryId) {
    const allowed = new Set(allowedCompatibilityKeys(categoryId));
    const errors = [];
    for (const key of COMPATIBILITY_KEYS) {
        const values = compatibility?.[key];
        if (!Array.isArray(values) || values.length === 0) continue;
        if (!allowed.has(key)) {
            errors.push({
                field: `compatibility.${key}`,
                code: 'FORWARD_COMPAT',
                message: 'Compatibility may only reference wizard groups that appear before this group.',
            });
        }
    }
    return errors;
}

function alreadyReferenced(existing, key, value) {
    return (existing?.[key] || []).map(String).includes(String(value));
}

function validateCompatibilityValues(compatibility, catalogById, categoryId, existingCompatibility) {
    const errors = categoryId ? validateCompatibilityOrder(compatibility, categoryId) : [];
    for (const key of COMPATIBILITY_KEYS) {
        const values = compatibility?.[key];
        if (!Array.isArray(values) || values.length === 0) continue;
        const targetCategoryId = COMPATIBILITY_KEY_CATEGORIES[key];
        const category = catalogById.get(targetCategoryId);
        if (!category) continue;
        values.forEach((value, index) => {
            const option = findOptionByAlias(category, value);
            if (!option) {
                errors.push({
                    field: `compatibility.${key}`,
                    code: 'UNKNOWN_COMPAT',
                    message: `"${value}" is not a known ${targetCategoryId} option.`,
                    index,
                });
                return;
            }
            if (option.active === false && !alreadyReferenced(existingCompatibility, key, value)) {
                errors.push({
                    field: `compatibility.${key}`,
                    code: 'INACTIVE_COMPAT',
                    message: 'Compatibility may only reference active options.',
                    index,
                });
            }
        });
    }
    return errors;
}

function selectionAliasesForId(category, selectedId) {
    if (!category || selectedId == null || selectedId === '') return new Set();
    const option = (category.options || []).find((item) => item.id === selectedId)
        || findOptionByAlias(category, selectedId);
    return option ? optionAliases(option, category.id) : new Set([String(selectedId)]);
}

function constraintAllowsSelection(allowed, selectedAliases) {
    if (!Array.isArray(allowed) || allowed.length === 0) return true;
    if (!selectedAliases || selectedAliases.size === 0) return true;
    return allowed.some((value) => selectedAliases.has(String(value)));
}

function validateSelectionDependencies(selections, catalog) {
    const errors = [];
    if (!selections || !catalog?.categories) return errors;
    const byId = new Map(catalog.categories.map((category) => [category.id, category]));
    for (const category of catalog.categories) {
        const step = category.step ?? category.metadata?.step ?? groupStep(category.id);
        if (Number(step) < 4) continue;
        const selectedId = selections[category.id];
        if (!selectedId) continue;
        const option = (category.options || []).find((item) => item.id === selectedId)
            || findOptionByAlias(category, selectedId);
        if (!option) continue;
        const compatibility = option.compatibility && typeof option.compatibility === 'object'
            ? option.compatibility
            : {};
        const allowedKeys = new Set(allowedCompatibilityKeys(category.id));
        for (const key of COMPATIBILITY_KEYS) {
            if (!allowedKeys.has(key)) continue;
            const targetCategoryId = COMPATIBILITY_KEY_CATEGORIES[key];
            const targetCategory = byId.get(targetCategoryId);
            const selectedAliases = selectionAliasesForId(targetCategory, selections[targetCategoryId]);
            if (!constraintAllowsSelection(compatibility[key], selectedAliases)) {
                errors.push({
                    field: `selections.${category.id}`,
                    code: 'INCOMPATIBLE_OPTION',
                    message: 'This option is not compatible with the selected instrument type or series.',
                });
                break;
            }
        }
    }
    return errors;
}

function validateDefaultScopes({ defaultForInstrumentTypeIds, compatibility, active, catalogById, existingTypeIds }) {
    const errors = [];
    const types = defaultForInstrumentTypeIds || [];
    if (!types.length) return errors;
    if (!active) {
        errors.push({
            field: 'defaultForInstrumentTypeIds',
            code: 'INVALID',
            message: 'A default must refer to an active option.',
        });
        return errors;
    }
    const typeCategory = catalogById.get('instrument-type');
    if (typeCategory) {
        for (const typeId of types) {
            const option = findOptionByAlias(typeCategory, typeId);
            if (!option) {
                errors.push({
                    field: 'defaultForInstrumentTypeIds',
                    code: 'UNKNOWN_COMPAT',
                    message: `"${typeId}" is not a known instrument type.`,
                });
                continue;
            }
            if (option.active === false && !alreadyReferenced({ defaultForInstrumentTypeIds: existingTypeIds }, 'defaultForInstrumentTypeIds', typeId)) {
                errors.push({
                    field: 'defaultForInstrumentTypeIds',
                    code: 'INACTIVE_COMPAT',
                    message: 'A default may only refer to an active instrument type.',
                });
            }
        }
    }
    const visibleFor = compatibility?.instrumentTypeIds || [];
    if (visibleFor.length) {
        for (const typeId of types) {
            if (!visibleFor.map(String).includes(String(typeId))) {
                errors.push({
                    field: 'defaultForInstrumentTypeIds',
                    code: 'INCOMPATIBLE_DEFAULT',
                    message: 'A default must be compatible with the instrument types it applies to.',
                });
            }
        }
    }
    return errors;
}

module.exports = {
    optionAliases,
    aliasesForCategory,
    validateCompatibilityOrder,
    validateCompatibilityValues,
    validateSelectionDependencies,
    validateDefaultScopes,
};
