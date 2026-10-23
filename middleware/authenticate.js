const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { ApiError } = require('../utils/errors');
const { hasPermission } = require('../utils/permissions');
const { isAdmin } = require('../utils/roles');

function createAuthenticate(config) {
    return async function authenticate(req, res, next) {
        try {
            const header = req.headers.authorization || '';
            const token = header.startsWith('Bearer ') ? header.slice(7) : '';
            if (!token) {
                throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.');
            }
            let payload;
            try {
                payload = jwt.verify(token, config.jwtSecret);
            } catch (error) {
                throw new ApiError(401, 'UNAUTHORIZED', 'Access token is invalid or expired.');
            }
            const user = await User.findById(payload.sub);
            if (!user) {
                throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.');
            }
            if (user.status === 'locked') {
                throw new ApiError(403, 'ACCOUNT_LOCKED', 'This account is locked.');
            }
            req.user = user;
            next();
        } catch (error) {
            next(error);
        }
    };
}

function requireAdmin(req, res, next) {
    if (!isAdmin(req.user)) {
        next(new ApiError(403, 'FORBIDDEN', 'Admin access is required.'));
        return;
    }
    next();
}

function requirePermission(permission) {
    return function checkPermission(req, res, next) {
        if (!hasPermission(req.user, permission)) {
            next(new ApiError(403, 'FORBIDDEN', 'You do not have permission to perform this action.'));
            return;
        }
        next();
    };
}

module.exports = { createAuthenticate, requireAdmin, requirePermission };
