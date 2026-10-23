const { asyncHandler } = require('../middleware/errorHandler');
const { sendData } = require('../utils/http');

function createBrandSettingsController(service) {
    return {
        getPublic: asyncHandler(async (req, res) => {
            sendData(res, await service.getPublic());
        }),
        getAdmin: asyncHandler(async (req, res) => {
            sendData(res, await service.getAdmin());
        }),
        updateAdmin: asyncHandler(async (req, res) => {
            sendData(res, await service.update(req.body, req.user));
        }),
    };
}

module.exports = { createBrandSettingsController };
