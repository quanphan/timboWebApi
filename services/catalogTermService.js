const CatalogTerm = require('../models/CatalogTerm');
const Product = require('../models/Product');
const { ApiError } = require('../utils/errors');
const { cleanString } = require('../utils/text');

const KIND_BY_ROUTE = {
    categories: 'category',
    'instrument-types': 'instrument-type',
    'body-shapes': 'body-shape',
    series: 'series',
};

const PRODUCT_FIELD_BY_KIND = {
    category: 'categoryId',
    'instrument-type': 'instrumentTypeId',
    'body-shape': 'bodyShapeId',
    series: 'seriesId',
};

function kindFromRoute(routeKind) {
    const kind = KIND_BY_ROUTE[routeKind];
    if (!kind) {
        throw new ApiError(404, 'NOT_FOUND', 'Catalog group was not found.');
    }
    return kind;
}

function presentLocale(value, fallbackName, fallbackDescription) {
    return {
        name: value && value.name ? value.name : fallbackName,
        description: value && value.description ? value.description : (fallbackDescription || null),
        shortDescription: value && value.shortDescription ? value.shortDescription : null,
    };
}

function presentTerm(term) {
    return {
        id: String(term._id),
        kind: term.kind,
        name: term.name,
        slug: term.slug,
        description: term.description || null,
        shortDescription: term.shortDescription || null,
        minPrice: term.minPrice == null ? null : term.minPrice,
        maxPrice: term.maxPrice == null ? null : term.maxPrice,
        currency: term.currency || null,
        translations: {
            vi: presentLocale(term.translations && term.translations.vi, term.name, term.description),
            en: presentLocale(term.translations && term.translations.en, term.name, term.description),
        },
        imagePath: term.imagePath || null,
        isActive: term.isActive !== false,
        sortOrder: term.sortOrder || 0,
        parentId: term.parentId ? String(term.parentId) : null,
        createdAt: term.createdAt || null,
        updatedAt: term.updatedAt || term.createdAt || null,
    };
}

function readSlug(value) {
    const slug = cleanString(value).toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Catalog item is invalid.', [{
            field: 'slug',
            code: 'INVALID',
            message: 'Slug must use lowercase letters, numbers, and single hyphens.',
        }]);
    }
    return slug;
}

function readImagePath(value) {
    if (value === undefined || value === null || value === '') {
        return null;
    }
    const imagePath = String(value).trim();
    if (!imagePath.startsWith('/uploads/') || imagePath.includes('..') || imagePath.includes('\\')) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Catalog item is invalid.', [{
            field: 'imagePath',
            code: 'INVALID',
            message: 'Image path must be a relative /uploads path.',
        }]);
    }
    return imagePath;
}

function readLocale(value, field) {
    if (value === undefined || value === null) {
        return undefined;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Catalog item is invalid.', [{
            field,
            code: 'INVALID',
            message: 'Translation must be an object.',
        }]);
    }
    const name = value.name === undefined ? null : cleanString(value.name);
    const description = value.description === undefined ? null : cleanString(value.description);
    const shortDescription = value.shortDescription === undefined
        ? undefined
        : cleanString(value.shortDescription);
    if (name && name.length > 120) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Catalog item is invalid.', [{
            field: `${field}.name`,
            code: 'INVALID',
            message: 'Translated name is too long.',
        }]);
    }
    if (description && description.length > 500) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Catalog item is invalid.', [{
            field: `${field}.description`,
            code: 'INVALID',
            message: 'Translated description is too long.',
        }]);
    }
    if (shortDescription && shortDescription.length > 200) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Catalog item is invalid.', [{
            field: `${field}.shortDescription`,
            code: 'INVALID',
            message: 'Translated short description is too long.',
        }]);
    }
    const locale = { name: name || null, description: description || null };
    if (shortDescription !== undefined) {
        locale.shortDescription = shortDescription || null;
    }
    return locale;
}

function readOptionalPrice(value, field) {
    if (value === undefined) {
        return undefined;
    }
    if (value === null || value === '') {
        return null;
    }
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Catalog item is invalid.', [{
            field,
            code: 'INVALID',
            message: 'Price must be a non-negative number.',
        }]);
    }
    return amount;
}

function assertPriceRange(minPrice, maxPrice) {
    if (minPrice != null && maxPrice != null && minPrice > maxPrice) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Catalog item is invalid.', [{
            field: 'minPrice',
            code: 'INVALID',
            message: 'Minimum price cannot be greater than maximum price.',
        }]);
    }
}

function readInput(body, { partial = false, kind = null } = {}) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new ApiError(400, 'BAD_REQUEST', 'Request body must be a JSON object.');
    }
    const updates = {};
    if (!partial || body.name !== undefined) {
        const name = cleanString(body.name);
        if (!name || name.length > 120) {
            throw new ApiError(422, 'VALIDATION_ERROR', 'Catalog item is invalid.', [{
                field: 'name',
                code: 'REQUIRED',
                message: 'Name is required and must be 120 characters or fewer.',
            }]);
        }
        updates.name = name;
    }
    if (!partial || body.slug !== undefined) {
        updates.slug = readSlug(body.slug);
    }
    if (body.description !== undefined) {
        const description = cleanString(body.description);
        if (description.length > 500) {
            throw new ApiError(422, 'VALIDATION_ERROR', 'Catalog item is invalid.', [{
                field: 'description',
                code: 'INVALID',
                message: 'Description must be 500 characters or fewer.',
            }]);
        }
        updates.description = description || null;
    }
    if (body.imagePath !== undefined) {
        updates.imagePath = readImagePath(body.imagePath);
    }
    if (body.isActive !== undefined) {
        if (typeof body.isActive !== 'boolean') {
            throw new ApiError(422, 'VALIDATION_ERROR', 'Catalog item is invalid.', [{
                field: 'isActive',
                code: 'INVALID',
                message: 'isActive must be true or false.',
            }]);
        }
        updates.isActive = body.isActive;
    }
    if (body.sortOrder !== undefined) {
        const sortOrder = Number(body.sortOrder);
        if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10000) {
            throw new ApiError(422, 'VALIDATION_ERROR', 'Catalog item is invalid.', [{
                field: 'sortOrder',
                code: 'INVALID',
                message: 'sortOrder must be a non-negative integer.',
            }]);
        }
        updates.sortOrder = sortOrder;
    }
    if (body.parentId !== undefined) {
        updates.parentId = body.parentId || null;
    }
    if (body.shortDescription !== undefined) {
        const shortDescription = cleanString(body.shortDescription);
        if (shortDescription.length > 200) {
            throw new ApiError(422, 'VALIDATION_ERROR', 'Catalog item is invalid.', [{
                field: 'shortDescription',
                code: 'INVALID',
                message: 'Short description must be 200 characters or fewer.',
            }]);
        }
        updates.shortDescription = shortDescription || null;
    }
    if (kind === 'series') {
        if (!partial || body.minPrice !== undefined) {
            const minPrice = readOptionalPrice(body.minPrice, 'minPrice');
            if (minPrice !== undefined) updates.minPrice = minPrice;
        }
        if (!partial || body.maxPrice !== undefined) {
            const maxPrice = readOptionalPrice(body.maxPrice, 'maxPrice');
            if (maxPrice !== undefined) updates.maxPrice = maxPrice;
        }
        if (!partial || body.currency !== undefined) {
            if (body.currency === undefined && !partial) {
                updates.currency = 'USD';
            } else if (body.currency === null || body.currency === '') {
                updates.currency = null;
            } else {
                const currency = cleanString(body.currency).toUpperCase();
                if (!/^[A-Z]{3}$/.test(currency)) {
                    throw new ApiError(422, 'VALIDATION_ERROR', 'Catalog item is invalid.', [{
                        field: 'currency',
                        code: 'INVALID',
                        message: 'Currency must be a 3-letter code.',
                    }]);
                }
                updates.currency = currency;
            }
        }
    }
    if (body.translations !== undefined) {
        if (!body.translations || typeof body.translations !== 'object' || Array.isArray(body.translations)) {
            throw new ApiError(422, 'VALIDATION_ERROR', 'Catalog item is invalid.', [{
                field: 'translations',
                code: 'INVALID',
                message: 'Translations must be an object.',
            }]);
        }
        updates.translations = {};
        if (body.translations.vi !== undefined) {
            updates.translations.vi = readLocale(body.translations.vi, 'translations.vi');
        }
        if (body.translations.en !== undefined) {
            updates.translations.en = readLocale(body.translations.en, 'translations.en');
        }
    }
    return updates;
}

async function assertParent(parentId, termId) {
    if (!parentId) {
        return null;
    }
    if (!require('mongoose').isValidObjectId(parentId)) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Catalog item is invalid.', [{
            field: 'parentId',
            code: 'INVALID',
            message: 'Parent catalog item was not found.',
        }]);
    }
    if (termId && String(parentId) === String(termId)) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Catalog item is invalid.', [{
            field: 'parentId',
            code: 'INVALID',
            message: 'A catalog item cannot be its own parent.',
        }]);
    }
    const parent = await CatalogTerm.findById(parentId);
    if (!parent) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Catalog item is invalid.', [{
            field: 'parentId',
            code: 'INVALID',
            message: 'Parent catalog item was not found.',
        }]);
    }
    return parent._id;
}

async function assertUniqueSlug(kind, slug, exceptId) {
    const filter = { kind, slug };
    if (exceptId) {
        filter._id = { $ne: exceptId };
    }
    const existing = await CatalogTerm.findOne(filter).select('_id');
    if (existing) {
        throw new ApiError(409, 'CONFLICT', 'A catalog item with this slug already exists.');
    }
}

function createCatalogTermService() {
    return {
        async list(routeKind, { activeOnly = false } = {}) {
            const kind = kindFromRoute(routeKind);
            const filter = { kind };
            if (activeOnly) {
                filter.isActive = { $ne: false };
            }
            const terms = await CatalogTerm.find(filter).sort({ sortOrder: 1, name: 1, _id: 1 });
            return terms.map(presentTerm);
        },

        async get(routeKind, id) {
            const kind = kindFromRoute(routeKind);
            const term = await CatalogTerm.findOne({ _id: id, kind });
            if (!term) {
                throw new ApiError(404, 'NOT_FOUND', 'Catalog item was not found.');
            }
            return presentTerm(term);
        },

        async create(routeKind, body) {
            const kind = kindFromRoute(routeKind);
            const input = readInput(body, { kind });
            await assertUniqueSlug(kind, input.slug);
            input.parentId = await assertParent(input.parentId);
            assertPriceRange(input.minPrice, input.maxPrice);
            const term = await CatalogTerm.create({ ...input, kind });
            return presentTerm(term);
        },

        async update(routeKind, id, body) {
            const kind = kindFromRoute(routeKind);
            const term = await CatalogTerm.findOne({ _id: id, kind });
            if (!term) {
                throw new ApiError(404, 'NOT_FOUND', 'Catalog item was not found.');
            }
            const input = readInput(body, { partial: true, kind });
            if (input.slug) {
                await assertUniqueSlug(kind, input.slug, term._id);
            }
            if (input.parentId !== undefined) {
                input.parentId = await assertParent(input.parentId, term._id);
            }
            if (input.translations) {
                const current = term.translations ? term.translations.toObject() : {};
                term.translations = {
                    ...current,
                    ...(input.translations.vi
                        ? { vi: { ...(current.vi || {}), ...input.translations.vi } }
                        : {}),
                    ...(input.translations.en
                        ? { en: { ...(current.en || {}), ...input.translations.en } }
                        : {}),
                };
                delete input.translations;
            }
            const nextMin = input.minPrice !== undefined ? input.minPrice : term.minPrice;
            const nextMax = input.maxPrice !== undefined ? input.maxPrice : term.maxPrice;
            assertPriceRange(nextMin, nextMax);
            Object.assign(term, input);
            await term.save();
            return presentTerm(term);
        },

        async reorder(routeKind, body) {
            const kind = kindFromRoute(routeKind);
            if (!body || !Array.isArray(body.ids) || body.ids.length === 0) {
                throw new ApiError(422, 'VALIDATION_ERROR', 'Catalog order is invalid.', [{
                    field: 'ids',
                    code: 'REQUIRED',
                    message: 'Provide the catalog item ids in the new order.',
                }]);
            }
            const unique = [...new Set(body.ids.map(String))];
            const found = await CatalogTerm.find({ kind, _id: { $in: unique } }).select('_id');
            if (found.length !== unique.length) {
                throw new ApiError(404, 'NOT_FOUND', 'One or more catalog items were not found.');
            }
            await Promise.all(unique.map((id, index) => CatalogTerm.updateOne({ _id: id, kind }, { sortOrder: index })));
            return this.list(routeKind);
        },

        async remove(routeKind, id) {
            const kind = kindFromRoute(routeKind);
            const term = await CatalogTerm.findOne({ _id: id, kind });
            if (!term) {
                throw new ApiError(404, 'NOT_FOUND', 'Catalog item was not found.');
            }
            const productField = PRODUCT_FIELD_BY_KIND[kind];
            const [products, children] = await Promise.all([
                Product.countDocuments({ [productField]: term._id }),
                CatalogTerm.countDocuments({ parentId: term._id }),
            ]);
            if (products > 0 || children > 0) {
                throw new ApiError(409, 'CONFLICT', 'Move or remove linked products and child catalog items before deleting this item.');
            }
            await term.deleteOne();
            return { deleted: true, id: String(term._id) };
        },
    };
}

module.exports = {
    KIND_BY_ROUTE,
    PRODUCT_FIELD_BY_KIND,
    createCatalogTermService,
    presentTerm,
};
