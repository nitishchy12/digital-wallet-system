const express = require('express');
const router = express.Router();
const {
  createPaymentOrder,
  verifyPayment,
  handleWebhook,
  getPaymentMethods
} = require('../controllers/paymentController');
const { validateAddMoney, validatePaymentVerify } = require('../middleware/validation');
const { authenticateToken, requireVerified } = require('../middleware/auth');

router.post('/webhook', handleWebhook);

router.use(authenticateToken, requireVerified);

router.get('/methods', getPaymentMethods);
router.post('/create-order', validateAddMoney, createPaymentOrder);
router.post('/verify', validatePaymentVerify, verifyPayment);

module.exports = router;
