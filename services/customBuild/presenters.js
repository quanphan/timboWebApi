function optionCode(option, categoryId) {
    if (option.code) return option.code;
    const prefix = `${categoryId}.`;
    if (typeof option.id === 'string' && option.id.startsWith(prefix)) {
        return option.id.slice(prefix.length);
    }
    return option.id;
}

function toPublicOption(option, categoryId) {
    return {
        id: option.id,
        code: optionCode(option, categoryId),
        name: option.name,
        description: option.description || null,
        active: option.active,
        imagePath: option.imagePath || '',
        icon: option.icon || '',
        isDefault: Boolean(option.isDefault),
        defaultForInstrumentTypeIds: Array.isArray(option.defaultForInstrumentTypeIds)
            ? option.defaultForInstrumentTypeIds.map(String)
            : [],
        sortOrder: option.sortOrder || 0,
        translations: option.translations || { vi: { name: '', description: '' }, en: { name: '', description: '' } },
        compatibility: option.compatibility && typeof option.compatibility === 'object' ? option.compatibility : {},
        attributes: option.attributes && typeof option.attributes === 'object' ? option.attributes : {},
    };
}

function isCustomerActive(option) {
    return Boolean(option) && option.active !== false;
}

function toPublicCategory(category, { includeInactive = false } = {}) {
    const options = [...(category.options || [])]
        .filter((option) => includeInactive || isCustomerActive(option))
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || String(a.id).localeCompare(String(b.id)));
    return {
        id: category.id,
        name: category.name,
        description: category.description || null,
        selectionMode: category.selectionMode,
        required: category.required,
        maxSelections: category.maxSelections,
        step: category.metadata?.step || null,
        wizardGroup: category.metadata?.wizardGroup || null,
        options: options.map((option) => toPublicOption(option, category.id)),
    };
}

function toAdminOption(option, categoryId) {
    return toPublicOption(option, categoryId);
}

function toAdminCategory(category) {
    return {
        ...toPublicCategory(category, { includeInactive: true }),
        demo: category.demo !== false,
        updatedAt: category.updatedAt ? new Date(category.updatedAt).toISOString() : null,
    };
}

module.exports = { toPublicOption, toPublicCategory, toAdminOption, toAdminCategory, optionCode, isCustomerActive };
