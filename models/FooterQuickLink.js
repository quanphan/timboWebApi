const mongoose = require('mongoose');

const localeSchema = new mongoose.Schema({
    title: { type: String, default: null, maxlength: 80 },
}, { _id: false });

const footerQuickLinkSchema = new mongoose.Schema({
    title: { type: String, required: true, maxlength: 80 },
    url: { type: String, required: true, maxlength: 500 },
    linkType: { type: String, enum: ['internal', 'external'], required: true },
    openInNewTab: { type: Boolean, default: false },
    translations: {
        vi: { type: localeSchema, default: undefined },
        en: { type: localeSchema, default: undefined },
    },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
}, {
    collection: 'footer_quick_links',
    timestamps: true,
});

footerQuickLinkSchema.index({ sortOrder: 1, title: 1 });
footerQuickLinkSchema.index({ isActive: 1, sortOrder: 1 });

module.exports = mongoose.model('FooterQuickLink', footerQuickLinkSchema);
