const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const {
  validateRegistration,
  validateLogin,
  validateVerifyOTP,
  validateResendOTP,
  validateForgotPassword,
  validateResetPassword,
  validateRefreshToken
} = require('../middleware/validation');

const { authenticateToken } = require('../middleware/auth');

router.post('/register', validateRegistration, authController.register);
router.post('/verify-otp', validateVerifyOTP, authController.verifyOTP);
router.post('/resend-otp', validateResendOTP, authController.resendOTP);
router.post('/login', validateLogin, authController.login);
router.post('/refresh-token', validateRefreshToken, authController.refreshToken);
router.post('/forgot-password', validateForgotPassword, authController.forgotPassword);
router.post('/reset-password', validateResetPassword, authController.resetPassword);

router.post('/logout', authenticateToken, authController.logout);

module.exports = router;
