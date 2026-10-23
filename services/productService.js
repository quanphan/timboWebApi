const mongoose = require('mongoose');
const CatalogTerm = require('../models/CatalogTerm');
const Product = require('../models/Product');
const { ApiError } = require('../utils/errors');
const { pageMeta } = require('../utils/http');
const { parsePagination } = require('../utils/pagination');
const { publicProduct } = require('../utils/presenters');
const { cleanString, escapeRegex } = require('../utils/text');

const PRODUCT_FIELDS = [
    'code', 'name', 'slug', 'description', 'descriptionDetail', 'price', 'unit',
    'rating', 'brand', 'type', 'qty', 'image', 'images', 'status', 'productType', 'sortOrder', 'specs',
    'categoryId', 'instrumentTypeId', 'bodyShapeId', 'seriesId',
];

const PRODUCT_TYPES = ['custom-order', 'ready-stock'];

function isProductType(value) {
    return PRODUCT_TYPES.includes(value);
}

function presentProductType(product) {
    if (isProductType(product.productType)) return product.productType;
    const nested = product.specs && typeof product.specs === 'object' ? product.specs.productType : null;
    return isProductType(nested) ? nested : null;
}

const RELATION_FIELDS = {
    categoryId: 'category',
    instrumentTypeId: 'instrument-type',
    bodyShapeId: 'body-shape',
    seriesId: 'series',
};

function publishedFilter() {
    return {
        $or: [
            { status: 'published' },
            { status: { $exists: false } },
            { status: null },
        ],
    };
}

function readImagePath(value, field) {
    if (value === undefined || value === null || value === '') {
        return null;
    }
    const imagePath = String(value).trim();
    const safeUpload = imagePath.startsWith('/uploads/') && !imagePath.includes('..') && !imagePath.includes('\\');
    const legacyRelative = /^[A-Za-z0-9._/-]+$/.test(imagePath) && !imagePath.includes('..');
    const remote = /^https?:\/\//.test(imagePath) && !imagePath.includes('..');
    if (!safeUpload && !legacyRelative && !remote) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Product data is invalid.', [{
            field,
            code: 'INVALID',
            message: 'Image path must be a relative /uploads path.',
        }]);
    }
    return imagePath;
}

function validateProduct(body, { partial = false } = {}) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new ApiError(400, 'BAD_REQUEST', 'Request body must be a JSON object.');
    }
    const updates = {};
    for (const field of PRODUCT_FIELDS) {
        if (body[field] !== undefined) {
            updates[field] = body[field];
        }
    }
    if (!partial && !cleanString(updates.name || body.name)) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Product data is invalid.', [
            { field: 'name', code: 'REQUIRED', message: 'Name is required.' },
        ]);
    }
    if (updates.name !== undefined) {
        updates.name = cleanString(updates.name);
        if (!updates.name) {
            throw new ApiError(422, 'VALIDATION_ERROR', 'Product data is invalid.', [
                { field: 'name', code: 'REQUIRED', message: 'Name is required.' },
            ]);
        }
    }
    if (updates.price !== undefined) {
        const price = Number(updates.price);
        if (!Number.isFinite(price) || price < 0) {
            throw new ApiError(422, 'VALIDATION_ERROR', 'Product data is invalid.', [
                { field: 'price', code: 'INVALID', message: 'Price must be a non-negative number.' },
            ]);
        }
        updates.price = price;
    }
    if (updates.qty !== undefined) {
        const qty = Number(updates.qty);
        if (!Number.isInteger(qty) || qty < 0) {
            throw new ApiError(422, 'VALIDATION_ERROR', 'Product data is invalid.', [
                { field: 'qty', code: 'INVALID', message: 'Quantity must be a non-negative integer.' },
            ]);
        }
        updates.qty = qty;
    }
    if (updates.images !== undefined) {
        if (!Array.isArray(updates.images) || updates.images.length > 12) {
            throw new ApiError(422, 'VALIDATION_ERROR', 'Product data is invalid.', [
                { field: 'images', code: 'INVALID', message: 'Images must be a list of at most 12 upload paths.' },
            ]);
        }
        updates.images = updates.images.map((item, index) => readImagePath(item, `images[${index}]`));
    }
    if (updates.image !== undefined) {
        updates.image = readImagePath(updates.image, 'image');
    }
    if (updates.slug !== undefined) {
        const slug = cleanString(updates.slug).toLowerCase();
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) {
            throw new ApiError(422, 'VALIDATION_ERROR', 'Product data is invalid.', [
                { field: 'slug', code: 'INVALID', message: 'Slug must use lowercase letters, numbers, and single hyphens.' },
            ]);
        }
        updates.slug = slug;
    }
    if (updates.status !== undefined && updates.status !== 'draft' && updates.status !== 'published') {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Product data is invalid.', [
            { field: 'status', code: 'INVALID', message: 'Status must be draft or published.' },
        ]);
    }
    if (updates.productType !== undefined) {
        if (updates.productType === null || updates.productType === '') {
            updates.productType = undefined;
        } else if (!isProductType(updates.productType)) {
            throw new ApiError(422, 'VALIDATION_ERROR', 'Product data is invalid.', [
                { field: 'productType', code: 'INVALID', message: 'Product type must be custom-order or ready-stock.' },
            ]);
        }
    }
    if (updates.sortOrder !== undefined) {
        const sortOrder = Number(updates.sortOrder);
        if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10000) {
            throw new ApiError(422, 'VALIDATION_ERROR', 'Product data is invalid.', [
                { field: 'sortOrder', code: 'INVALID', message: 'sortOrder must be a non-negative integer.' },
            ]);
        }
        updates.sortOrder = sortOrder;
    }
    if (updates.specs !== undefined) {
        if (!updates.specs || typeof updates.specs !== 'object' || Array.isArray(updates.specs)) {
            throw new ApiError(422, 'VALIDATION_ERROR', 'Product data is invalid.', [
                { field: 'specs', code: 'INVALID', message: 'Specifications must be an object of text values.' },
            ]);
        }
        const entries = Object.entries(updates.specs);
        if (entries.length > 30) {
            throw new ApiError(422, 'VALIDATION_ERROR', 'Product data is invalid.', [
                { field: 'specs', code: 'INVALID', message: 'Specifications can contain at most 30 entries.' },
            ]);
        }
        updates.specs = Object.fromEntries(entries.map(([key, value]) => {
            const name = cleanString(key).slice(0, 60);
            const text = cleanString(value).slice(0, 1000);
            if (!name || !text) {
                throw new ApiError(422, 'VALIDATION_ERROR', 'Product data is invalid.', [
                    { field: 'specs', code: 'INVALID', message: 'Each specification needs a name and a text value.' },
                ]);
            }
            return [name, text];
        }));
        if (isProductType(updates.specs.productType) && updates.productType === undefined) {
            updates.productType = updates.specs.productType;
        }
        if (updates.specs.productType !== undefined) {
            delete updates.specs.productType;
        }
    }
    return updates;
}

async function assertRelations(updates) {
    for (const [field, kind] of Object.entries(RELATION_FIELDS)) {
        if (updates[field] === undefined || updates[field] === null || updates[field] === '') {
            if (updates[field] === '') updates[field] = null;
            continue;
        }
        if (!mongoose.isValidObjectId(updates[field])) {
            throw new ApiError(422, 'VALIDATION_ERROR', 'Product data is invalid.', [{
                field,
                code: 'INVALID',
                message: 'Catalog reference was not found.',
            }]);
        }
        const term = await CatalogTerm.findOne({ _id: updates[field], kind });
        if (!term) {
            throw new ApiError(422, 'VALIDATION_ERROR', 'Product data is invalid.', [{
                field,
                code: 'INVALID',
                message: 'Catalog reference was not found.',
            }]);
        }
    }
}

async function assertUniqueSlug(slug, exceptId) {
    if (!slug) return;
    const filter = { slug };
    if (exceptId) filter._id = { $ne: exceptId };
    const existing = await Product.findOne(filter).select('_id');
    if (existing) {
        throw new ApiError(409, 'CONFLICT', 'A product with this slug already exists.');
    }
}

function presentRelation(term) {
    if (!term) return null;
    return { id: String(term._id), name: term.name, slug: term.slug };
}

async function withRelations(products) {
    const ids = [];
    for (const product of products) {
        for (const field of Object.keys(RELATION_FIELDS)) {
            if (product[field]) ids.push(product[field]);
        }
    }
    const terms = ids.length
        ? await CatalogTerm.find({ _id: { $in: ids } }).select('name slug')
        : [];
    const byId = new Map(terms.map((term) => [String(term._id), term]));
    return products.map((product) => ({
        ...publicProduct(product),
        slug: product.slug || null,
        status: product.status || 'published',
        sortOrder: product.sortOrder || 0,
        specs: product.specs || null,
        productType: presentProductType(product),
        category: presentRelation(byId.get(String(product.categoryId))),
        instrumentType: presentRelation(byId.get(String(product.instrumentTypeId))),
        bodyShape: presentRelation(byId.get(String(product.bodyShapeId))),
        series: presentRelation(byId.get(String(product.seriesId))),
    }));
}

function buildQuery(query, { includeDrafts = false } = {}) {
    const and = [];
    if (!includeDrafts) {
        and.push(publishedFilter());
    } else if (query.status === 'draft' || query.status === 'published') {
        and.push({ status: query.status });
    }
    if (query.type && query.type !== 'all') {
        and.push({ type: query.type });
    }
    if (query.brand && query.brand !== 'all') {
        and.push({ brand: query.brand });
    }
    if (isProductType(query.productType)) {
        and.push({
            $or: [
                { productType: query.productType },
                {
                    $and: [
                        { $or: [{ productType: { $exists: false } }, { productType: null }] },
                        { 'specs.productType': query.productType },
                    ],
                },
            ],
        });
    }
    const search = cleanString(query.search).slice(0, 80);
    if (search) {
        const pattern = escapeRegex(search);
        and.push({
            $or: [
                { name: { $regex: pattern, $options: 'i' } },
                { description: { $regex: pattern, $options: 'i' } },
                { code: { $regex: pattern, $options: 'i' } },
            ],
        });
    }
    if (query.inStock === 'true') {
        and.push({ qty: { $gt: 0 } });
    }
    if (query.inStock === 'false') {
        and.push({ $or: [{ qty: { $lte: 0 } }, { qty: null }] });
    }
    return and.length ? { $and: and } : {};
}

function buildSort(sort) {
    if (sort === 'price-asc') return { price: 1 };
    if (sort === 'price-desc') return { price: -1 };
    if (sort === 'name') return { name: 1 };
    if (sort === 'manual') return { sortOrder: 1, _id: 1 };
    return { _id: -1 };
}

function createProductService() {
    return {
        async list(query) {
            const { page, limit, skip } = parsePagination(query);
            const filter = buildQuery(query);
            const [total, products] = await Promise.all([
                Product.countDocuments(filter),
                Product.find(filter).sort(buildSort(query.sort)).skip(skip).limit(limit),
            ]);
            return {
                products: await withRelations(products),
                meta: pageMeta(page, limit, total),
            };
        },

        async listAdmin(query) {
            const { page, limit, skip } = parsePagination(query);
            const filter = buildQuery(query, { includeDrafts: true });
            const [total, products] = await Promise.all([
                Product.countDocuments(filter),
                Product.find(filter).sort(buildSort(query.sort || 'manual')).skip(skip).limit(limit),
            ]);
            return {
                products: await withRelations(products),
                meta: pageMeta(page, limit, total),
            };
        },

        async getById(id, { includeDrafts = false } = {}) {
            const product = await Product.findById(id);
            if (!product || (!includeDrafts && product.status === 'draft')) {
                throw new ApiError(404, 'NOT_FOUND', 'Product was not found.');
            }
            const [presented] = await withRelations([product]);
            return presented;
        },

        async listTypes() {
            const types = await Product.distinct('type', publishedFilter());
            return types.filter(Boolean).sort();
        },

        async listBrands() {
            const brands = await Product.distinct('brand', publishedFilter());
            return brands.filter(Boolean).sort();
        },

        async create(body) {
            const input = validateProduct(body);
            await assertRelations(input);
            await assertUniqueSlug(input.slug);
            const product = await Product.create(input);
            const [presented] = await withRelations([product]);
            return presented;
        },

        async update(id, body) {
            const input = validateProduct(body, { partial: true });
            const product = await Product.findById(id);
            if (!product) {
                throw new ApiError(404, 'NOT_FOUND', 'Product was not found.');
            }
            await assertRelations(input);
            await assertUniqueSlug(input.slug, product._id);
            Object.assign(product, input);
            await product.save();
            const [presented] = await withRelations([product]);
            return presented;
        },

        async reorder(body) {
            if (!body || !Array.isArray(body.ids) || body.ids.length === 0) {
                throw new ApiError(422, 'VALIDATION_ERROR', 'Product order is invalid.', [{
                    field: 'ids',
                    code: 'REQUIRED',
                    message: 'Provide the product ids in the new order.',
                }]);
            }
            const unique = [...new Set(body.ids.map(String))];
            const found = await Product.find({ _id: { $in: unique } }).select('_id');
            if (found.length !== unique.length) {
                throw new ApiError(404, 'NOT_FOUND', 'One or more products were not found.');
            }
            await Promise.all(unique.map((id, index) => Product.updateOne({ _id: id }, { sortOrder: index })));
            return { updated: unique.length };
        },

        async remove(id) {
            const product = await Product.findByIdAndDelete(id);
            if (!product) {
                throw new ApiError(404, 'NOT_FOUND', 'Product was not found.');
            }
            return { deleted: true };
        },
    };
}

module.exports = { createProductService };
