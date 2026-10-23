const bcrypt = require('bcrypt');
const axios = require('axios');
const User = require('../models/User');
const { ApiError } = require('../utils/errors');
const { publicUser } = require('../utils/presenters');
const { escapeRegex } = require('../utils/text');
const { createRefreshToken, hashToken, signAccessToken } = require('../utils/tokens');
const {
    validateLogin,
    validateRefresh,
    validateRegistration,
} = require('../validators/authValidators');

const REFRESH_LIMIT = 5;

function findByEmail(email) {
    return User.findOne({ email: new RegExp(`^${escapeRegex(email)}$`, 'i') });
}

function assertActive(user) {
    if (user && user.status === 'locked') {
        throw new ApiError(403, 'ACCOUNT_LOCKED', 'This account is locked.');
    }
}

async function issueTokens(user, config) {
    const accessToken = signAccessToken(user, config);
    const refreshToken = createRefreshToken();
    const expiresAt = new Date(Date.now() + config.refreshTtlMs);
    const nextTokens = (user.refreshTokens || [])
        .filter((item) => item.expiresAt > new Date())
        .slice(-(REFRESH_LIMIT - 1));
    nextTokens.push({ tokenHash: hashToken(refreshToken), expiresAt });
    user.refreshTokens = nextTokens;
    await user.save();
    return {
        accessToken,
        refreshToken,
        expiresIn: config.accessTtl,
    };
}

function createAuthService(config) {
    return {
        async register(body) {
            const input = validateRegistration(body);
            const existing = await findByEmail(input.email);
            if (existing) {
                throw new ApiError(409, 'CONFLICT', 'Email is already registered.');
            }
            const user = await User.create({
                name: input.name,
                email: input.email,
                password: await bcrypt.hash(input.password, 10),
                phone: input.phone || undefined,
                country: input.country || undefined,
                shippingAddress: input.shippingAddress || undefined,
                marketingConsent: input.marketingConsent,
                emailVerified: false,
                status: 'active',
                role: 'customer',
                admin: '0',
            });
            const tokens = await issueTokens(user, config);
            return { user: publicUser(user), ...tokens };
        },

        async login(body) {
            const input = validateLogin(body);
            const user = input.username
                ? await User.findOne({ username: input.username })
                : await findByEmail(input.email);
            const passwordOk = user && user.password
                ? await bcrypt.compare(input.password, user.password)
                : false;
            if (!user || !passwordOk) {
                throw new ApiError(401, 'UNAUTHORIZED', 'Invalid email or password.');
            }
            assertActive(user);
            const tokens = await issueTokens(user, config);
            return { user: publicUser(user), ...tokens };
        },

        async refresh(body) {
            const { refreshToken } = validateRefresh(body);
            const tokenHash = hashToken(refreshToken);
            const user = await User.findOne({ 'refreshTokens.tokenHash': tokenHash });
            if (!user) {
                throw new ApiError(401, 'UNAUTHORIZED', 'Refresh token is invalid.');
            }
            const current = (user.refreshTokens || []).find((item) => item.tokenHash === tokenHash);
            user.refreshTokens = (user.refreshTokens || []).filter((item) => item.tokenHash !== tokenHash);
            if (!current || current.expiresAt <= new Date()) {
                await user.save();
                throw new ApiError(401, 'UNAUTHORIZED', 'Refresh token is invalid.');
            }
            if (user.status === 'locked') {
                user.refreshTokens = [];
                await user.save();
                throw new ApiError(403, 'ACCOUNT_LOCKED', 'This account is locked.');
            }
            const tokens = await issueTokens(user, config);
            return { user: publicUser(user), ...tokens };
        },

        async logout(body) {
            const { refreshToken } = validateRefresh(body);
            const tokenHash = hashToken(refreshToken);
            const user = await User.findOne({ 'refreshTokens.tokenHash': tokenHash });
            if (user) {
                user.refreshTokens = (user.refreshTokens || []).filter((item) => item.tokenHash !== tokenHash);
                await user.save();
            }
            return { revoked: true };
        },

        async googleLogin(body) {
            if (!config.googleClientId) {
                throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Google login is not configured.');
            }
            if (!body || typeof body.credential !== 'string' || !body.credential) {
                throw new ApiError(400, 'BAD_REQUEST', 'Google credential is required.');
            }
            let profile;
            try {
                const response = await axios.get('https://oauth2.googleapis.com/tokeninfo', {
                    params: { id_token: body.credential },
                    timeout: 5000,
                });
                profile = response.data;
            } catch (error) {
                throw new ApiError(401, 'UNAUTHORIZED', 'Google credential is invalid.');
            }
            const email = String(profile.email || '').toLowerCase();
            const audiences = Array.isArray(profile.aud) ? profile.aud : [profile.aud];
            const verified = profile.email_verified === true || profile.email_verified === 'true';
            if (!email || !profile.sub || !verified || !audiences.includes(config.googleClientId)) {
                throw new ApiError(401, 'UNAUTHORIZED', 'Google credential is invalid.');
            }
            let user = await User.findOne({ googleId: profile.sub });
            if (!user) {
                user = await findByEmail(email);
            }
            if (!user) {
                user = await User.create({
                    email,
                    name: profile.name || email,
                    googleId: profile.sub,
                    emailVerified: true,
                    status: 'active',
                    role: 'customer',
                    admin: '0',
                });
            } else if (!user.googleId) {
                user.googleId = profile.sub;
                user.emailVerified = true;
                await user.save();
            }
            assertActive(user);
            const tokens = await issueTokens(user, config);
            return { user: publicUser(user), ...tokens };
        },
    };
}

module.exports = { createAuthService };
