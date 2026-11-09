const mongoose = require('mongoose');

const localeSchema = new mongoose.Schema({
    name: { type: String, default: '', maxlength: 80 },
}, { _id: false });

const galleryCategorySchema = new mongoose.Schema({
    slug: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        maxlength: 80,
    },
    translations: {
        en: { type: localeSchema, default: undefined },
        vi: { type: localeSchema, default: undefined },
    },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
}, {
    collection: 'gallery_categories',
    timestamps: true,
});

galleryCategorySchema.index({ sortOrder: 1, slug: 1 });
galleryCategorySchema.index({ isActive: 1, sortOrder: 1 });

module.exports = mongoose.model('GalleryCategory', galleryCategorySchema);
