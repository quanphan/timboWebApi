const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: { type: String, required: true },
    published: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    legacy: {
        source: String,
        id: String,
    },
});

postSchema.index({ published: 1, createdAt: -1 });
postSchema.index({ 'legacy.id': 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Post', postSchema);
