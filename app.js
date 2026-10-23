const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { getConfig } = require('./config/env');
const { createErrorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { createApiRouter } = require('./routes');

function createApp({ config = getConfig() } = {}) {
    const app = express();
    if (config.trustProxy) {
        app.set('trust proxy', 1);
    }
    app.disable('x-powered-by');
    app.use(helmet({
        crossOriginResourcePolicy: { policy: 'cross-origin' },
    }));
    app.use(cors({
        origin(origin, callback) {
            if (!origin || config.corsOrigins.includes(origin)) {
                callback(null, true);
                return;
            }
            callback(null, false);
        },
        credentials: true,
    }));
    app.use(express.json({ limit: config.jsonBodyLimit }));
    const staticOptions = { index: false, dotfiles: 'deny', fallthrough: true };
    app.use('/uploads', express.static(config.uploadsDir, staticOptions));
    const nestedGallery = path.resolve(config.uploadsDir, 'gallery');
    if (path.resolve(config.galleryDir) !== nestedGallery) {
        app.use('/uploads/gallery', express.static(config.galleryDir, staticOptions));
    }
    app.use('/api', createApiRouter(config));
    app.use(notFoundHandler);
    app.use(createErrorHandler({ nodeEnv: config.nodeEnv }));
    return app;
}

module.exports = { createApp, projectRoot: path.join(__dirname) };
