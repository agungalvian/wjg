const express = require('express');
const router = express.Router();
const announcementController = require('../controllers/announcementController');
const upload = require('../middleware/upload');
const { requireAdmin, requireWriteAdmin } = require('../middleware/authMiddleware');

router.get('/', announcementController.listAnnouncements);
router.post('/add', requireWriteAdmin, upload.single('image'), announcementController.createAnnouncement);
router.get('/delete/:id', requireWriteAdmin, announcementController.deleteAnnouncement);

module.exports = router;
