const mongoose = require('mongoose');

const localeSchema = new mongoose.Schema({
    title: { type: String, default: null, maxlength: 160 },
    html: { type: String, default: null, maxlength: 20000 },
}, { _id: false });

const optionNameLocaleSchema = new mongoose.Schema({
    name: { type: String, default: null, maxlength: 80 },
}, { _id: false });

const optionLabelLocaleSchema = new mongoose.Schema({
    label: { type: String, default: null, maxlength: 80 },
}, { _id: false });

const optionValueSchema = new mongoose.Schema({
    id: { type: String, required: true, maxlength: 40 },
    label: { type: String, required: true, maxlength: 80 },
    translations: {
        vi: { type: optionLabelLocaleSchema, default: undefined },
        en: { type: optionLabelLocaleSchema, default: undefined },
    },
    price: { type: Number, default: null, min: 0 },
}, { _id: false });

const optionGroupSchema = new mongoose.Schema({
    id: { type: String, required: true, maxlength: 40 },
    name: { type: String, required: true, maxlength: 80 },
    translations: {
        vi: { type: optionNameLocaleSchema, default: undefined },
        en: { type: optionNameLocaleSchema, default: undefined },
    },
    values: { type: [optionValueSchema], default: [] },
}, { _id: false });

const variantPriceSchema = new mongoose.Schema({
    valueIds: { type: [String], default: [] },
    price: { type: Number, required: true, min: 0 },
}, { _id: false });

const serviceItemSchema = new mongoose.Schema({
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceCategory', required: true },
    title: { type: String, required: true, maxlength: 160 },
    translations: {
        vi: { type: localeSchema, default: undefined },
        en: { type: localeSchema, default: undefined },
    },
    imagePath: { type: String, default: null, maxlength: 240 },
    price: { type: Number, default: null, min: 0 },
    currency: { type: String, default: null, maxlength: 8 },
    optionGroups: { type: [optionGroupSchema], default: [] },
    variantPrices: { type: [variantPriceSchema], default: [] },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
}, {
    collection: 'service_items',
    timestamps: true,
});

serviceItemSchema.index({ categoryId: 1, sortOrder: 1, title: 1 });

module.exports = mongoose.model('ServiceItem', serviceItemSchema);
