const mongoose = require('mongoose');

const SETTINGS_KEY = 'brand';

const workshopSchema = new mongoose.Schema({
    name: { type: String, default: '' },
    address: { type: String, default: '' },
    mapsUrl: { type: String, default: '' },
    note: { type: String, default: '' },
    enabled: { type: Boolean, default: true },
}, { _id: false });

const brandSettingsSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        default: SETTINGS_KEY,
        immutable: true,
    },
    contact: {
        email: { type: String, default: '' },
        phone: { type: String, default: '' },
        whatsapp: { type: String, default: '' },
        facebook: { type: String, default: '' },
        instagram: { type: String, default: '' },
        youtube: { type: String, default: '' },
        other: { type: String, default: '' },
    },
    workshops: {
        workshop1: { type: workshopSchema, default: () => ({}) },
        workshop2: { type: workshopSchema, default: () => ({}) },
    },
    display: {
        email: { type: Boolean, default: true },
        phone: { type: Boolean, default: true },
        whatsapp: { type: Boolean, default: true },
        facebook: { type: Boolean, default: true },
        instagram: { type: Boolean, default: true },
        youtube: { type: Boolean, default: true },
        other: { type: Boolean, default: true },
        hours: { type: Boolean, default: false },
    },
    hours: {
        en: { type: String, default: '' },
        vi: { type: String, default: '' },
    },
    updatedAt: { type: Date, default: Date.now },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
});

brandSettingsSchema.index({ key: 1 }, { unique: true });

module.exports = mongoose.model('BrandSettings', brandSettingsSchema);
module.exports.SETTINGS_KEY = SETTINGS_KEY;
