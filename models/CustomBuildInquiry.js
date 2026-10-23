const mongoose = require('mongoose');

const customBuildInquirySchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    status: {
        type: String,
        required: true,
        enum: ['received', 'new', 'ready_to_build', 'building', 'completed', 'cancelled'],
        default: 'received',
    },
    customer: {
        type: new mongoose.Schema({
            name: { type: String, required: true, maxlength: 100 },
            email: { type: String, required: true, maxlength: 254 },
            phone: { type: String, default: null, maxlength: 30 },
        }, { _id: false }),
        required: true,
    },
    configuration: {
        type: new mongoose.Schema({
            selections: { type: mongoose.Schema.Types.Mixed, required: true },
            notes: { type: String, default: null, maxlength: 2000 },
        }, { _id: false }),
        required: true,
    },
    message: { type: String, default: null, maxlength: 2000 },
    draftId: { type: String, default: null, maxlength: 80 },
    submissionKey: { type: String, required: true, unique: true, sparse: true },
}, {
    collection: 'custom_build_inquiries',
    timestamps: true,
});

customBuildInquirySchema.index({ draftId: 1 });
customBuildInquirySchema.index({ createdAt: -1, id: 1 });
customBuildInquirySchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('CustomBuildInquiry', customBuildInquirySchema);
