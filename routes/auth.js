const express = require("express");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const router = express.Router();
const User = require("../models/User");
const {compare} = require("bcrypt");

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password)
            return res.status(400).json({ message: 'Email and password are required' });

        const user = await User.findOne({ email });
        if (!user)
            return res.status(401).json({ message: 'Invalid email' });

        const isMatch = await compare(password, user.password);
        if (!isMatch)
            return res.status(401).json({ message: 'Invalid password' });

        const accessToken = jwt.sign(
            { id: user._id, email: user.email, admin: user.admin, userType:user.userType },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        const refreshToken = jwt.sign(
            { id: user._id, email: user.email },
            process.env.REFRESH_SECRET,
            { expiresIn: '1d' }
        );

        res.json({ accessToken, refreshToken });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});
// Refresh
router.post("/refresh", (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ message: "not found refresh token" });

    jwt.verify(refreshToken, process.env.REFRESH_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: "Refresh token invalid" });

        const accessToken = jwt.sign(
            { id: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );

        res.json({ accessToken });
    });
});

// Google Login
router.post("/google-login", async (req, res) => {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ message: "Not found Google token" });

    try {
        const googleRes = await axios.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
        const { email, name, sub: googleId } = googleRes.data;

        let user = await User.findOne({ email });

        if (!user) {
            user = new User({
                email,
                name,
                googleId
            });
            await user.save();
        }

        const token = jwt.sign(
            { id: user._id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );

        res.json({ token });
    } catch (err) {
        console.error("⛔ Google token error:", err.message);
        res.status(401).json({ message: "Google token không hợp lệ" });
    }
});

module.exports = router;
