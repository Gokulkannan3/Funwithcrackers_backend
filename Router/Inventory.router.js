const express = require('express');
const router = express.Router();
const { addProduct,getProducts } = require('../Controller/Inventory.controller');
const multer = require('multer');

const upload = multer({
  dest: './uploads/',
});

router.post('/', upload.single('image'), addProduct);
router.get('/', getProducts);

module.exports = router;