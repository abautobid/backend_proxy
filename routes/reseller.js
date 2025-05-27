const express = require('express');
const router = express.Router();
const { getInspection, createInspect, getSummary, remainingCredits, profileInfo } = require('../controller/resellerController');
const authMiddleware = require('../middleware/authMiddleware'); // adjust path if needed

// Example API routes
router.get('/inspection-list', getInspection);
router.get('/summary',authMiddleware, getSummary);
router.get('/remainingCredits', remainingCredits);
router.get('/profileInfo/:userId', profileInfo);
router.post('/create-inspect',authMiddleware, createInspect);

module.exports = router;