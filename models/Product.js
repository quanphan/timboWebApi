const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    code: String,
    name: String,
    description: String,
    descriptionDetail: String,
    price: { type: Number, default: 0 },
    unit: String,
    rating: Number,
    brand: String,
    type: String,
    qty: { type: Number, default: 0 },
    image: String,
    images: [String],
    slug: String,
    status: { type: String, enum: ['draft', 'published'], default: 'published' },
    productType: { type: String, enum: ['custom-order', 'ready-stock'] },
    sortOrder: { type: Number, default: 0 },
    specs: mongoose.Schema.Types.Mixed,
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'CatalogTerm' },
    instrumentTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'CatalogTerm' },
    bodyShapeId: { type: mongoose.Schema.Types.ObjectId, ref: 'CatalogTerm' },
    seriesId: { type: mongoose.Schema.Types.ObjectId, ref: 'CatalogTerm' },
    legacy: {
        source: String,
        id: String,
    },
}, { timestamps: true });

productSchema.index({ type: 1, brand: 1 });
productSchema.index({ status: 1, sortOrder: 1, _id: 1 });
productSchema.index({ productType: 1, status: 1, sortOrder: 1 });
productSchema.index({ slug: 1 }, { unique: true, sparse: true });
productSchema.index({ 'legacy.id': 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Product', productSchema);
