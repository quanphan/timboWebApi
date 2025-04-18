const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();
const app = express();

app.use(cors({
    origin: "*",
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
const PORT = process.env.PORT || 5050;
app.get("/", (req, res) => {
    res.send("Server is up and running!");
});
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
