const mongoose = require('mongoose');

const translationSchema = new mongoose.Schema({
    name: { type: String, default: '' },
    description: { type: String, default: '' },
}, { _id: false });

const optionSchema = new mongoose.Schema({
    id: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: null },
    active: { type: Boolean, required: true },
    code: { type: String, default: '' },
    imagePath: { type: String, default: '' },
    icon: { type: String, default: '' },
    isDefault: { type: Boolean, default: false },
    defaultForInstrumentTypeIds: { type: [String], default: undefined },
    sortOrder: { type: Number, default: 0 },
    translations: {
        vi: { type: translationSchema, default: undefined },
        en: { type: translationSchema, default: undefined },
    },
    compatibility: { type: mongoose.Schema.Types.Mixed, default: undefined },
    attributes: { type: mongoose.Schema.Types.Mixed, default: undefined },
    metadata: { type: mongoose.Schema.Types.Mixed },
}, { _id: false });

const customBuildOptionSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, default: null },
    selectionMode: { type: String, enum: ['single', 'multiple'], required: true },
    required: { type: Boolean, required: true },
    maxSelections: { type: Number, required: true, min: 1, max: 20 },
    sortOrder: { type: Number, required: true, default: 0 },
    demo: { type: Boolean, default: true },
    metadata: { type: mongoose.Schema.Types.Mixed },
    options: {
        type: [optionSchema],
        required: true,
        validate: {
            validator(options) {
                return Array.isArray(options) && options.length > 0;
            },
            message: 'A custom-build category needs at least one option.',
        },
    },
}, {
    collection: 'custom_build_options',
    timestamps: true,
});

customBuildOptionSchema.index({ sortOrder: 1, id: 1 });

module.exports = mongoose.model('CustomBuildOption', customBuildOptionSchema);
