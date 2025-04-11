const express = require("express");
const fs = require("fs/promises");
const path = require("path");

const router = express.Router();
const dataPath = path.join(__dirname, "../data/products.json");

const readData = async () => JSON.parse(await fs.readFile(dataPath, "utf-8"));
const writeData = async (data) => await fs.writeFile(dataPath, JSON.stringify(data, null, 2));

// GET all products
router.get("/", async (req, res) => {
    const products = await readData();
    res.json(products);
});

// GET one product by id
router.get("/:id", async (req, res) => {
    const products = await readData();
    const product = products.find((p) => p.id == req.params.id);
    if (!product) return res.status(404).json({ error: "Không tìm thấy sản phẩm" });
    res.json(product);
});

// POST new product
router.post("/", async (req, res) => {
    const products = await readData();
    const newProduct = { id: Date.now(), ...req.body };
    products.push(newProduct);
    await writeData(products);
    res.status(201).json(newProduct);
});

// PUT update product
router.put("/:id", async (req, res) => {
    let products = await readData();
    const index = products.findIndex((p) => p.id == req.params.id);
    if (index === -1) return res.status(404).json({ error: "Không tìm thấy sản phẩm" });

    products[index] = { ...products[index], ...req.body };
    await writeData(products);
    res.json(products[index]);
});

// DELETE product
router.delete("/:id", async (req, res) => {
    let products = await readData();
    const filtered = products.filter((p) => p.id != req.params.id);
    if (filtered.length === products.length)
        return res.status(404).json({ error: "Không tìm thấy sản phẩm" });

    await writeData(filtered);
    res.json({ message: "Xoá sản phẩm thành công" });
});

module.exports = router;
