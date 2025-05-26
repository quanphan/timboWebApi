
const mongoose = require("mongoose");
const cartItemSchema = require("./CartItem"); //

const cartSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    items: [cartItemSchema],
    status: { type: Number },
    type: { type: String },
});

module.exports = mongoose.model("Cart", cartSchema);