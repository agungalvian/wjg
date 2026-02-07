const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const upload = require('../middleware/upload');
const { requireLogin, requireAdmin, requireWriteAdmin } = require('../middleware/authMiddleware');

// Resident Routes
router.get('/my-payments', requireLogin, paymentController.myPayments);
router.get('/my-status', requireLogin, paymentController.myStatus);
router.post('/submit', requireLogin, upload.single('proof_image'), paymentController.submitPayment);

// Admin Routes
router.get('/payments', requireAdmin, paymentController.listPayments);
router.post('/payments/update', requireWriteAdmin, paymentController.updateStatus);

module.exports = router;
