const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Product' },
    name: { type: String, required: true },
    rating: { type: Number, required: true },
    content: { type: String, required: true },
    recommend: { type: Boolean, default: false },
    quality: { type: Number },
    shipping: { type: Number },
    service: { type: Number },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Review', reviewSchema);
