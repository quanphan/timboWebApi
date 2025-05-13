const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const authenticateToken = require("../middleware/auth");

// POST: new message
router.post('/', async (req, res) => {
    try {
        const { name, email, phone, subject, message } = req.body;

        if (!name || !email || !message) {
            return res.status(400).json({ error: 'Name, Email and Message are required.' });
        }

        const newMessage = new Message({ name, email, phone, subject, message });
        await newMessage.save();

        res.status(200).json({ message: 'Contact message saved successfully.' });
    } catch (error) {
        console.error('Error saving message:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// GET: get list
router.get('/', authenticateToken,async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;
        const skip = (page - 1) * limit;

        const total = await Message.countDocuments();
        const data = await Message.find().sort({ createdAt: -1 }).skip(skip).limit(limit);

        res.status(200).json({ total, page, limit, data });
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ error: 'Failed to fetch messages.' });
    }
});

// DELETE: by id
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const result = await Message.findByIdAndDelete(req.params.id);
        if (!result) return res.status(404).json({ error: 'Message not found.' });

        res.status(200).json({ message: 'Message deleted successfully.' });
    } catch (error) {
        console.error('Error deleting message:', error);
        res.status(500).json({ error: 'Failed to delete message.' });
    }
});

module.exports = router;
