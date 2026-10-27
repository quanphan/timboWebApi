const mongoose = require('mongoose');

const adminNotificationSchema = new mongoose.Schema({
    eventType: { type: String, required: true },
    dedupeKey: { type: String, required: true },
    resourceId: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
}, {
    collection: 'admin_notification_deliveries',
});

adminNotificationSchema.index({ eventType: 1, dedupeKey: 1 }, { unique: true });

module.exports = mongoose.model('AdminNotification', adminNotificationSchema);
