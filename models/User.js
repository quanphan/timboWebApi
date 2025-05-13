const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: String,
    name: String,
    googleId: String,
    admin: String,
    userType:String,
    phone:String,
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
