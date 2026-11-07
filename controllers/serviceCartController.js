const { asyncHandler } = require('../middleware/errorHandler');
const { sendData } = require('../utils/http');
const { createServiceCartService } = require('../services/serviceCartService');

function createServiceCartController(config) {
    const cart = createServiceCartService(config);
    return {
        createSession: asyncHandler(async (req, res) => {
            sendData(res, await cart.createSession(), 201);
        }),
        getCart: asyncHandler(async (req, res) => {
            sendData(res, await cart.getCart(req));
        }),
        addItem: asyncHandler(async (req, res) => {
            sendData(res, await cart.addItem(req, req.body), 201);
        }),
        updateItem: asyncHandler(async (req, res) => {
            sendData(res, await cart.updateItem(req, req.params.lineId, req.body));
        }),
        removeItem: asyncHandler(async (req, res) => {
            sendData(res, await cart.removeItem(req, req.params.lineId));
        }),
        submit: asyncHandler(async (req, res) => {
            sendData(res, await cart.submit(req, req.body), 201);
        }),
        getConfirmation: asyncHandler(async (req, res) => {
            sendData(res, await cart.getConfirmation(req));
        }),
    };
}

module.exports = { createServiceCartController };
