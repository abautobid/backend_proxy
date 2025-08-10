const express = require('express');
const router = express.Router();
const { getCarBrandsModels,getAllCars,createBuyCarRequest} = require('../controller/buyCarController');

router.get('/car-brands-models', getCarBrandsModels);
router.get('/get-all-cars', getAllCars);
router.post('/create-request', createBuyCarRequest);



module.exports = router;