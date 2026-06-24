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
  validateRefreshToken,
  validateKYCSubmit,
  validateNotificationPreferences
} = require('../middleware/validation');

const { authenticateToken } = require('../middleware/auth');
const { loginLimiter, registerLimiter } = require('../middleware/rateLimiter');

router.post('/register', registerLimiter, validateRegistration, authController.register);
router.post('/verify-otp', validateVerifyOTP, authController.verifyOTP);
router.post('/resend-otp', validateResendOTP, authController.resendOTP);
router.post('/login', loginLimiter, validateLogin, authController.login);
router.post('/refresh-token', validateRefreshToken, authController.refreshToken);
router.post('/forgot-password', validateForgotPassword, authController.forgotPassword);
router.post('/reset-password', validateResetPassword, authController.resetPassword);

router.post('/logout', authenticateToken, authController.logout);

router.get('/kyc/status', authenticateToken, authController.getKYCStatus);
router.post('/kyc/submit', authenticateToken, validateKYCSubmit, authController.submitKYC);

router.get('/notification-preferences', authenticateToken, authController.getNotificationPreferences);
router.put('/notification-preferences', authenticateToken, validateNotificationPreferences, authController.updateNotificationPreferences);

module.exports = router;
