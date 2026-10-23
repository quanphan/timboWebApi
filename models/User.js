const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema({
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now },
}, { _id: false });

const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    username: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    password: String,
    name: String,
    googleId: String,
    phone: String,
    country: { type: String, default: null, maxlength: 80 },
    shippingAddress: {
        type: new mongoose.Schema({
            line1: { type: String, default: null, maxlength: 120 },
            line2: { type: String, default: null, maxlength: 120 },
            city: { type: String, default: null, maxlength: 80 },
            region: { type: String, default: null, maxlength: 80 },
            postalCode: { type: String, default: null, maxlength: 20 },
            country: { type: String, default: null, maxlength: 80 },
        }, { _id: false }),
        default: undefined,
    },
    marketingConsent: { type: Boolean, default: false },
    emailVerified: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'locked'], default: 'active' },
    userType: String,
    admin: mongoose.Schema.Types.Mixed,
    role: { type: String, enum: ['customer', 'admin', 'superadmin'] },
    permissions: { type: [String], default: undefined },
    refreshTokens: { type: [refreshTokenSchema], default: [] },
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('User', userSchema);
