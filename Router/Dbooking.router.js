const express = require('express');
const router = express.Router();
const DBookingController = require('../Controller/Dbooking.controller');

router.get('/product', DBookingController.getProducts);
router.patch('/product/:tableName/:id/book', DBookingController.bookProduct);
router.post('/dbooking', DBookingController.createDBooking);
router.get('/dbooking/invoice/:order_id', DBookingController.getDBookingInvoice);

module.exports = router;