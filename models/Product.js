const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    code: String,
    name: String,
    description: String,
    descriptionDetail: String,
    price: Number,
    unit:String,
    rating: Number,
    brand: String,
    type: String,
    qty:Number,
    image: String,
    images: [String],
});
module.exports = mongoose.model('Product', productSchema);
