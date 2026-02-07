const express = require('express');
const router = express.Router();
const residentController = require('../controllers/residentController');
const { requireAdmin, requireWriteAdmin } = require('../middleware/authMiddleware');

router.get('/', requireAdmin, residentController.listResidents);
router.post('/add', requireWriteAdmin, residentController.addResident);
router.get('/edit/:id', requireWriteAdmin, residentController.editResidentPage);
router.post('/edit/:id', requireWriteAdmin, residentController.updateResident);
router.get('/delete/:id', requireWriteAdmin, residentController.deleteResident);

module.exports = router;
