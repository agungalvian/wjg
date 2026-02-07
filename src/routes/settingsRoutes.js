const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { requireAdmin, requireWriteAdmin } = require('../middleware/authMiddleware');

router.get('/', requireAdmin, settingsController.getSettings);
router.post('/update', requireWriteAdmin, settingsController.updateSettings);

module.exports = router;
