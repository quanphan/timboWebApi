const express = require("express");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const router = express.Router();
const usersPath = path.join(__dirname, "../data/users.json");

function readUsers() {
    if (!fs.existsSync(usersPath)) return [];
    const data = fs.readFileSync(usersPath, "utf-8");
    return JSON.parse(data);
}

// Login
router.post("/login", (req, res) => {
    const { email, password } = req.body;
    const users = readUsers();

    const user = users.find((u) => u.email === email && u.password === password);
    if (!user) return res.status(401).json({ message: "Sai email hoặc mật khẩu" });

    const accessToken = jwt.sign(
        { id: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: "30m" } // access token sống 15 phút
    );

    const refreshToken = jwt.sign(
        { id: user.id, email: user.email },
        process.env.REFRESH_SECRET,
        { expiresIn: "1d" } // refresh token sống 1 ngày
    );

    res.json({ accessToken, refreshToken });
});

// Refresh
router.post("/refresh", (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ message: "Thiếu refresh token" });

    jwt.verify(refreshToken, process.env.REFRESH_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: "Refresh token không hợp lệ" });

        const accessToken = jwt.sign(
            { id: user.id, email: user.email, admin:user.admin},
            process.env.JWT_SECRET,
            { expiresIn: "15m" }
        );

        res.json({ accessToken });
    });
});

router.post("/google-login", async (req, res) => {
    const { credential } = req.body;

    if (!credential) return res.status(400).json({ message: "Thiếu Google token" });

    try {
        // Gửi token lên Google xác minh
        const googleRes = await axios.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
        const { email, name, sub } = googleRes.data;

        let users = readUsers();
        let user = users.find(u => u.email === email);

        // Nếu chưa có, tạo user mới
        if (!user) {
            user = {
                id: Date.now(),
                email,
                name,
                googleId: sub
            };
            users.push(user);
            writeUsers(users);
        }

        // Tạo JWT của hệ thống
        const token = jwt.sign(
            { id: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );

        res.json({ token });

    } catch (err) {
        console.error("⛔ Lỗi xác minh Google token:");
        if (err.response) {
            console.error("Status:", err.response.status);
            console.error("Data:", err.response.data);
        } else {
            console.error("Message:", err.message);
        }

        res.status(401).json({ message: "Google token không hợp lệ hoặc đã hết hạn" });
    }
});

module.exports = router;
