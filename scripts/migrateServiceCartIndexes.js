#!/usr/bin/env node
/**
 * Aligns service_carts indexes for guest TTL + user carts.
 * Does not delete open carts.
 *
 * Dry run (default): node scripts/migrateServiceCartIndexes.js
 * Apply:             node scripts/migrateServiceCartIndexes.js --execute
 */
const mongoose = require('mongoose');
const { getConfig } = require('../config/env');

async function main() {
    const execute = process.argv.includes('--execute');
    const config = getConfig();
    await mongoose.connect(config.mongoUri, { dbName: config.dbName });
    const collection = mongoose.connection.collection('service_carts');
    const indexes = await collection.indexes();
    const guestFilter = { $or: [{ ownerType: { $exists: false } }, { ownerType: null }] };
    const guestCount = await collection.countDocuments(guestFilter);
    const summary = {
        execute,
        existingIndexes: indexes.map((item) => item.name),
        documentsMissingOwnerType: guestCount,
    };
    if (!execute) {
        console.log(JSON.stringify({ ...summary, dryRun: true }, null, 2));
        await mongoose.disconnect();
        return;
    }
    if (guestCount) {
        await collection.updateMany(guestFilter, { $set: { ownerType: 'guest' } });
    }
    const dropNames = indexes
        .map((item) => item.name)
        .filter((name) => name !== '_id_' && (
            name.includes('sessionId')
            || name.includes('expiresAt')
            || name.includes('userId')
        ));
    for (const name of dropNames) {
        await collection.dropIndex(name);
    }
    const ServiceCart = require('../models/ServiceCart');
    await ServiceCart.syncIndexes();
    console.log(JSON.stringify({
        ...summary,
        droppedIndexes: dropNames,
        indexesAfter: (await collection.indexes()).map((item) => item.name),
    }, null, 2));
    await mongoose.disconnect();
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
