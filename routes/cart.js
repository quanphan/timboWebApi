const express = require("express");
const Cart = require("../models/Cart");
const cartItem = require("../models/CartItem");
const router = express.Router();

// Add item or update quantity
router.post("/", async (req, res) => {
    const { userId, productId, quantity } = req.body;

    if (!userId || !productId || !quantity) {
        return res.status(400).json({ message: "Missing fields" });
    }

    try {
        let cart = await Cart.findOne({ userId });

        if (!cart) {
            cart = await Cart.create({
                userId,
                items: [{ productId, quantity }],
            });
        } else {
            const existingItem = cart.items.find(item => item.productId.equals(productId));
            if (existingItem) {
                existingItem.quantity += quantity;
            } else {
                cart.items.push({ productId, quantity });
            }
            await cart.save();
        }

        res.json({ message: "Item added to cart", cart });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
});

// Merge items (e.g., after login)
router.post("/merge", async (req, res) => {
    const { userId, items } = req.body;

    if (!userId || !Array.isArray(items)) {
        return res.status(400).json({ message: "Invalid merge data" });
    }

    try {
        let cart = await Cart.findOne({ userId });
        if (!cart) {
            cart = await Cart.create({ userId, items: [] });
        }

        for (const incoming of items) {
            const existing = cart.items.find(i => i.productId.equals(incoming.productId));
            if (existing) {
                existing.quantity += incoming.quantity;
            } else {
                cart.items.push({ productId: incoming.productId, quantity: incoming.quantity });
            }
        }

        await cart.save();
        res.json({ message: "Cart merged", cart });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
});

// Get cart
router.get("/:userId", async (req, res) => {
    try {
        const cart = await Cart.findOne({ userId: req.params.userId }).populate("items.productId");
        res.json(cart?.items || []);
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});


// Remove item
router.delete("/:userId/:productId", async (req, res) => {
    try {
        const { userId, productId } = req.params;
        const cart = await Cart.findOne({ userId });
        if (!cart) return res.json([]);

        cart.items = cart.items.filter(i => !i.productId.equals(productId));
        await cart.save();

        res.json({ message: "Item removed", cart: cart.items });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;