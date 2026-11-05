const mongoose = require('mongoose');

const localeSchema = new mongoose.Schema({
    name: { type: String, default: null, maxlength: 120 },
    description: { type: String, default: null, maxlength: 2000 },
}, { _id: false });

const serviceCategorySchema = new mongoose.Schema({
    name: { type: String, required: true, maxlength: 120 },
    slug: { type: String, required: true, maxlength: 80 },
    linkMode: { type: String, enum: ['details', 'contact'], default: 'details' },
    translations: {
        vi: { type: localeSchema, default: undefined },
        en: { type: localeSchema, default: undefined },
    },
    imagePath: { type: String, default: null, maxlength: 240 },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
}, {
    collection: 'service_categories',
    timestamps: true,
});

serviceCategorySchema.index({ slug: 1 }, { unique: true });
serviceCategorySchema.index({ sortOrder: 1, name: 1 });

module.exports = mongoose.model('ServiceCategory', serviceCategorySchema);
