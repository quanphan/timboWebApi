const dotenv = require('dotenv');

dotenv.config();

const { connectDb } = require('../config/db');
const { getConfig } = require('../config/env');
const { bootstrapSuperAdmin } = require('../services/bootstrapSuperAdmin');

async function main() {
    const password = process.env.ADMIN_INITIAL_PASSWORD;
    if (!password) {
        console.error(JSON.stringify({
            level: 'error',
            message: 'ADMIN_INITIAL_PASSWORD is required.',
        }));
        process.exit(1);
    }

    const config = getConfig();
    await connectDb(config);
    const result = await bootstrapSuperAdmin({
        password,
        email: process.env.ADMIN_INITIAL_EMAIL,
    });
    console.log(JSON.stringify({
        level: 'info',
        message: result.created
            ? 'Superadmin account created.'
            : result.promoted
                ? 'Existing phanquan account promoted to superadmin. Password was left unchanged.'
                : 'Superadmin account already exists. Password was left unchanged.',
        username: result.username,
        created: result.created,
    }));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(JSON.stringify({
            level: 'error',
            message: error.message,
        }));
        process.exit(1);
    });
