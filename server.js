const express = require("express");
const cors = require("cors");
require("dotenv").config(); // Load biến môi trường từ .env

const app = express();
app.use(cors()); // Cho phép tất cả các domain gọi API
app.use(express.json()); // Hỗ trợ đọc dữ liệu JSON

// Dữ liệu giả lập
const posts = [
    { id: 1, title: "Bài viết 1", content: "Nội dung bài viết 1" },
    { id: 2, title: "Bài viết 2", content: "Nội dung bài viết 2" },
    { id: 3, title: "Bài viết 3", content: "Nội dung bài viết 3" },
];


// API lấy danh sách bài viết
app.get("/api/posts", (req, res) => {
    res.json(posts);
});

// API lấy 1 bài viết theo ID
app.get("/api/posts/:id", (req, res) => {
    const post = posts.find((p) => p.id === parseInt(req.params.id));
    if (!post) return res.status(404).json({ error: "Bài viết không tồn tại" });
    res.json(post);
});

// API tạo bài viết mới
app.post("/api/posts", (req, res) => {
    const { title, content } = req.body;
    if (!title || !content) return res.status(400).json({ error: "Thiếu dữ liệu" });

    const newPost = { id: posts.length + 1, title, content };
    posts.push(newPost);
    res.status(201).json(newPost);
});

const accountRoutes = require("./routes/account");
const productRoutes = require("./routes/product");

app.use("/api/accounts", accountRoutes);
app.use("/api/products", productRoutes);

const PORT = 5050
app.listen(PORT, () => console.log(`🚀 Server chạy tại http://localhost:${PORT}`));
