const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.get('/login', authController.loginPage);
router.post('/login', authController.login);
router.get('/logout', authController.logout);
router.get('/profile', authController.profilePage);
router.post('/profile/change-password', authController.changePassword);

module.exports = router;
