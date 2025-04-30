const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const MESSAGE_FILE = path.join(__dirname, '../data/message.json');

// Hàm đọc file JSON
const readMessages = () => {
    try {
        if (!fs.existsSync(MESSAGE_FILE)) {
            fs.writeFileSync(MESSAGE_FILE, '[]');
        }
        const data = fs.readFileSync(MESSAGE_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading message file:', error);
        return [];
    }
};

// Hàm ghi file JSON
const writeMessages = (messages) => {
    try {
        fs.writeFileSync(MESSAGE_FILE, JSON.stringify(messages, null, 2));
    } catch (error) {
        console.error('Error writing message file:', error);
    }
};

// POST /api/contact - lưu message mới
router.post('/', async (req, res) => {
    try {
        const { name, email, phone, subject, message } = req.body;

        if (!name || !email || !message) {
            return res.status(400).json({ error: 'Name, Email and Message are required.' });
        }

        const newMessage = {
            id: Date.now(), // simple ID
            name,
            email,
            phone,
            subject,
            message,
            createdAt: new Date().toISOString(),
        };

        const messages = readMessages();
        messages.push(newMessage);
        writeMessages(messages);

        return res.status(200).json({ message: 'Contact message saved successfully.' });
    } catch (error) {
        console.error('Error saving contact message:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});

// GET /api/contact - lấy danh sách message
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;
        const messages = readMessages();

        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedMessages = messages.slice(startIndex, endIndex);

        return res.status(200).json({
            total: messages.length,
            page,
            limit,
            data: paginatedMessages,
        });
    } catch (error) {
        console.error('Error reading messages:', error);
        return res.status(500).json({ error: 'Failed to fetch messages.' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const messages = readMessages();
        const updatedMessages = messages.filter((msg) => msg.id !== parseInt(id));

        if (messages.length === updatedMessages.length) {
            return res.status(404).json({ error: 'Message not found.' });
        }

        writeMessages(updatedMessages);
        return res.status(200).json({ message: 'Message deleted successfully.' });
    } catch (error) {
        console.error('Error deleting message:', error);
        return res.status(500).json({ error: 'Failed to delete message.' });
    }
});

module.exports = router;
