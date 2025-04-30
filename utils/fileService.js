const fs = require('fs');
const path = require('path');

function readJsonFile(relativePath) {
    try {
        const fullPath = path.join(__dirname, '..', relativePath);
        const fileData = fs.readFileSync(fullPath, 'utf-8');
        return JSON.parse(fileData);
    } catch (err) {
        console.error('Error reading JSON file:', err);
        return [];
    }
}

module.exports = { readJsonFile };
