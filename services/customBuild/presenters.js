function toPublicOption(option) {
    return {
        id: option.id,
        name: option.name,
        description: option.description || null,
        active: option.active,
    };
}

function toPublicCategory(category) {
    return {
        id: category.id,
        name: category.name,
        description: category.description || null,
        selectionMode: category.selectionMode,
        required: category.required,
        maxSelections: category.maxSelections,
        options: (category.options || []).map(toPublicOption),
    };
}

module.exports = { toPublicOption, toPublicCategory };
