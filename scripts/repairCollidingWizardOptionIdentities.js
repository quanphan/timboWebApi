const dotenv = require('dotenv');
const mongoose = require('mongoose');
const { createWizardSetupService } = require('../services/customBuild/wizardSetupService');

dotenv.config();

async function main() {
    if (!process.env.MONGO_URI) {
        console.error('MONGO_URI is required.');
        process.exit(1);
    }
    const dbName = process.env.DB_NAME || 'timbowebdata';
    await mongoose.connect(process.env.MONGO_URI, { dbName });
    const report = await createWizardSetupService().repairCollidingIdentities();
    console.log(JSON.stringify({ database: dbName, repaired: report }, null, 2));
    await mongoose.disconnect();
}

main().catch(async (error) => {
    console.error(error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
