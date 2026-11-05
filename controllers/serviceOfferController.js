const { asyncHandler } = require('../middleware/errorHandler');
const { sendData } = require('../utils/http');

function createServiceOfferController(services) {
    return {
        listPublic: asyncHandler(async (req, res) => {
            sendData(res, await services.listPublic());
        }),
        getPublic: asyncHandler(async (req, res) => {
            sendData(res, await services.getPublic(req.params.slug));
        }),
        listCategories: asyncHandler(async (req, res) => {
            sendData(res, await services.listCategories());
        }),
        getCategory: asyncHandler(async (req, res) => {
            sendData(res, await services.getCategory(req.params.id));
        }),
        createCategory: asyncHandler(async (req, res) => {
            sendData(res, await services.createCategory(req.body), 201);
        }),
        updateCategory: asyncHandler(async (req, res) => {
            sendData(res, await services.updateCategory(req.params.id, req.body));
        }),
        reorderCategories: asyncHandler(async (req, res) => {
            sendData(res, await services.reorderCategories(req.body));
        }),
        deleteCategory: asyncHandler(async (req, res) => {
            sendData(res, await services.deleteCategory(req.params.id));
        }),
        listItems: asyncHandler(async (req, res) => {
            sendData(res, await services.listItems(req.query));
        }),
        getItem: asyncHandler(async (req, res) => {
            sendData(res, await services.getItem(req.params.id));
        }),
        createItem: asyncHandler(async (req, res) => {
            sendData(res, await services.createItem(req.body), 201);
        }),
        updateItem: asyncHandler(async (req, res) => {
            sendData(res, await services.updateItem(req.params.id, req.body));
        }),
        reorderItems: asyncHandler(async (req, res) => {
            sendData(res, await services.reorderItems(req.body));
        }),
        deleteItem: asyncHandler(async (req, res) => {
            sendData(res, await services.deleteItem(req.params.id));
        }),
    };
}

module.exports = { createServiceOfferController };
