const express = require('express');
const router = express.Router();
const {
  createPaymentOrder,
  verifyPayment,
  handleWebhook,
  getPaymentMethods
} = require('../controllers/paymentController');
const { validateAddMoney } = require('../middleware/validation');
const { authenticateToken, requireVerified } = require('../middleware/auth');

// Public routes
router.post('/webhook', handleWebhook);

// Protected routes
router.use(authenticateToken, requireVerified);

router.get('/methods', getPaymentMethods);
router.post('/create-order', validateAddMoney, createPaymentOrder);
router.post('/verify', verifyPayment);

module.exports = router;