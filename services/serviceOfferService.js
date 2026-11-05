const mongoose = require('mongoose');
const ServiceCategory = require('../models/ServiceCategory');
const ServiceItem = require('../models/ServiceItem');
const { ApiError } = require('../utils/errors');
const { sanitizeServiceHtml } = require('../utils/serviceHtml');
const { readServiceImagePath } = require('../utils/serviceImagePaths');
const {
    collectValueIds,
    presentOptionGroups,
    presentVariantPrices,
    readOptionGroups,
    readVariantPrices,
} = require('../utils/serviceOptions');
const { cleanString } = require('../utils/text');

function presentLocaleName(value, fallbackName, fallbackDescription) {
    return {
        name: value && value.name ? value.name : fallbackName,
        description: value && value.description ? value.description : (fallbackDescription || null),
    };
}

function presentLocaleItem(value, fallbackTitle) {
    return {
        title: value && value.title ? value.title : fallbackTitle,
        html: value && value.html ? value.html : '',
    };
}

function presentCategory(category) {
    const name = category.name;
    return {
        id: String(category._id),
        name,
        slug: category.slug,
        linkMode: category.linkMode === 'contact' ? 'contact' : 'details',
        translations: {
            vi: presentLocaleName(category.translations && category.translations.vi, name, null),
            en: presentLocaleName(category.translations && category.translations.en, name, null),
        },
        imagePath: category.imagePath || null,
        isActive: category.isActive !== false,
        sortOrder: category.sortOrder || 0,
        createdAt: category.createdAt || null,
        updatedAt: category.updatedAt || category.createdAt || null,
    };
}

function presentItem(item) {
    const title = item.title;
    const price = item.price == null || Number(item.price) <= 0 ? null : item.price;
    const optionGroups = presentOptionGroups(item.optionGroups);
    return {
        id: String(item._id),
        categoryId: String(item.categoryId),
        title,
        translations: {
            vi: presentLocaleItem(item.translations && item.translations.vi, title),
            en: presentLocaleItem(item.translations && item.translations.en, title),
        },
        imagePath: item.imagePath || null,
        price,
        currency: item.currency || null,
        optionGroups,
        variantPrices: presentVariantPrices(item.variantPrices, collectValueIds(optionGroups)),
        isActive: item.isActive !== false,
        sortOrder: item.sortOrder || 0,
        createdAt: item.createdAt || null,
        updatedAt: item.updatedAt || item.createdAt || null,
    };
}

function readSlug(value) {
    const slug = cleanString(value).toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Service record is invalid.', [{
            field: 'slug',
            code: 'INVALID',
            message: 'Slug must use lowercase letters, numbers, and single hyphens.',
        }]);
    }
    return slug;
}

function readLinkMode(value, required) {
    if (value === undefined) {
        if (required) {
            throw new ApiError(422, 'VALIDATION_ERROR', 'Service record is invalid.', [{
                field: 'linkMode',
                code: 'REQUIRED',
                message: 'Button type is required.',
            }]);
        }
        return undefined;
    }
    if (value !== 'details' && value !== 'contact') {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Service record is invalid.', [{
            field: 'linkMode',
            code: 'INVALID',
            message: 'Button type must be details or contact.',
        }]);
    }
    return value;
}

function readBoolean(value, field, required) {
    if (value === undefined) {
        if (required) return true;
        return undefined;
    }
    if (typeof value !== 'boolean') {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Service record is invalid.', [{
            field,
            code: 'INVALID',
            message: `${field} must be true or false.`,
        }]);
    }
    return value;
}

function readSortOrder(value) {
    if (value === undefined) return undefined;
    const sortOrder = Number(value);
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10000) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Service record is invalid.', [{
            field: 'sortOrder',
            code: 'INVALID',
            message: 'sortOrder must be a non-negative integer.',
        }]);
    }
    return sortOrder;
}

function readCategoryLocale(value, field) {
    if (value === undefined || value === null) return undefined;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Service record is invalid.', [{
            field,
            code: 'INVALID',
            message: 'Translation must be an object.',
        }]);
    }
    const name = value.name === undefined ? null : cleanString(value.name);
    const description = value.description === undefined ? null : cleanString(value.description);
    if (name && name.length > 120) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Service record is invalid.', [{
            field: `${field}.name`,
            code: 'INVALID',
            message: 'Translated name is too long.',
        }]);
    }
    if (description && description.length > 2000) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Service record is invalid.', [{
            field: `${field}.description`,
            code: 'INVALID',
            message: 'Translated description is too long.',
        }]);
    }
    return { name: name || null, description: description || null };
}

function readItemLocale(value, field) {
    if (value === undefined || value === null) return undefined;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Service record is invalid.', [{
            field,
            code: 'INVALID',
            message: 'Translation must be an object.',
        }]);
    }
    const title = value.title === undefined ? null : cleanString(value.title);
    if (title && title.length > 160) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Service record is invalid.', [{
            field: `${field}.title`,
            code: 'INVALID',
            message: 'Translated title is too long.',
        }]);
    }
    let html = '';
    if (value.html !== undefined && value.html !== null) {
        html = sanitizeServiceHtml(value.html);
        if (html.length > 20000) {
            throw new ApiError(422, 'VALIDATION_ERROR', 'Service record is invalid.', [{
                field: `${field}.html`,
                code: 'TOO_LONG',
                message: 'HTML content is too long.',
            }]);
        }
    }
    return { title: title || null, html };
}

function displayName(translations) {
    const en = translations && translations.en && translations.en.name;
    const vi = translations && translations.vi && translations.vi.name;
    return en || vi || '';
}

function displayTitle(translations) {
    const en = translations && translations.en && translations.en.title;
    const vi = translations && translations.vi && translations.vi.title;
    return en || vi || '';
}

function readCategoryInput(body, { partial = false } = {}) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new ApiError(400, 'BAD_REQUEST', 'Request body must be a JSON object.');
    }
    const updates = {};
    if (!partial || body.slug !== undefined) {
        updates.slug = readSlug(body.slug);
    }
    if (!partial || body.linkMode !== undefined) {
        updates.linkMode = readLinkMode(body.linkMode, !partial) || 'details';
    }
    if (body.imagePath !== undefined) {
        updates.imagePath = readServiceImagePath(body.imagePath);
    }
    const isActive = readBoolean(body.isActive, 'isActive', !partial);
    if (isActive !== undefined) updates.isActive = isActive;
    const sortOrder = readSortOrder(body.sortOrder);
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;
    if (!partial || body.translations !== undefined) {
        if (!body.translations || typeof body.translations !== 'object' || Array.isArray(body.translations)) {
            throw new ApiError(422, 'VALIDATION_ERROR', 'Service record is invalid.', [{
                field: 'translations',
                code: 'REQUIRED',
                message: 'Provide Vietnamese and English names.',
            }]);
        }
        updates.translations = {};
        if (body.translations.vi !== undefined) {
            updates.translations.vi = readCategoryLocale(body.translations.vi, 'translations.vi');
        }
        if (body.translations.en !== undefined) {
            updates.translations.en = readCategoryLocale(body.translations.en, 'translations.en');
        }
        const name = displayName(updates.translations);
        if (!partial && !name) {
            throw new ApiError(422, 'VALIDATION_ERROR', 'Service record is invalid.', [{
                field: 'translations.en.name',
                code: 'REQUIRED',
                message: 'A category name is required.',
            }]);
        }
        if (name) updates.name = name;
    }
    return updates;
}

function readCurrency(value) {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const currency = cleanString(value).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Service record is invalid.', [{
            field: 'currency',
            code: 'INVALID',
            message: 'Currency must be a 3-letter code.',
        }]);
    }
    return currency;
}

function readPrice(value) {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Service record is invalid.', [{
            field: 'price',
            code: 'INVALID',
            message: 'Price must be a non-negative number.',
        }]);
    }
    return amount;
}

function readItemInput(body, { partial = false, existingGroups = [] } = {}) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new ApiError(400, 'BAD_REQUEST', 'Request body must be a JSON object.');
    }
    const updates = {};
    if (!partial || body.categoryId !== undefined) {
        if (!mongoose.isValidObjectId(body.categoryId)) {
            throw new ApiError(422, 'VALIDATION_ERROR', 'Service record is invalid.', [{
                field: 'categoryId',
                code: 'INVALID',
                message: 'Choose a valid service category.',
            }]);
        }
        updates.categoryId = body.categoryId;
    }
    if (body.imagePath !== undefined) {
        updates.imagePath = readServiceImagePath(body.imagePath);
    }
    const isActive = readBoolean(body.isActive, 'isActive', !partial);
    if (isActive !== undefined) updates.isActive = isActive;
    const sortOrder = readSortOrder(body.sortOrder);
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;
    const price = readPrice(body.price);
    if (price !== undefined) updates.price = price;
    const currency = readCurrency(body.currency);
    if (currency !== undefined) updates.currency = currency;
    if (!partial || body.optionGroups !== undefined) {
        updates.optionGroups = readOptionGroups(body.optionGroups === undefined ? [] : body.optionGroups);
    }
    if (!partial || body.variantPrices !== undefined) {
        updates.variantPrices = readVariantPrices(
            body.variantPrices === undefined ? [] : body.variantPrices,
            updates.optionGroups !== undefined ? updates.optionGroups : existingGroups,
        );
    }
    if (!partial || body.translations !== undefined) {
        if (!body.translations || typeof body.translations !== 'object' || Array.isArray(body.translations)) {
            throw new ApiError(422, 'VALIDATION_ERROR', 'Service record is invalid.', [{
                field: 'translations',
                code: 'REQUIRED',
                message: 'Provide Vietnamese and English titles.',
            }]);
        }
        updates.translations = {};
        if (body.translations.vi !== undefined) {
            updates.translations.vi = readItemLocale(body.translations.vi, 'translations.vi');
        }
        if (body.translations.en !== undefined) {
            updates.translations.en = readItemLocale(body.translations.en, 'translations.en');
        }
        const title = displayTitle(updates.translations);
        if (!partial && !title) {
            throw new ApiError(422, 'VALIDATION_ERROR', 'Service record is invalid.', [{
                field: 'translations.en.title',
                code: 'REQUIRED',
                message: 'An item title is required.',
            }]);
        }
        if (title) updates.title = title;
    }
    return updates;
}

async function assertUniqueSlug(slug, exceptId) {
    const filter = { slug };
    if (exceptId) filter._id = { $ne: exceptId };
    const existing = await ServiceCategory.findOne(filter).select('_id');
    if (existing) {
        throw new ApiError(409, 'CONFLICT', 'A service category with this slug already exists.');
    }
}

async function loadCategory(id) {
    if (!mongoose.isValidObjectId(id)) {
        throw new ApiError(404, 'NOT_FOUND', 'Service category was not found.');
    }
    const category = await ServiceCategory.findById(id);
    if (!category) {
        throw new ApiError(404, 'NOT_FOUND', 'Service category was not found.');
    }
    return category;
}

async function loadItem(id) {
    if (!mongoose.isValidObjectId(id)) {
        throw new ApiError(404, 'NOT_FOUND', 'Service item was not found.');
    }
    const item = await ServiceItem.findById(id);
    if (!item) {
        throw new ApiError(404, 'NOT_FOUND', 'Service item was not found.');
    }
    return item;
}

function mergeTranslations(currentDoc, incoming) {
    const current = currentDoc ? currentDoc.toObject() : {};
    return {
        ...current,
        ...(incoming.vi ? { vi: { ...(current.vi || {}), ...incoming.vi } } : {}),
        ...(incoming.en ? { en: { ...(current.en || {}), ...incoming.en } } : {}),
    };
}

function createServiceOfferService() {
    return {
        async listPublic() {
            const categories = await ServiceCategory.find({ isActive: { $ne: false } }).sort({ sortOrder: 1, name: 1, _id: 1 });
            return categories.map(presentCategory);
        },

        async getPublic(slug) {
            const category = await ServiceCategory.findOne({ slug, isActive: { $ne: false } });
            if (!category || category.linkMode === 'contact') {
                throw new ApiError(404, 'NOT_FOUND', 'Service category was not found.');
            }
            const items = await ServiceItem.find({
                categoryId: category._id,
                isActive: { $ne: false },
            }).sort({ sortOrder: 1, title: 1, _id: 1 });
            return { category: presentCategory(category), items: items.map(presentItem) };
        },

        async listCategories() {
            const categories = await ServiceCategory.find({}).sort({ sortOrder: 1, name: 1, _id: 1 });
            return categories.map(presentCategory);
        },

        async getCategory(id) {
            return presentCategory(await loadCategory(id));
        },

        async createCategory(body) {
            const input = readCategoryInput(body);
            await assertUniqueSlug(input.slug);
            if (input.sortOrder === undefined) {
                const last = await ServiceCategory.findOne({}).sort({ sortOrder: -1 }).select('sortOrder');
                input.sortOrder = last ? (last.sortOrder || 0) + 1 : 0;
            }
            const category = await ServiceCategory.create(input);
            return presentCategory(category);
        },

        async updateCategory(id, body) {
            const category = await loadCategory(id);
            const input = readCategoryInput(body, { partial: true });
            if (input.slug) await assertUniqueSlug(input.slug, category._id);
            if (input.linkMode === 'contact') {
                const count = await ServiceItem.countDocuments({ categoryId: category._id });
                if (count > 0) {
                    throw new ApiError(409, 'CONFLICT', 'Remove this category’s items before switching it to Contact.');
                }
            }
            if (input.translations) {
                category.translations = mergeTranslations(category.translations, input.translations);
                const name = displayName(category.translations.toObject ? category.translations.toObject() : category.translations);
                if (name) category.name = name;
                delete input.translations;
            }
            Object.assign(category, input);
            await category.save();
            return presentCategory(category);
        },

        async reorderCategories(body) {
            if (!body || !Array.isArray(body.ids) || body.ids.length === 0) {
                throw new ApiError(422, 'VALIDATION_ERROR', 'Service order is invalid.', [{
                    field: 'ids',
                    code: 'REQUIRED',
                    message: 'Provide the category ids in the new order.',
                }]);
            }
            const unique = [...new Set(body.ids.map(String))];
            const found = await ServiceCategory.find({ _id: { $in: unique } }).select('_id');
            if (found.length !== unique.length) {
                throw new ApiError(404, 'NOT_FOUND', 'One or more service categories were not found.');
            }
            await Promise.all(unique.map((id, index) => ServiceCategory.updateOne({ _id: id }, { sortOrder: index })));
            return this.listCategories();
        },

        async deleteCategory(id) {
            const category = await loadCategory(id);
            await ServiceItem.deleteMany({ categoryId: category._id });
            await category.deleteOne();
            return { deleted: true, id: String(category._id) };
        },

        async listItems(query = {}) {
            const filter = {};
            if (query.categoryId) {
                if (!mongoose.isValidObjectId(query.categoryId)) {
                    throw new ApiError(422, 'VALIDATION_ERROR', 'Service record is invalid.', [{
                        field: 'categoryId',
                        code: 'INVALID',
                        message: 'Choose a valid service category.',
                    }]);
                }
                filter.categoryId = query.categoryId;
            }
            const items = await ServiceItem.find(filter).sort({ sortOrder: 1, title: 1, _id: 1 });
            return items.map(presentItem);
        },

        async getItem(id) {
            return presentItem(await loadItem(id));
        },

        async createItem(body) {
            const input = readItemInput(body);
            const category = await loadCategory(input.categoryId);
            if (category.linkMode === 'contact') {
                throw new ApiError(422, 'VALIDATION_ERROR', 'Service record is invalid.', [{
                    field: 'categoryId',
                    code: 'INVALID',
                    message: 'Items can only belong to Details categories.',
                }]);
            }
            if (input.sortOrder === undefined) {
                const last = await ServiceItem.findOne({ categoryId: category._id }).sort({ sortOrder: -1 }).select('sortOrder');
                input.sortOrder = last ? (last.sortOrder || 0) + 1 : 0;
            }
            const item = await ServiceItem.create(input);
            return presentItem(item);
        },

        async updateItem(id, body) {
            const item = await loadItem(id);
            const input = readItemInput(body, {
                partial: true,
                existingGroups: presentOptionGroups(item.optionGroups),
            });
            if (input.categoryId) {
                const category = await loadCategory(input.categoryId);
                if (category.linkMode === 'contact') {
                    throw new ApiError(422, 'VALIDATION_ERROR', 'Service record is invalid.', [{
                        field: 'categoryId',
                        code: 'INVALID',
                        message: 'Items can only belong to Details categories.',
                    }]);
                }
            }
            if (input.translations) {
                item.translations = mergeTranslations(item.translations, input.translations);
                const title = displayTitle(item.translations.toObject ? item.translations.toObject() : item.translations);
                if (title) item.title = title;
                delete input.translations;
            }
            Object.assign(item, input);
            await item.save();
            return presentItem(item);
        },

        async reorderItems(body) {
            if (!body || !mongoose.isValidObjectId(body.categoryId) || !Array.isArray(body.ids) || body.ids.length === 0) {
                throw new ApiError(422, 'VALIDATION_ERROR', 'Service order is invalid.', [{
                    field: 'ids',
                    code: 'REQUIRED',
                    message: 'Provide the item ids in the new order.',
                }]);
            }
            const category = await loadCategory(body.categoryId);
            const unique = [...new Set(body.ids.map(String))];
            const found = await ServiceItem.find({ categoryId: category._id, _id: { $in: unique } }).select('_id');
            if (found.length !== unique.length) {
                throw new ApiError(404, 'NOT_FOUND', 'One or more service items were not found.');
            }
            await Promise.all(unique.map((id, index) => ServiceItem.updateOne({ _id: id }, { sortOrder: index })));
            return this.listItems({ categoryId: String(category._id) });
        },

        async deleteItem(id) {
            const item = await loadItem(id);
            await item.deleteOne();
            return { deleted: true, id: String(item._id) };
        },
    };
}

module.exports = { createServiceOfferService, sanitizeServiceHtml };

