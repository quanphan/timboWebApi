const { asyncHandler } = require('../middleware/errorHandler');
const { sendData } = require('../utils/http');

function createAuthController(authService, accountService) {
    return {
        register: asyncHandler(async (req, res) => {
            sendData(res, await authService.register(req.body), 201);
        }),
        login: asyncHandler(async (req, res) => {
            sendData(res, await authService.login(req.body));
        }),
        refresh: asyncHandler(async (req, res) => {
            sendData(res, await authService.refresh(req.body));
        }),
        logout: asyncHandler(async (req, res) => {
            sendData(res, await authService.logout(req.body));
        }),
        google: asyncHandler(async (req, res) => {
            sendData(res, await authService.googleLogin(req.body));
        }),
        me: asyncHandler(async (req, res) => {
            sendData(res, accountService.profile(req.user));
        }),
        updateMe: asyncHandler(async (req, res) => {
            sendData(res, await accountService.updateProfile(req.user, req.body));
        }),
        changePassword: asyncHandler(async (req, res) => {
            sendData(res, await accountService.changePassword(req.user, req.body));
        }),
        listUsers: asyncHandler(async (req, res) => {
            const result = await accountService.listUsers(req.query);
            sendData(res, result.users, 200, result.meta);
        }),
        getUser: asyncHandler(async (req, res) => {
            sendData(res, await accountService.getUser(req.params.id));
        }),
        createAdmin: asyncHandler(async (req, res) => {
            sendData(res, await accountService.createAdmin(req.body), 201);
        }),
        updateUserRole: asyncHandler(async (req, res) => {
            sendData(res, await accountService.updateRole(req.user, req.params.id, req.body));
        }),
        updateUserStatus: asyncHandler(async (req, res) => {
            sendData(res, await accountService.updateStatus(req.user, req.params.id, req.body));
        }),
        updateUser: asyncHandler(async (req, res) => {
            sendData(res, await accountService.updateUser(req.user, req.params.id, req.body));
        }),
        deleteUser: asyncHandler(async (req, res) => {
            sendData(res, await accountService.deleteUser(req.user, req.params.id));
        }),
    };
}

module.exports = { createAuthController };
