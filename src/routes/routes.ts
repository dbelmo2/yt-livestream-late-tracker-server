import express from 'express';

const router = express.Router();

// Test route

router.get('/livestreams', (req, res) => {
    res.json({ message: 'Livestreams route is working!' });
});

router.get('/stats', (req, res) => {
    res.json({ message: 'Stats route is working!' });
});

export default router;