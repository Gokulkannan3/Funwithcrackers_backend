const express = require('express');
const router = express.Router();
const locationController = require('../Controller/Location.controller');

// Routes for states
router.get('/states', locationController.getStates);
router.post('/states', locationController.addState);
router.delete('/states/:stateName', locationController.deleteState);

// Routes for districts
router.get('/states/:stateName/districts', locationController.getDistricts);
router.post('/states/:stateName/districts', locationController.addDistrict);
router.delete('/states/:stateName/districts/:districtId', locationController.deleteDistrict);

// Route for minimum rate
router.put('/states/:stateName/rate', locationController.updateRate);

module.exports = router;    