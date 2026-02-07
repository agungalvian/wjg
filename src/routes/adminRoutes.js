const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { requireAdmin, requireWriteAdmin } = require('../middleware/authMiddleware');

router.get('/', requireAdmin, adminController.listAdmins);
router.post('/add', requireWriteAdmin, adminController.addAdmin);
router.post('/update', requireWriteAdmin, adminController.updateAdmin);
router.get('/delete/:id', requireWriteAdmin, adminController.deleteAdmin);

module.exports = router;
