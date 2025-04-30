const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const PRODUCT_FILE = path.join(__dirname, '../data/products.json');
const dataPath = path.join(__dirname, "../data/products.json");
const { readJsonFile } = require('../utils/fileService');

const loadProducts = () => {
    const data = fs.readFileSync(dataPath, "utf-8");
    return JSON.parse(data);
};

const writeProducts = (products) => {
    try {
        fs.writeFileSync(PRODUCT_FILE, JSON.stringify(products, null, 2));
    } catch (error) {
        console.error('Error writing product file:', error);
    }
};

const readProducts = () => {
    try {
        if (!fs.existsSync(PRODUCT_FILE)) fs.writeFileSync(PRODUCT_FILE, '[]');
        const data = fs.readFileSync(PRODUCT_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading product file:', error);
        return [];
    }
};

router.get("/", (req, res) => {
    const products = loadProducts(); // từ file .json

    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const type = req.query.type;

    let filtered = type && type !== "all"
        ? products.filter(p => p.type === type)
        : products;

    const start = (page - 1) * pageSize;
    const paginated = filtered.slice(start, start + pageSize);

    res.json(paginated);
});

router.get("/types", (req, res) => {
    const products = loadProducts();
    const types = [...new Set(products.map(p => p.type))];
    res.json(types);
});

// GET all products
router.get('/admin1', (req, res) => {
    const products = readProducts();
    res.status(200).json(products);
});

router.get('/admin', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const typeFilter = req.query.type || 'all';
    const brandFilter = req.query.brand || 'all';

    const products = readJsonFile('data/products.json');

    const filtered = products.filter(p => {
        const matchType = typeFilter === 'all' || p.type === typeFilter;
        const matchBrand = brandFilter === 'all' || p.brand === brandFilter;
        return matchType && matchBrand;
    });

    const startIndex = (page - 1) * limit;
    const paginatedProducts = filtered.slice(startIndex, startIndex + limit);

    res.json({
        products: paginatedProducts,
        total: filtered.length,
    });
});

router.post('/', (req, res) => {
    try {
        const products = readProducts();
        const newProduct = { ...req.body, id: Date.now() };
        products.push(newProduct);
        writeProducts(products);
        res.status(201).json({ message: 'Product added.', product: newProduct });
    } catch (error) {
        res.status(500).json({ error: 'Failed to add product.' });
    }
});
router.delete('/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const products = readProducts();
        const updated = products.filter((p) => p.id !== id);

        if (updated.length === products.length) {
            return res.status(404).json({ error: 'Product not found.' });
        }

        writeProducts(updated);
        res.status(200).json({ message: 'Product deleted.' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete product.' });
    }
});
// PUT update product
router.put('/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const products = readProducts();
        const index = products.findIndex((p) => p.id === id);

        if (index === -1) {
            return res.status(404).json({ error: 'Product not found.' });
        }

        const updatedProduct = { ...products[index], ...req.body };
        products[index] = updatedProduct;
        writeProducts(products);

        return res.status(200).json({ message: 'Product updated.', product: updatedProduct });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update product.' });
    }
});


module.exports = router;
