const express = require("express");
const jwt = require("jsonwebtoken");

const router = express.Router();

// Middleware kiểm tra Access Token
function authenticateToken(req, res, next) {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

// Route lấy profile
router.get("/me", authenticateToken, (req, res) => {
    res.json({ id: req.user.id, email: req.user.email });
});

module.exports = router;
