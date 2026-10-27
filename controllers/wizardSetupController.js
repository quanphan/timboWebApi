const { asyncHandler } = require('../middleware/errorHandler');
const { sendData } = require('../utils/http');
const { createWizardSetupService } = require('../services/customBuild/wizardSetupService');

function decodeParam(value) {
    if (typeof value !== 'string' || value === '') return value;
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function createWizardSetupController() {
    const service = createWizardSetupService();
    return {
        list: asyncHandler(async (req, res) => {
            sendData(res, await service.list());
        }),
        getCategory: asyncHandler(async (req, res) => {
            sendData(res, await service.getCategory(req.params.categoryId));
        }),
        createOption: asyncHandler(async (req, res) => {
            sendData(res, await service.createOption(req.params.categoryId, req.body), 201);
        }),
        updateOption: asyncHandler(async (req, res) => {
            sendData(res, await service.updateOption(req.params.categoryId, decodeParam(req.params.optionId), req.body));
        }),
        duplicateOption: asyncHandler(async (req, res) => {
            sendData(res, await service.duplicateOption(req.params.categoryId, decodeParam(req.params.optionId)), 201);
        }),
        deleteOption: asyncHandler(async (req, res) => {
            sendData(res, await service.deleteOption(req.params.categoryId, decodeParam(req.params.optionId)));
        }),
        reorderOptions: asyncHandler(async (req, res) => {
            sendData(res, await service.reorderOptions(req.params.categoryId, req.body?.ids));
        }),
    };
}

module.exports = { createWizardSetupController };
