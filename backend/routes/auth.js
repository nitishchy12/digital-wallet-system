const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const {
  validateRegistration,
  validateLogin,
  validateOTP
} = require('../middleware/validation');

const { authenticateToken } = require('../middleware/auth');

// Public routes
router.post('/register', validateRegistration, authController.register);
router.post('/verify-otp', validateOTP, authController.verifyOTP);
router.post('/resend-otp', authController.resendOTP);
router.post('/login', validateLogin, authController.login);

// Protected routes
router.post('/logout', authenticateToken, authController.logout);

module.exports = router;
