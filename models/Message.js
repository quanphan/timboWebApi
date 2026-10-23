const mongoose = require('mongoose');

const INQUIRY_TYPES = ['custom-guitar', 'ready-stock', 'technical', 'collaboration'];

const messageSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: String,
    subject: String,
    message: { type: String, required: true },
    inquiryType: { type: String, enum: INQUIRY_TYPES },
    productId: String,
    productRef: String,
    draftId: String,
    createdAt: { type: Date, default: Date.now },
    legacy: {
        source: String,
        id: String,
    },
});

messageSchema.index({ createdAt: -1 });
messageSchema.index({ 'legacy.id': 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Message', messageSchema);
