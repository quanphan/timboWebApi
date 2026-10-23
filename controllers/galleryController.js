const { asyncHandler } = require('../middleware/errorHandler');
const { sendData } = require('../utils/http');
const { ApiError } = require('../utils/errors');

function createGalleryController(service) {
    return {
        listPublic: asyncHandler(async (req, res) => {
            const result = await service.listPublic(req.query);
            sendData(res, result.posts, 200, result.meta);
        }),
        getPublic: asyncHandler(async (req, res) => {
            sendData(res, await service.getPublic(req.params.id));
        }),
        listAdmin: asyncHandler(async (req, res) => {
            const result = await service.listAdmin(req.query);
            sendData(res, result.posts, 200, result.meta);
        }),
        getAdmin: asyncHandler(async (req, res) => {
            sendData(res, await service.getAdmin(req.params.id));
        }),
        create: asyncHandler(async (req, res) => {
            sendData(res, await service.create(req.body, req.user), 201);
        }),
        update: asyncHandler(async (req, res) => {
            sendData(res, await service.update(req.params.id, req.body, req.user));
        }),
        remove: asyncHandler(async (req, res) => {
            sendData(res, await service.remove(req.params.id));
        }),
        upload: asyncHandler(async (req, res) => {
            if (!req.uploadResult) {
                throw new ApiError(400, 'BAD_REQUEST', 'Choose an image or video file.');
            }
            sendData(res, req.uploadResult, 201);
        }),
    };
}

module.exports = { createGalleryController };
