const { asyncHandler } = require('../middleware/errorHandler');
const { sendData } = require('../utils/http');

function createCatalogAdminController({ catalogTermService, productService }) {
    return {
        listTerms: asyncHandler(async (req, res) => {
            sendData(res, await catalogTermService.list(req.params.kind));
        }),
        getTerm: asyncHandler(async (req, res) => {
            sendData(res, await catalogTermService.get(req.params.kind, req.params.id));
        }),
        createTerm: asyncHandler(async (req, res) => {
            sendData(res, await catalogTermService.create(req.params.kind, req.body), 201);
        }),
        updateTerm: asyncHandler(async (req, res) => {
            sendData(res, await catalogTermService.update(req.params.kind, req.params.id, req.body));
        }),
        reorderTerms: asyncHandler(async (req, res) => {
            sendData(res, await catalogTermService.reorder(req.params.kind, req.body));
        }),
        deleteTerm: asyncHandler(async (req, res) => {
            sendData(res, await catalogTermService.remove(req.params.kind, req.params.id));
        }),
        listProducts: asyncHandler(async (req, res) => {
            const result = await productService.listAdmin(req.query);
            sendData(res, result.products, 200, result.meta);
        }),
        getProduct: asyncHandler(async (req, res) => {
            sendData(res, await productService.getById(req.params.id, { includeDrafts: true }));
        }),
        createProduct: asyncHandler(async (req, res) => {
            sendData(res, await productService.create(req.body), 201);
        }),
        updateProduct: asyncHandler(async (req, res) => {
            sendData(res, await productService.update(req.params.id, req.body));
        }),
        reorderProducts: asyncHandler(async (req, res) => {
            sendData(res, await productService.reorder(req.body));
        }),
    };
}

function createPublicCatalogController(catalogTermService) {
    return {
        listTerms: asyncHandler(async (req, res) => {
            sendData(res, await catalogTermService.list(req.params.kind, { activeOnly: true }));
        }),
    };
}

module.exports = { createCatalogAdminController, createPublicCatalogController };
