const express = require('express');
const router = express.Router();
const { getInspection, licensePlateLookup, getSummary, remainingCredits, profileInfo } = require('../controller/fleetManagerController');

// Example API routes
router.post('/inspect-license-plate', licensePlateLookup);
router.get('/inspection-list', getInspection);
router.get('/summary', getSummary);
router.get('/remainingCredits', remainingCredits);
router.get('/profileInfo/:userId', profileInfo);

module.exports = router;