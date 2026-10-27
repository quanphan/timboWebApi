const { asyncHandler } = require('../middleware/errorHandler');
const { sendData } = require('../utils/http');
const { ApiError } = require('../utils/errors');

function createCatalogController({ productService, cartService, reviewService }) {
    return {
        listProducts: asyncHandler(async (req, res) => {
            const result = await productService.list(req.query);
            sendData(res, result.products, 200, result.meta);
        }),
        productTypes: asyncHandler(async (req, res) => {
            sendData(res, await productService.listTypes());
        }),
        productBrands: asyncHandler(async (req, res) => {
            sendData(res, await productService.listBrands());
        }),
        getProduct: asyncHandler(async (req, res) => {
            sendData(res, await productService.getById(req.params.id));
        }),
        createProduct: asyncHandler(async (req, res) => {
            sendData(res, await productService.create(req.body), 201);
        }),
        updateProduct: asyncHandler(async (req, res) => {
            sendData(res, await productService.update(req.params.id, req.body));
        }),
        deleteProduct: asyncHandler(async (req, res) => {
            sendData(res, await productService.remove(req.params.id));
        }),
        listReviews: asyncHandler(async (req, res) => {
            sendData(res, await reviewService.listForProduct(req.params.productId));
        }),
        createReview: asyncHandler(async (req, res) => {
            sendData(res, await reviewService.create(req.user, req.params.productId, req.body), 201);
        }),
        getCart: asyncHandler(async (req, res) => {
            sendData(res, await cartService.getCart(req.user));
        }),
        addCartItem: asyncHandler(async (req, res) => {
            sendData(res, await cartService.addItem(req.user, req.body), 201);
        }),
        updateCartItem: asyncHandler(async (req, res) => {
            sendData(res, await cartService.updateItem(req.user, req.params.productId, req.body));
        }),
        removeCartItem: asyncHandler(async (req, res) => {
            sendData(res, await cartService.removeItem(req.user, req.params.productId));
        }),
        mergeCart: asyncHandler(async (req, res) => {
            sendData(res, await cartService.merge(req.user, req.body));
        }),
    };
}

function createContentController({ contactService, postService }) {
    return {
        createMessage: asyncHandler(async (req, res) => {
            sendData(res, await contactService.create(req.body), 201);
        }),
        listMessages: asyncHandler(async (req, res) => {
            const result = await contactService.list(req.query);
            sendData(res, result.messages, 200, result.meta);
        }),
        getMessage: asyncHandler(async (req, res) => {
            sendData(res, await contactService.getById(req.params.id));
        }),
        deleteMessage: asyncHandler(async (req, res) => {
            sendData(res, await contactService.remove(req.params.id));
        }),
        listPosts: asyncHandler(async (req, res) => {
            const result = await postService.listPublic(req.query);
            sendData(res, result.posts, 200, result.meta);
        }),
        getPost: asyncHandler(async (req, res) => {
            sendData(res, await postService.getPublic(req.params.id));
        }),
        createPost: asyncHandler(async (req, res) => {
            sendData(res, await postService.create(req.body), 201);
        }),
        updatePost: asyncHandler(async (req, res) => {
            sendData(res, await postService.update(req.params.id, req.body));
        }),
        deletePost: asyncHandler(async (req, res) => {
            sendData(res, await postService.remove(req.params.id));
        }),
        upload: asyncHandler(async (req, res) => {
            if (!req.uploadResult) {
                throw new ApiError(400, 'BAD_REQUEST', 'Choose an image file.');
            }
            sendData(res, req.uploadResult, 201);
        }),
    };
}

module.exports = { createCatalogController, createContentController };
