const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Product' },
    name: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    content: { type: String, required: true },
    recommend: { type: Boolean, default: false },
    quality: { type: Number, min: 1, max: 5 },
    shipping: { type: Number, min: 1, max: 5 },
    service: { type: Number, min: 1, max: 5 },
    createdAt: { type: Date, default: Date.now },
});

reviewSchema.index({ productId: 1, createdAt: -1 });

module.exports = mongoose.model('Review', reviewSchema);
