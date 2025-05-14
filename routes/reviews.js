const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Review = require('../models/Review');
const { authenticateToken, isAdmin } = require("../middleware/auth");

router.post('/', authenticateToken, async (req, res) => {
    const { productId, rating, content, quality, shipping, service, recommend } = req.body;

    if (!productId || !rating || !content) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    try {
        const newReview = new Review({
            productId,
            name: req.user.email,
            rating,
            content,
            recommend,
            quality,
            shipping,
            service,
            createdAt: new Date()
        });

        await newReview.save();
        res.status(201).json({ message: 'Review saved', review: newReview });
    } catch (err) {
        console.error('❌ Failed to save review:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET: Lấy đánh giá theo sản phẩm
router.get('/:productId', async (req, res) => {
    const productId = req.params.productId;

    try {
        const reviews = await Review.find({ productId }).sort({ createdAt: -1 });
        res.json(reviews);
    } catch (err) {
        console.error('❌ Failed to get reviews:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
