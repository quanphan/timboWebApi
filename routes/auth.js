const express = require("express");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");

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
        { expiresIn: "15m" } // access token sống 15 phút
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
            { id: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: "15m" }
        );

        res.json({ accessToken });
    });
});

module.exports = router;
