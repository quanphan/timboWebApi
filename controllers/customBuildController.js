const { asyncHandler } = require('../middleware/errorHandler');
const { ApiError } = require('../utils/errors');
const { sendData } = require('../utils/http');
const { createInquiryService } = require('../services/customBuild/inquiryService');
const { createNotificationService } = require('../services/email/notificationService');
const { createOptionsService } = require('../services/customBuild/optionsService');
const { createValidationService } = require('../services/customBuild/validation');
const { createCustomBuildAdminService } = require('../services/customBuild/adminService');
const { deleteCustomBuildUploadFile } = require('../services/uploadService');

function createCustomBuildController(config = {}) {
    const optionsService = createOptionsService(require('../models/CustomBuildOption'));
    const validationService = createValidationService(optionsService);
    const inquiryService = createInquiryService({
        CustomBuildInquiry: require('../models/CustomBuildInquiry'),
        validationService,
        uploadsDir: config.uploadsDir || null,
        notifications: createNotificationService(config),
    });
    const adminService = createCustomBuildAdminService();

    return {
        listOptions: asyncHandler(async (req, res) => {
            sendData(res, await optionsService.listOptions());
        }),
        getCategory: asyncHandler(async (req, res) => {
            sendData(res, { category: await optionsService.getCategory(req.params.categoryId) });
        }),
        validate: asyncHandler(async (req, res) => {
            const configuration = await validationService.validateConfiguration(req.body);
            sendData(res, { valid: true, configuration });
        }),
        upload: asyncHandler(async (req, res) => {
            if (!req.uploadResult) {
                throw new ApiError(400, 'BAD_REQUEST', 'Choose an image file.');
            }
            sendData(res, req.uploadResult, 201);
        }),
        deleteUpload: asyncHandler(async (req, res) => {
            sendData(res, deleteCustomBuildUploadFile(config, req.query.path));
        }),
        createInquiry: asyncHandler(async (req, res) => {
            sendData(res, await inquiryService.createInquiry(req.body), 201);
        }),
        listInquiries: asyncHandler(async (req, res) => {
            const result = await adminService.list(req.query);
            sendData(res, result.inquiries, 200, result.meta);
        }),
        getInquiry: asyncHandler(async (req, res) => {
            sendData(res, await adminService.getById(req.params.id));
        }),
        updateInquiry: asyncHandler(async (req, res) => {
            sendData(res, await adminService.updateStatus(req.user, req.params.id, req.body));
        }),
        deleteInquiry: asyncHandler(async (req, res) => {
            sendData(res, await adminService.deleteInquiry(req.user, req.params.id));
        }),
    };
}

module.exports = { createCustomBuildController };
