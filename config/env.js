const path = require('path');

const LOCAL_DEV_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
];

function getConfig(env = process.env) {
    const nodeEnv = env.NODE_ENV || 'development';
    if (!['development', 'test', 'production'].includes(nodeEnv)) {
        throw new Error('NODE_ENV must be development, test, or production.');
    }

    const rawPort = env.PORT === undefined || env.PORT === '' ? '5050' : String(env.PORT);
    if (!/^\d+$/.test(rawPort)) {
        throw new Error('PORT must be an integer between 1 and 65535.');
    }
    const port = Number(rawPort);
    if (port < 1 || port > 65535) {
        throw new Error('PORT must be an integer between 1 and 65535.');
    }

    const corsOrigins = String(env.CORS_ORIGIN ?? '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

    if (corsOrigins.includes('*')) {
        throw new Error('CORS_ORIGIN must list explicit origins.');
    }
    const warnings = [];
    if (nodeEnv === 'production' && corsOrigins.length === 0) {
        warnings.push('CORS_ORIGIN must list at least one origin in production. Browser clients stay blocked until it is set.');
    }

    const jwtSecret = env.JWT_SECRET || '';
    const refreshSecret = env.REFRESH_SECRET || '';
    if (nodeEnv !== 'test') {
        if (jwtSecret.length < 16) {
            throw new Error('JWT_SECRET must be set to a long random value.');
        }
        if (refreshSecret.length < 16) {
            throw new Error('REFRESH_SECRET must be set to a long random value.');
        }
        if (!env.MONGO_URI) {
            throw new Error('MONGO_URI is required.');
        }
    }

    const uploadsDir = env.UPLOADS_DIR
        ? path.resolve(env.UPLOADS_DIR)
        : path.join(__dirname, '..', 'uploads');
    const galleryDir = env.GALLERY_UPLOAD_DIR
        ? path.resolve(env.GALLERY_UPLOAD_DIR)
        : path.join(uploadsDir, 'gallery');

    return {
        nodeEnv,
        port,
        mongoUri: env.MONGO_URI || '',
        dbName: env.DB_NAME || 'timbowebdata',
        jwtSecret: jwtSecret || 'test-jwt-secret-value',
        refreshSecret: refreshSecret || 'test-refresh-secret-value',
        accessTtl: env.ACCESS_TOKEN_TTL || '15m',
        refreshTtlMs: Number(env.REFRESH_TOKEN_TTL_MS || 7 * 24 * 60 * 60 * 1000),
        corsOrigins: corsOrigins.length > 0
            ? corsOrigins
            : (nodeEnv === 'production' ? [] : [...LOCAL_DEV_ORIGINS]),
        trustProxy: env.TRUST_PROXY === undefined || env.TRUST_PROXY === ''
            ? Boolean(env.RAILWAY_ENVIRONMENT || env.RAILWAY_PROJECT_ID)
            : env.TRUST_PROXY === 'true' || env.TRUST_PROXY === '1',
        warnings,
        jsonBodyLimit: '100kb',
        uploadsDir,
        galleryDir,
        galleryImageMaxBytes: Number(env.GALLERY_IMAGE_MAX_BYTES || 8 * 1024 * 1024),
        galleryVideoMaxBytes: Number(env.GALLERY_VIDEO_MAX_BYTES || 50 * 1024 * 1024),
        rateLimitEnabled: nodeEnv !== 'test',
        googleClientId: env.GOOGLE_CLIENT_ID || '',
    };
}

module.exports = { getConfig };
