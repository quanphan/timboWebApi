const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors()); // Cho phép tất cả các domain gọi API
app.use(express.json()); // Hỗ trợ đọc dữ liệu JSON

// Import các route
const authRoutes = require("./routes/auth");
const accountRoutes = require("./routes/account");
const postRoutes = require("./routes/posts");

app.use("/api/auth", authRoutes);       // Đăng ký, đăng nhập
app.use("/api/account", accountRoutes); // Lấy thông tin user từ token
app.use("/api/posts", postRoutes);      // Lấy, tạo bài viết

const PORT = process.env.PORT || 5050;
app.listen(PORT, () => console.log(`🚀 Server run as http://localhost:${PORT}`));
