const dotenv = require('dotenv');
const mongoose = require('mongoose');
const { seedDemoOptions } = require('../services/customBuild/seedDemoOptions');

dotenv.config();

async function main() {
    if (!process.env.MONGO_URI) {
        console.error('MONGO_URI is required.');
        process.exit(1);
    }
    await mongoose.connect(process.env.MONGO_URI, {
        dbName: process.env.DB_NAME || 'timbowebdata',
    });
    const result = await seedDemoOptions();
    console.log(JSON.stringify({
        database: process.env.DB_NAME || 'timbowebdata',
        collection: 'custom_build_options',
        inserted: result.inserted,
        skipped: result.skipped,
    }));
    await mongoose.disconnect();
}

main().catch(async (error) => {
    console.error(error.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
