const { asyncHandler } = require('../middleware/errorHandler');
const { sendData } = require('../utils/http');

function noStore(res) {
    res.set('Cache-Control', 'no-store, private');
    res.set('Pragma', 'no-cache');
}

function createPageContentController(service) {
    return {
        getPublic: asyncHandler(async (req, res) => {
            sendData(res, await service.getPublic(req.params.pageKey));
        }),
        getAdmin: asyncHandler(async (req, res) => {
            noStore(res);
            sendData(res, await service.getAdmin(req.params.pageKey));
        }),
        preview: asyncHandler(async (req, res) => {
            noStore(res);
            const admin = await service.getAdmin(req.params.pageKey);
            sendData(res, {
                pageKey: admin.pageKey,
                revision: admin.revision,
                locales: admin.draft,
                preview: true,
            });
        }),
        saveDraft: asyncHandler(async (req, res) => {
            noStore(res);
            sendData(res, await service.saveDraft(req.params.pageKey, req.body, req.user));
        }),
        publish: asyncHandler(async (req, res) => {
            noStore(res);
            sendData(res, await service.publish(req.params.pageKey, req.body, req.user));
        }),
        revert: asyncHandler(async (req, res) => {
            noStore(res);
            sendData(res, await service.revert(req.params.pageKey, req.body, req.user));
        }),
        listOrphans: asyncHandler(async (req, res) => {
            noStore(res);
            sendData(res, await service.listOrphans());
        }),
        deleteOrphans: asyncHandler(async (req, res) => {
            noStore(res);
            sendData(res, await service.deleteOrphans(req.body));
        }),
    };
}

module.exports = { createPageContentController };
