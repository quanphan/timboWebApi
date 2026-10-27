const { CATALOG_VERSION, DEMO_DISCLAIMER } = require('./demoCatalog');
const { ApiError } = require('../../utils/errors');
const { isCategoryId } = require('./ids');
const { toPublicCategory } = require('./presenters');
const { ensureWizardCatalog } = require('./ensureWizardCatalog');

function createOptionsService(CustomBuildOption) {
    return {
        async listOptions() {
            await ensureWizardCatalog(CustomBuildOption);
            const docs = await CustomBuildOption.find().sort({ sortOrder: 1, id: 1 }).lean();
            return {
                version: CATALOG_VERSION,
                demo: docs.length > 0 && docs.every((doc) => doc.demo !== false),
                disclaimer: DEMO_DISCLAIMER,
                categories: docs.map((doc) => toPublicCategory(doc)),
            };
        },

        async listCatalog() {
            await ensureWizardCatalog(CustomBuildOption);
            const docs = await CustomBuildOption.find().sort({ sortOrder: 1, id: 1 }).lean();
            return {
                version: CATALOG_VERSION,
                demo: docs.length > 0 && docs.every((doc) => doc.demo !== false),
                disclaimer: DEMO_DISCLAIMER,
                categories: docs.map((doc) => toPublicCategory(doc, { includeInactive: true })),
            };
        },

        async getCategory(categoryId) {
            if (!isCategoryId(categoryId)) {
                throw new ApiError(400, 'BAD_REQUEST', 'Category id is invalid.');
            }

            const category = await CustomBuildOption.findOne({ id: categoryId }).lean();
            if (!category) {
                throw new ApiError(404, 'NOT_FOUND', 'Custom build category was not found.');
            }

            return toPublicCategory(category);
        },
    };
}

module.exports = { createOptionsService };
