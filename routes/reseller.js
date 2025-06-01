const express = require('express');
const router = express.Router();
const { getInspection, createInspect, getSummary, remainingCredits, profileInfo,reviewInspection } = require('../controller/resellerController');
const authMiddleware = require('../middleware/authMiddleware'); // adjust path if needed

// Example API routes
router.get('/inspection-list', getInspection);
router.get('/summary',authMiddleware, getSummary);
router.get('/remainingCredits', remainingCredits);
router.get('/profile', authMiddleware, profileInfo);
router.post('/create-inspect',authMiddleware, createInspect);
router.post('/review-inspect',authMiddleware, reviewInspection);

module.exports = router;