const Cart = require('../models/Cart');
const Product = require('../models/Product');
const { ApiError } = require('../utils/errors');
const { publicProduct } = require('../utils/presenters');

function requireQuantity(quantity) {
    const value = Number(quantity);
    if (!Number.isInteger(value) || value < 1 || value > 99) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Cart item is invalid.', [
            { field: 'quantity', code: 'INVALID', message: 'Quantity must be an integer from 1 to 99.' },
        ]);
    }
    return value;
}

async function loadProduct(productId) {
    const product = await Product.findById(productId);
    if (!product) {
        throw new ApiError(404, 'NOT_FOUND', 'Product was not found.');
    }
    return product;
}

async function presentCart(cart) {
    if (!cart) {
        return { items: [] };
    }
    await cart.populate('items.productId');
    return {
        items: cart.items.map((item) => ({
            productId: item.productId && item.productId._id ? String(item.productId._id) : String(item.productId),
            quantity: item.quantity,
            price: item.price ?? null,
            product: item.productId && item.productId._id ? publicProduct(item.productId) : null,
        })),
    };
}

function createCartService() {
    return {
        async getCart(user) {
            const cart = await Cart.findOne({ userId: String(user._id) });
            return presentCart(cart);
        },

        async addItem(user, body) {
            if (!body || !body.productId) {
                throw new ApiError(400, 'BAD_REQUEST', 'Product id is required.');
            }
            const quantity = requireQuantity(body.quantity || 1);
            const product = await loadProduct(body.productId);
            let cart = await Cart.findOne({ userId: String(user._id) });
            if (!cart) {
                cart = new Cart({ userId: String(user._id), items: [] });
            }
            const existing = cart.items.find((item) => String(item.productId) === String(product._id));
            if (existing) {
                const nextQuantity = existing.quantity + quantity;
                if (nextQuantity > 99) {
                    throw new ApiError(422, 'VALIDATION_ERROR', 'Cart item is invalid.', [
                        { field: 'quantity', code: 'INVALID', message: 'Quantity cannot exceed 99.' },
                    ]);
                }
                existing.quantity = nextQuantity;
                existing.price = product.price;
            } else {
                cart.items.push({
                    productId: product._id,
                    quantity,
                    price: product.price,
                });
            }
            await cart.save();
            return presentCart(cart);
        },

        async updateItem(user, productId, body) {
            const quantity = requireQuantity(body && body.quantity);
            const cart = await Cart.findOne({ userId: String(user._id) });
            if (!cart) {
                throw new ApiError(404, 'NOT_FOUND', 'Cart item was not found.');
            }
            const existing = cart.items.find((item) => String(item.productId) === String(productId));
            if (!existing) {
                throw new ApiError(404, 'NOT_FOUND', 'Cart item was not found.');
            }
            existing.quantity = quantity;
            await cart.save();
            return presentCart(cart);
        },

        async removeItem(user, productId) {
            const cart = await Cart.findOne({ userId: String(user._id) });
            if (!cart) {
                return { items: [] };
            }
            cart.items = cart.items.filter((item) => String(item.productId) !== String(productId));
            await cart.save();
            return presentCart(cart);
        },

        async merge(user, body) {
            if (!body || !Array.isArray(body.items)) {
                throw new ApiError(400, 'BAD_REQUEST', 'Items must be a list.');
            }
            let cart = await Cart.findOne({ userId: String(user._id) });
            if (!cart) {
                cart = new Cart({ userId: String(user._id), items: [] });
            }
            for (const incoming of body.items.slice(0, 50)) {
                if (!incoming || !incoming.productId) {
                    continue;
                }
                const product = await Product.findById(incoming.productId);
                if (!product) {
                    continue;
                }
                const quantity = requireQuantity(incoming.quantity || 1);
                const existing = cart.items.find((item) => String(item.productId) === String(product._id));
                if (existing) {
                    const nextQuantity = existing.quantity + quantity;
                    if (nextQuantity > 99) {
                        throw new ApiError(422, 'VALIDATION_ERROR', 'Cart item is invalid.', [
                            { field: 'quantity', code: 'INVALID', message: 'Quantity cannot exceed 99.' },
                        ]);
                    }
                    existing.quantity = nextQuantity;
                    existing.price = product.price;
                } else {
                    cart.items.push({ productId: product._id, quantity, price: product.price });
                }
            }
            await cart.save();
            return presentCart(cart);
        },
    };
}

module.exports = { createCartService };
