const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
dotenv.config();
const mongoose = require('mongoose');
mongoose
    .connect(process.env.MONGO_URI, {
        dbName: 'timbowebdata',
    })
    .then(() => console.log('✅ MongoDB connected'))
    .catch((err) => console.error('MongoDB connection error:', err));

dotenv.config();
const app = express();

app.use(cors({
    origin: "*",
    credentials: true,
}));

app.use(express.json());

// Import route
const authRoutes = require("./routes/auth");
const accountRoutes = require("./routes/account");
const postRoutes = require("./routes/posts");
const productRoutes= require("./routes/products");
const contactRoutes= require("./routes/contact");
const uploadRoutes = require('./routes/upload');
const reviewRoutes = require('./routes/reviews');
const cartRoutes = require("./routes/cart");
// Use route
app.use("/api/auth", authRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/products", productRoutes);
app.use("/api/contact", contactRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/uploads', express.static('uploads'));
app.use('/api/reviews', reviewRoutes);
app.use("/api/cart", cartRoutes);

const PORT = process.env.PORT || 5050;
app.get("/", (req, res) => {
    res.send("Server is up and running!");
});
app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
