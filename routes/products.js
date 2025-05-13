const express = require("express");
const router = express.Router();
const Product = require('../models/Product');

// GET types from MongoDB
router.get("/types", async (req, res) => {
    try {
        const types = await Product.distinct("type");
        res.json(types.filter(Boolean));
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch types', error });
    }
});

// GET brands from MongoDB
router.get("/brands", async (req, res) => {
    try {
        const brands = await Product.distinct("brand");
        res.json(brands.filter(Boolean));
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch brands', error });
    }
});

// GET paginated products for admin panel
router.get('/admin', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;
        const typeFilter = req.query.type || 'all';
        const brandFilter = req.query.brand || 'all';

        const query = {};
        if (typeFilter !== 'all') query.type = typeFilter;
        if (brandFilter !== 'all') query.brand = brandFilter;

        const total = await Product.countDocuments(query);
        const products = await Product.find(query)
            .skip((page - 1) * limit)
            .limit(limit)
            .sort({ _id: -1 });

        res.json({ products, total });
    } catch (err) {
        res.status(500).json({ message: 'Admin product fetch error', error: err });
    }
});

// GET paginated + filtered products (client view)
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 10;
        const type = req.query.type;
        const brand = req.query.brand;
        const search = req.query.search?.toLowerCase() || '';

        const query = {};
        if (type && type !== 'all') query.type = type;
        if (brand && brand !== 'all') query.brand = brand;
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
            ];
        }

        const total = await Product.countDocuments(query);
        const products = await Product.find(query)
            .skip((page - 1) * pageSize)
            .limit(pageSize)
            .sort({ _id: -1 });

        res.json({ products, total });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err });
    }
});

// GET single product by ID
router.get('/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ message: 'Product not found' });
        res.json(product);
    } catch (err) {
        res.status(500).json({ message: 'Failed to get product', error: err });
    }
});

// POST new product
router.post('/', async (req, res) => {
    try {
        const newProduct = new Product(req.body);
        const saved = await newProduct.save();
        res.status(201).json({ message: 'Product added', product: saved });
    } catch (err) {
        res.status(500).json({ message: 'Failed to add product', error: err });
    }
});

// DELETE product
router.delete('/:id', async (req, res) => {
    try {
        const deleted = await Product.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ message: 'Product not found' });
        res.json({ message: 'Product deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to delete product', error: err });
    }
});

// PUT update product
router.put('/:id', async (req, res) => {
    try {
        const updated = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updated) return res.status(404).json({ message: 'Product not found' });
        res.json({ message: 'Product updated', product: updated });
    } catch (err) {
        res.status(500).json({ message: 'Failed to update product', error: err });
    }
});

module.exports = router;
