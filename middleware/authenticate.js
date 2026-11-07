const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { ApiError } = require('../utils/errors');
const { hasPermission } = require('../utils/permissions');
const { isAdmin } = require('../utils/roles');

async function loadUserFromBearer(config, req, { required }) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) {
        if (required) {
            throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.');
        }
        return null;
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
    return user;
}

function createAuthenticate(config) {
    return async function authenticate(req, res, next) {
        try {
            req.user = await loadUserFromBearer(config, req, { required: true });
            next();
        } catch (error) {
            next(error);
        }
    };
}

function createOptionalAuthenticate(config) {
    return async function optionalAuthenticate(req, res, next) {
        try {
            const user = await loadUserFromBearer(config, req, { required: false });
            if (user) req.user = user;
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

module.exports = { createAuthenticate, createOptionalAuthenticate, requireAdmin, requirePermission };
