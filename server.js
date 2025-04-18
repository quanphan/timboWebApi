const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config(); // Load biến môi trường .env

const app = express();

// ✅ CORS: Nếu bạn muốn an toàn, có thể giới hạn domain ở đây
app.use(cors({
    origin: "*", // Cho phép tất cả domain (tạm thời để chạy)
    credentials: true,
}));

app.use(express.json());

// Import các route
const authRoutes = require("./routes/auth");
const accountRoutes = require("./routes/account");
const postRoutes = require("./routes/posts");

// Use các route
app.use("/api/auth", authRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/posts", postRoutes);

// ✅ Đúng cách đọc PORT từ Railway (hoặc fallback local)
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
