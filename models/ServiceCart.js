const mongoose = require('mongoose');

const cartLineSchema = new mongoose.Schema({
    lineId: { type: String, required: true, maxlength: 80 },
    serviceItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceItem', required: true },
    optionValueIds: { type: [String], default: [] },
    quantity: { type: Number, default: 1, min: 1, max: 99 },
    unitPriceSnapshot: { type: Number, default: null },
    currencySnapshot: { type: String, default: null, maxlength: 8 },
    priceOnRequestSnapshot: { type: Boolean, default: false },
    titleEn: { type: String, default: '', maxlength: 200 },
    titleVi: { type: String, default: '', maxlength: 200 },
    imagePath: { type: String, default: null, maxlength: 500 },
    categorySlug: { type: String, default: null, maxlength: 80 },
    categoryNameEn: { type: String, default: '', maxlength: 120 },
    categoryNameVi: { type: String, default: '', maxlength: 120 },
    optionsSnapshot: { type: [mongoose.Schema.Types.Mixed], default: [] },
}, { _id: false });

const serviceCartSchema = new mongoose.Schema({
    ownerType: { type: String, enum: ['guest', 'user'], required: true, default: 'guest' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    sessionId: { type: String, maxlength: 80 },
    tokenHash: { type: String, maxlength: 64 },
    expiresAt: { type: Date },
    status: { type: String, enum: ['open', 'submitted', 'merged'], default: 'open' },
    submittedInquiryId: { type: String, default: null, maxlength: 80 },
    mergedSessionIds: { type: [String], default: [] },
    items: { type: [cartLineSchema], default: [] },
}, {
    collection: 'service_carts',
    timestamps: true,
});

serviceCartSchema.index({ sessionId: 1 }, { unique: true, sparse: true });
serviceCartSchema.index(
    { userId: 1 },
    { unique: true, partialFilterExpression: { ownerType: 'user', status: 'open', userId: { $type: 'objectId' } } },
);
serviceCartSchema.index(
    { expiresAt: 1 },
    { expireAfterSeconds: 0, partialFilterExpression: { ownerType: 'guest', expiresAt: { $type: 'date' } } },
);

module.exports = mongoose.model('ServiceCart', serviceCartSchema);
