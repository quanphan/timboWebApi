const mongoose = require('mongoose');

const CATEGORIES = ['process', 'materials', 'finish', 'instruments', 'video'];

const galleryMediaSchema = new mongoose.Schema({
    id: { type: String, required: true },
    kind: { type: String, enum: ['image', 'video'], required: true },
    path: { type: String, required: true },
    mime: { type: String, default: '' },
    size: { type: Number, default: 0 },
    originalName: { type: String, default: '' },
}, { _id: false });

const galleryPostSchema = new mongoose.Schema({
    title: { type: String, required: true },
    excerpt: { type: String, default: '' },
    content: { type: String, default: '' },
    category: { type: String, enum: CATEGORIES, required: true },
    publishedAt: { type: Date, default: null },
    media: { type: [galleryMediaSchema], default: [] },
    coverMediaId: { type: String, default: '' },
    status: { type: String, enum: ['draft', 'published'], default: 'draft' },
    order: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
});

galleryPostSchema.index({ status: 1, order: 1, publishedAt: -1 });
galleryPostSchema.index({ category: 1, status: 1 });

module.exports = mongoose.model('GalleryPost', galleryPostSchema);
module.exports.GALLERY_CATEGORIES = CATEGORIES;
