const dotenv = require('dotenv');

dotenv.config();

const { createApp } = require('./app');
const { connectDb } = require('./config/db');
const { getConfig } = require('./config/env');

let config;
try {
    config = getConfig();
} catch (error) {
    console.error(JSON.stringify({ level: 'error', message: error.message }));
    process.exit(1);
}

connectDb(config)
    .then(() => {
        const app = createApp({ config });
        const server = app.listen(config.port, '0.0.0.0', () => {
            console.log(JSON.stringify({
                level: 'info',
                message: 'API listening',
                port: server.address().port,
            }));
        });
    })
    .catch((error) => {
        console.error(JSON.stringify({
            level: 'error',
            message: 'Database connection failed',
            name: error.name,
        }));
        process.exit(1);
    });
