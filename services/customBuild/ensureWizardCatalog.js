const { wizardCategories } = require('./wizardCatalog');

function presentStoredOption(option) {
    return {
        id: option.id,
        name: option.name,
        description: option.description || null,
        active: option.active !== false,
        code: option.code || '',
        imagePath: option.imagePath || '',
        icon: option.icon || '',
        isDefault: Boolean(option.isDefault),
        defaultForInstrumentTypeIds: Array.isArray(option.defaultForInstrumentTypeIds)
            ? option.defaultForInstrumentTypeIds
            : [],
        sortOrder: option.sortOrder || 0,
        translations: option.translations,
        compatibility: option.compatibility,
        attributes: option.attributes,
        metadata: option.metadata,
    };
}

async function ensureWizardCatalog(CustomBuildOption) {
    let inserted = 0;
    let updated = 0;
    const catalog = wizardCategories();

    for (const category of catalog) {
        const existing = await CustomBuildOption.findOne({ id: category.id });
        if (!existing) {
            await CustomBuildOption.create({
                id: category.id,
                name: category.name,
                description: category.description || null,
                selectionMode: category.selectionMode,
                required: category.required,
                maxSelections: category.maxSelections,
                sortOrder: category.sortOrder,
                demo: true,
                metadata: category.metadata,
                options: category.options.map(presentStoredOption),
            });
            inserted += 1;
            continue;
        }

        const have = new Set((existing.options || []).map((item) => item.id));
        const deleted = new Set(existing.metadata?.deletedOptionIds || []);
        const missing = category.options.filter((item) => !have.has(item.id) && !deleted.has(item.id));
        let changed = false;
        if (existing.selectionMode !== category.selectionMode) {
            existing.selectionMode = category.selectionMode;
            changed = true;
        }
        if (existing.maxSelections !== category.maxSelections) {
            existing.maxSelections = category.maxSelections;
            changed = true;
        }
        if (missing.length) {
            existing.options = [...existing.options, ...missing.map(presentStoredOption)];
            changed = true;
        }
        const metadata = { ...(existing.metadata || {}), ...category.metadata, deletedOptionIds: [...deleted] };
        if (JSON.stringify(existing.metadata || {}) !== JSON.stringify(metadata)) {
            existing.metadata = metadata;
            changed = true;
        }
        if (changed) {
            await existing.save();
            updated += 1;
        }
    }

    return { inserted, updated };
}

module.exports = { ensureWizardCatalog };
