const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();
const User = require("../models/User");
const { authenticateToken, isAdmin } = require("../middleware/auth");
const bcrypt = require('bcrypt');

// Register user
router.post("/register", async (req, res) => {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ message: "Name, email, and password are required." });
    }

    try {
        const existing = await User.findOne({ email });
        if (existing) {
            return res.status(409).json({ message: "Email is already registered." });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({
            name,
            email,
            password: hashedPassword,
            phone,
        });

        await newUser.save();
        res.status(201).json({ message: "Registration successful!" });
    } catch (err) {
        console.error("Register error:", err);
        res.status(500).json({ message: "Server error during registration." });
    }
});

// Route get profile
router.get("/me", authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select("-password -__v");
        if (!user) return res.status(404).json({ message: "User not found" });

        res.json(user);
    } catch (err) {
        console.error("Failed to fetch profile:", err);
        res.status(500).json({ message: "Server error" });
    }
});

// PUT: update user
router.put("/me", authenticateToken, async (req, res) => {
    try {
        const updates = req.body;
        const user = await User.findByIdAndUpdate(req.user.id, updates, {
            new: true,
            runValidators: true,
        }).select("-password -__v");

        if (!user) return res.status(404).json({ message: "User not found" });

        res.json({ message: "Profile updated", user });
    } catch (err) {
        console.error("PUT /me error:", err);
        res.status(500).json({ message: "Update failed" });
    }
});

router.get("/", authenticateToken, isAdmin, async (req, res) => {
    try {
        const users = await User.find().select("-password"); // exclude password
        res.json(users);
    } catch (err) {
        console.error("Failed to fetch users:", err);
        res.status(500).json({ message: "Server error" });
    }
});
router.put("/:id", authenticateToken, isAdmin, async (req, res) => {
    try {
        const { name, phone, userType, isAdmin } = req.body;

        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (phone !== undefined) updateData.phone = phone;
        if (userType !== undefined) updateData.userType = userType;
        if (isAdmin !== undefined) updateData.admin = isAdmin;

        const user = await User.findByIdAndUpdate(req.params.id, updateData, { new: true });
        if (!user) return res.status(404).json({ message: "User not found" });

        res.json({ message: "User updated", user });
    } catch (err) {
        console.error("Failed to update user:", err);
        res.status(500).json({ message: "Server error" });
    }
});
router.delete("/:id", authenticateToken, isAdmin, async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) return res.status(404).json({ message: "User not found" });

        res.json({ message: "User deleted" });
    } catch (err) {
        console.error("Failed to delete user:", err);
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;
