const mongoose = require('mongoose');

const galleryItemSchema = new mongoose.Schema({
    path: { type: String, default: '' },
    alt: { type: String, default: '' },
}, { _id: false });

const sectionSchema = new mongoose.Schema({
    id: { type: String, required: true },
    type: { type: String, required: true },
    visible: { type: Boolean, default: true },
    title: { type: String, default: '' },
    subtitle: { type: String, default: '' },
    body: { type: String, default: '' },
    quote: { type: String, default: '' },
    image: { type: String, default: '' },
    imageAlt: { type: String, default: '' },
    images: { type: [galleryItemSchema], default: undefined },
    videoUrl: { type: String, default: '' },
    ctaLabel: { type: String, default: '' },
    ctaUrl: { type: String, default: '' },
    layout: { type: String, default: 'image-left' },
    number: { type: String, default: '' },
}, { _id: false });

const localeSchema = new mongoose.Schema({
    title: { type: String, default: '' },
    sections: { type: [sectionSchema], default: [] },
}, { _id: false });

const localesSchema = new mongoose.Schema({
    en: { type: localeSchema, default: undefined },
    vi: { type: localeSchema, default: undefined },
}, { _id: false });

const pageContentSchema = new mongoose.Schema({
    pageKey: {
        type: String,
        required: true,
        unique: true,
        enum: ['about', 'build-process'],
    },
    revision: { type: Number, default: 1, min: 1 },
    draft: { type: localesSchema, default: undefined },
    published: { type: localesSchema, default: undefined },
    publishedAt: { type: Date, default: null },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, {
    collection: 'page_content',
    timestamps: true,
});

module.exports = mongoose.model('PageContent', pageContentSchema);
