const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const upload = require('../middleware/upload');
const { requireLogin, requireAdmin, requireWriteAdmin } = require('../middleware/authMiddleware');

router.get('/reports', requireLogin, reportController.viewReports);
router.get('/reports/export', requireLogin, reportController.exportReports);
router.post('/mutations/add', requireWriteAdmin, upload.single('proof_image'), reportController.addMutation);

// Also mount /mutations to same controller if linked from sidebar
router.get('/mutations', requireAdmin, reportController.viewMutations);
router.get('/matrix', requireAdmin, reportController.viewPaymentMatrix);

module.exports = router;
