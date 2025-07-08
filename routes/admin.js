const express = require('express');
const router = express.Router();
const { getResellerList, createReseller,updateReseller,getMonthlyInspectionStatsAnalytics,getTopResellersAnalytics,getResellerAcquisitionTrendsAnalytics,getResellerCountsByStatusAnalytics} = require('../controller/adminController');
const authMiddleware = require('../middleware/authMiddleware'); // adjust path if needed

router.get('/list-reseller',authMiddleware, getResellerList);

router.post('/create-reseller',authMiddleware, createReseller);
router.post('/update-reseller/:id',authMiddleware, updateReseller);
router.get('/get-monthly-inspection-stats',authMiddleware, getMonthlyInspectionStatsAnalytics);
router.get('/get-top-resellers-stats',authMiddleware, getTopResellersAnalytics);
router.get('/get-reseller-acquisition-trends-stats',authMiddleware, getResellerAcquisitionTrendsAnalytics);
router.get('/get-reseller-count-by-status-stats',authMiddleware, getResellerCountsByStatusAnalytics);



module.exports = router;