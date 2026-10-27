const { DEMO_CATEGORIES } = require('./demoCatalog');
const { ensureWizardCatalog } = require('./ensureWizardCatalog');

/**
 * Insert demo categories that are not already stored.
 * Existing category documents are left unchanged, including administrator edits.
 */
async function seedDemoOptions(CustomBuildOption = require('../models/CustomBuildOption')) {
    let inserted = 0;
    let skipped = 0;

    for (let index = 0; index < DEMO_CATEGORIES.length; index += 1) {
        const category = DEMO_CATEGORIES[index];
        const existing = await CustomBuildOption.findOne({ id: category.id }).select('_id').lean();
        if (existing) {
            skipped += 1;
            continue;
        }

        try {
            await CustomBuildOption.create({
                id: category.id,
                name: category.name,
                description: category.description || null,
                selectionMode: category.selectionMode,
                required: category.required,
                maxSelections: category.maxSelections,
                sortOrder: index,
                demo: true,
                options: category.options.map((option) => ({
                    id: option.id,
                    name: option.name,
                    description: option.description || null,
                    active: option.active,
                })),
            });
            inserted += 1;
        } catch (error) {
            if (error && error.code === 11000) {
                skipped += 1;
                continue;
            }
            throw error;
        }
    }

    const wizard = await ensureWizardCatalog(CustomBuildOption);
    return { inserted, skipped, wizardInserted: wizard.inserted, wizardUpdated: wizard.updated };
}

module.exports = { seedDemoOptions };
