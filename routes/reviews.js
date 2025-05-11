const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const REVIEWS_FILE = path.join(__dirname, '../data/reviews.json');

// Load all reviews
const readReviews = () => {
    if (!fs.existsSync(REVIEWS_FILE)) fs.writeFileSync(REVIEWS_FILE, '[]');
    return JSON.parse(fs.readFileSync(REVIEWS_FILE, 'utf-8'));
};

// Save reviews
const writeReviews = (reviews) => {
    fs.writeFileSync(REVIEWS_FILE, JSON.stringify(reviews, null, 2));
};
router.post('/', (req, res) => {
    const { productId, rating, content, quality, shipping, service, recommend, name } = req.body;

    if (!productId || !rating || !content || !name) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    const reviews = readReviews();
    const newReview = {
        id: Date.now(),
        productId,
        rating,
        content,
        quality,
        shipping,
        service,
        recommend,
        name,
        createdAt: new Date().toISOString()
    };

    reviews.push(newReview);
    writeReviews(reviews);

    res.status(201).json({ message: 'Review saved', review: newReview });
});

router.get('/:productId', (req, res) => {
    const reviews = readReviews();
    const productId = req.params.productId;
    const filtered = reviews.filter(r => r.productId == productId);
    res.json(filtered);
});

module.exports = router;
