const { asyncHandler } = require('../middleware/errorHandler');
const { sendData } = require('../utils/http');

function createFooterQuickLinkController(service) {
    return {
        listPublic: asyncHandler(async (req, res) => {
            sendData(res, await service.listPublic());
        }),
        listAdmin: asyncHandler(async (req, res) => {
            sendData(res, await service.listAdmin());
        }),
        getAdmin: asyncHandler(async (req, res) => {
            sendData(res, await service.getAdmin(req.params.id));
        }),
        create: asyncHandler(async (req, res) => {
            sendData(res, await service.create(req.body), 201);
        }),
        update: asyncHandler(async (req, res) => {
            sendData(res, await service.update(req.params.id, req.body));
        }),
        reorder: asyncHandler(async (req, res) => {
            sendData(res, await service.reorder(req.body));
        }),
        remove: asyncHandler(async (req, res) => {
            sendData(res, await service.remove(req.params.id));
        }),
    };
}

module.exports = { createFooterQuickLinkController };
