const express = require("express");
const router = express.Router();

let cartData = {}; // In-memory. Replace with DB later if needed

// Add to cart
router.post("/", (req, res) => {
    const { userId, product, quantity } = req.body;

    if (!userId || !product || !product._id || !quantity) {
        return res.status(400).json({ message: "Missing fields" });
    }

    if (!cartData[userId]) cartData[userId] = [];

    const existing = cartData[userId].find(p => p.product._id === product._id);
    if (existing) {
        existing.quantity += quantity;
    } else {
        cartData[userId].push({ product, quantity });
    }

    res.status(200).json({ message: "Added to cart", cart: cartData[userId] });
});

// Get user's cart
router.get("/:userId", (req, res) => {
    const { userId } = req.params;
    const cart = cartData[userId] || [];
    res.json(cart);
});

// Remove item
router.delete("/:userId/:productId", (req, res) => {
    const { userId, productId } = req.params;
    if (cartData[userId]) {
        cartData[userId] = cartData[userId].filter(p => p.product._id !== productId);
    }
    res.status(200).json({ message: "Item removed", cart: cartData[userId] });
});

module.exports = router;
