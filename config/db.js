const mongoose = require('mongoose');

async function connectDb(config) {
    mongoose.set('strictQuery', true);
    await mongoose.connect(config.mongoUri, {
        dbName: config.dbName,
        serverSelectionTimeoutMS: 10000,
    });
    return mongoose.connection;
}

module.exports = { connectDb };
