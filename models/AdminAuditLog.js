const mongoose = require('mongoose');

const adminAuditLogSchema = new mongoose.Schema({
    action: { type: String, required: true },
    actorId: { type: String, required: true },
    actorRole: { type: String, required: true },
    inquiryId: { type: String, required: true },
    previousStatus: { type: String, default: null },
    nextStatus: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
}, {
    collection: 'admin_audit_logs',
});

adminAuditLogSchema.index({ inquiryId: 1, createdAt: -1 });

module.exports = mongoose.model('AdminAuditLog', adminAuditLogSchema);
