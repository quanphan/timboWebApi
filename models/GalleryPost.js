const mongoose = require('mongoose');

const CATEGORIES = ['process', 'art-of-making', 'materials', 'finish', 'instruments'];
const LEGACY_CATEGORIES = ['video'];

const galleryMediaSchema = new mongoose.Schema({
    id: { type: String, required: true },
    kind: { type: String, enum: ['image', 'video'], required: true },
    path: { type: String, required: true },
    sourceUrl: { type: String, default: '' },
    provider: { type: String, enum: ['upload', 'youtube', 'vimeo', 'facebook', 'direct'], default: 'upload' },
    videoId: { type: String, default: '' },
    thumbnail: { type: String, default: '' },
    sortOrder: { type: Number, default: 0 },
    mime: { type: String, default: '' },
    size: { type: Number, default: 0 },
    originalName: { type: String, default: '' },
}, { _id: false });

const galleryPostSchema = new mongoose.Schema({
    title: { type: String, required: true },
    excerpt: { type: String, default: '' },
    content: { type: String, default: '' },
    category: { type: String, required: true, trim: true, maxlength: 80 },
    publishedAt: { type: Date, default: null },
    media: { type: [galleryMediaSchema], default: [] },
    coverMediaId: { type: String, default: '' },
    status: { type: String, enum: ['draft', 'published'], default: 'draft' },
    showAtHome: { type: Boolean, default: false },
    pin: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
});

galleryPostSchema.index({ status: 1, order: 1, publishedAt: -1 });
galleryPostSchema.index({ category: 1, status: 1 });
galleryPostSchema.index({ status: 1, showAtHome: 1, order: 1, publishedAt: -1 });
galleryPostSchema.index({ status: 1, pin: -1, publishedAt: -1 });

module.exports = mongoose.model('GalleryPost', galleryPostSchema);
module.exports.GALLERY_CATEGORIES = CATEGORIES;
module.exports.LEGACY_GALLERY_CATEGORIES = LEGACY_CATEGORIES;
