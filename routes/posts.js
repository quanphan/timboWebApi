const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const postsPath = path.join(__dirname, "../data/posts.json");

// Helper đọc file
function readPosts() {
    const data = fs.readFileSync(postsPath);
    return JSON.parse(data);
}

// Helper ghi file
function writePosts(posts) {
    fs.writeFileSync(postsPath, JSON.stringify(posts, null, 2));
}

// Lấy tất cả bài viết
router.get("/", (req, res) => {
    const posts = readPosts();
    res.json(posts);
});

// Lấy 1 bài viết theo ID
router.get("/:id", (req, res) => {
    const posts = readPosts();
    const post = posts.find(p => p.id === parseInt(req.params.id));
    if (!post) return res.status(404).json({ error: "Bài viết không tồn tại" });
    res.json(post);
});

// Tạo bài viết mới
router.post("/", (req, res) => {
    const { title, content } = req.body;
    if (!title || !content) return res.status(400).json({ error: "Thiếu dữ liệu" });

    const posts = readPosts();
    const newPost = {
        id: posts.length > 0 ? posts[posts.length - 1].id + 1 : 1,
        title,
        content
    };

    posts.push(newPost);
    writePosts(posts);
    res.status(201).json(newPost);
});

module.exports = router;
