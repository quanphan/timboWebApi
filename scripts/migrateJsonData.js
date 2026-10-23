/**
 * Import legacy JSON files into MongoDB without changing existing records.
 *
 * Backup first:
 *   mongodump --uri "$MONGO_URI" --db timbowebdata --out ./backup-timbowebdata
 *
 * Preview (no writes):
 *   npm run migrate:json
 *
 * Execute:
 *   npm run migrate:json:execute
 *
 * Verify:
 *   Compare the printed counts with the collections. Inserted documents have legacy.source = "json".
 *
 * Roll back only the inserted copies, after another backup:
 *   Delete documents whose legacy.source is "json". Do not drop collections and do not delete documents that lack that marker.
 *
 * users.json is never imported. It contains a plaintext password, not a hash.
 * This script does not run unless you pass --execute. Server startup does not call it.
 */
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config();

const dataDir = path.join(__dirname, '..', 'data');
const execute = process.argv.includes('--execute');

function readArray(filename) {
    const filePath = path.join(dataDir, filename);
    if (!fs.existsSync(filePath)) {
        return [];
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(parsed)) {
        throw new Error(`${filename} must contain a JSON array.`);
    }
    return parsed;
}

function report(name, stats) {
    console.log(JSON.stringify({ collection: name, ...stats, execute }));
}

async function migrateMessages(Message) {
    const stats = { scanned: 0, inserted: 0, skipped: 0, invalid: 0 };
    for (const row of readArray('message.json')) {
        stats.scanned += 1;
        const legacyId = row.id === undefined ? '' : String(row.id);
        if (!row.name || !row.email || !row.message || !legacyId) {
            stats.invalid += 1;
            continue;
        }
        const existing = await Message.findOne({ 'legacy.id': legacyId }).select('_id');
        if (existing) {
            stats.skipped += 1;
            continue;
        }
        if (execute) {
            await Message.create({
                name: String(row.name).trim(),
                email: String(row.email).trim().toLowerCase(),
                phone: row.phone ? String(row.phone) : undefined,
                subject: row.subject ? String(row.subject) : undefined,
                message: String(row.message),
                createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
                legacy: { source: 'json', id: legacyId },
            });
        }
        stats.inserted += 1;
    }
    report('messages', stats);
}

async function migratePosts(Post) {
    const stats = { scanned: 0, inserted: 0, skipped: 0, invalid: 0 };
    for (const row of readArray('posts.json')) {
        stats.scanned += 1;
        const legacyId = row.id === undefined ? '' : String(row.id);
        const title = typeof row.title === 'string' ? row.title.trim() : '';
        const content = typeof row.content === 'string' ? row.content.trim() : '';
        if (!legacyId || !title || !content) {
            stats.invalid += 1;
            continue;
        }
        const existing = await Post.findOne({ 'legacy.id': legacyId }).select('_id');
        if (existing) {
            stats.skipped += 1;
            continue;
        }
        if (execute) {
            await Post.create({
                title,
                content,
                published: row.published !== false,
                legacy: { source: 'json', id: legacyId },
            });
        }
        stats.inserted += 1;
    }
    report('posts', stats);
}

async function migrateProducts(Product) {
    const stats = { scanned: 0, inserted: 0, skipped: 0, invalid: 0 };
    for (const row of readArray('products.json')) {
        stats.scanned += 1;
        const legacyId = row.id === undefined ? '' : String(row.id);
        const name = typeof row.name === 'string' ? row.name.trim() : '';
        const code = row.code ? String(row.code).trim() : '';
        const price = Number(row.price);
        if (!legacyId || !name || !Number.isFinite(price)) {
            stats.invalid += 1;
            continue;
        }
        const existing = await Product.findOne({
            $or: [
                { 'legacy.id': legacyId },
                ...(code ? [{ code }] : []),
            ],
        }).select('_id');
        if (existing) {
            stats.skipped += 1;
            continue;
        }
        if (execute) {
            await Product.create({
                code: code || undefined,
                name,
                description: row.description,
                descriptionDetail: row.descriptionDetail,
                price,
                rating: row.rating,
                brand: row.brand,
                type: row.type,
                image: row.image,
                images: Array.isArray(row.images) ? row.images : [],
                qty: Number.isInteger(row.qty) ? row.qty : 0,
                legacy: { source: 'json', id: legacyId },
            });
        }
        stats.inserted += 1;
    }
    report('products', stats);
}

async function migrateReviews(Review, Product) {
    const stats = { scanned: 0, inserted: 0, skipped: 0, invalid: 0 };
    for (const row of readArray('reviews.json')) {
        stats.scanned += 1;
        if (!mongoose.isValidObjectId(row.productId)) {
            stats.invalid += 1;
            continue;
        }
        const product = await Product.findById(row.productId).select('_id');
        if (!product || !row.content || !row.name) {
            stats.invalid += 1;
            continue;
        }
        const legacyId = row.id === undefined ? '' : String(row.id);
        if (legacyId) {
            const existing = await Review.findOne({ content: row.content, productId: product._id, name: row.name }).select('_id');
            if (existing) {
                stats.skipped += 1;
                continue;
            }
        }
        if (execute) {
            await Review.create({
                productId: product._id,
                name: String(row.name),
                rating: Number(row.rating),
                content: String(row.content),
                recommend: Boolean(row.recommend),
                quality: row.quality,
                shipping: row.shipping,
                service: row.service,
                createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
            });
        }
        stats.inserted += 1;
    }
    report('reviews', stats);
}

async function main() {
    if (!process.env.MONGO_URI) {
        console.error('MONGO_URI is required.');
        process.exit(1);
    }
    await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.DB_NAME || 'timbowebdata' });
    const Message = require('../models/Message');
    const Post = require('../models/Post');
    const Product = require('../models/Product');
    const Review = require('../models/Review');

    const users = readArray('users.json');
    report('users', {
        scanned: users.length,
        inserted: 0,
        skipped: users.length,
        invalid: 0,
        reason: 'Refused. data/users.json stores a plaintext password and must not be imported.',
    });

    await migrateMessages(Message);
    await migratePosts(Post);
    await migrateProducts(Product);
    await migrateReviews(Review, Product);
    await mongoose.disconnect();
}

main().catch(async (error) => {
    console.error(error.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
