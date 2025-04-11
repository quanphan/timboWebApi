const express = require("express");
const fs = require("fs/promises");
const path = require("path");

const router = express.Router();
const dataPath = path.join(__dirname, "../data/accounts.json");

// Helper: đọc và ghi file JSON
const readData = async () => JSON.parse(await fs.readFile(dataPath, "utf-8"));
const writeData = async (data) => await fs.writeFile(dataPath, JSON.stringify(data, null, 2));

// GET all accounts
router.get("/", async (req, res) => {
    const accounts = await readData();
    res.json(accounts);
});

// GET one account by id
router.get("/:id", async (req, res) => {
    const accounts = await readData();
    const account = accounts.find((a) => a.id == req.params.id);
    if (!account) return res.status(404).json({ error: "Không tìm thấy tài khoản" });
    res.json(account);
});

// POST create new account
router.post("/", async (req, res) => {
    const accounts = await readData();
    const newAccount = { id: Date.now(), ...req.body };
    accounts.push(newAccount);
    await writeData(accounts);
    res.status(201).json(newAccount);
});

// PUT update account
router.put("/:id", async (req, res) => {
    let accounts = await readData();
    const index = accounts.findIndex((a) => a.id == req.params.id);
    if (index === -1) return res.status(404).json({ error: "Không tìm thấy tài khoản" });

    accounts[index] = { ...accounts[index], ...req.body };
    await writeData(accounts);
    res.json(accounts[index]);
});

// DELETE account
router.delete("/:id", async (req, res) => {
    let accounts = await readData();
    const filtered = accounts.filter((a) => a.id != req.params.id);
    if (filtered.length === accounts.length)
        return res.status(404).json({ error: "Không tìm thấy tài khoản" });

    await writeData(filtered);
    res.json({ message: "Xoá thành công" });
});

module.exports = router;
