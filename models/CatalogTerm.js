const mongoose = require('mongoose');

const localeSchema = new mongoose.Schema({
    name: { type: String, default: null, maxlength: 120 },
    description: { type: String, default: null, maxlength: 500 },
    shortDescription: { type: String, default: null, maxlength: 200 },
}, { _id: false });

const catalogTermSchema = new mongoose.Schema({
    kind: {
        type: String,
        required: true,
        enum: ['category', 'instrument-type', 'body-shape', 'series'],
    },
    name: { type: String, required: true, maxlength: 120 },
    slug: { type: String, required: true, maxlength: 80 },
    description: { type: String, default: null, maxlength: 500 },
    translations: {
        vi: { type: localeSchema, default: undefined },
        en: { type: localeSchema, default: undefined },
    },
    imagePath: { type: String, default: null, maxlength: 240 },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'CatalogTerm', default: null },
    shortDescription: { type: String, default: null, maxlength: 200 },
    minPrice: { type: Number, default: null, min: 0 },
    maxPrice: { type: Number, default: null, min: 0 },
    currency: { type: String, default: null, maxlength: 8 },
}, {
    collection: 'catalog_terms',
    timestamps: true,
});

catalogTermSchema.index({ kind: 1, slug: 1 }, { unique: true });
catalogTermSchema.index({ kind: 1, sortOrder: 1, name: 1 });
catalogTermSchema.index({ parentId: 1 });

module.exports = mongoose.model('CatalogTerm', catalogTermSchema);
