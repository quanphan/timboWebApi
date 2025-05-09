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

router.get("/types", (req, res) => {
    const products = loadProducts();
    const types = [...new Set(products.map(p => p.type))];
    res.json(types);
});
router.get("/brands", (req, res) => {
    const products = loadProducts();
    const brands = [...new Set(products.map(p => p.brand))];
    res.json(brands);
});

// GET all products
router.get('/admin-list', (req, res) => {
    const products = readProducts();
    res.status(200).json(products);
});

router.get('/admin', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const typeFilter = req.query.type || 'all';
    const brandFilter = req.query.brand || 'all';

    const products = readJsonFile('data/products.json');

    const filtered = products
        .filter(p => {
            const matchType = typeFilter === 'all' || p.type === typeFilter;
            const matchBrand = brandFilter === 'all' || p.brand === brandFilter;
            return matchType && matchBrand;
        })
        .sort((a, b) => b.id - a.id);

    const startIndex = (page - 1) * limit;
    const paginatedProducts = filtered.slice(startIndex, startIndex + limit);

    res.json({
        products: paginatedProducts,
        total: filtered.length,
    });
});
router.get("/", (req, res) => {
    const products = loadProducts(); // từ file .json

    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const type = req.query.type;
    const brand = req.query.brand;
    const search = req.query.search?.toLowerCase() || '';
    const sort = req.query.sort || 'latest';

    let filtered = products;

    if (type && type !== 'all') {
        filtered = filtered.filter(p => p.type === type);
    }

    if (brand && brand !== 'all') {
        filtered = filtered.filter(p => p.brand === brand);
    }

    if (search) {
        filtered = filtered.filter(p =>
            p.name.toLowerCase().includes(search) ||
            p.description.toLowerCase().includes(search)
        );
    }

    // Sort
    if (sort === 'price-asc') {
        filtered.sort((a, b) => a.price - b.price);
    } else if (sort === 'price-desc') {
        filtered.sort((a, b) => b.price - a.price);
    } else if (sort === 'latest') {
        filtered.sort((a, b) => b.id - a.id); // assume newest has higher id
    }

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const paginated = filtered.slice(start, start + pageSize);

    res.json({ products: paginated, total });
});
router.get('/:id', (req, res) => {
    const products = loadProducts(); // đọc từ file .json
    const id = parseInt(req.params.id);

    const product = products.find(p => p.id === id);

    if (!product) {
        return res.status(404).json({ message: 'Product not found' });
    }

    res.json(product);
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
