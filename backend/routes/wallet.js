const express = require('express');
const router = express.Router();
const {
  getWalletBalance,
  transferMoney,
  getTransactionHistory,
  getWalletStats,
  searchUsers
} = require('../controllers/walletController');
const {
  validateTransfer,
  validatePagination
} = require('../middleware/validation');
const { authenticateToken, requireVerified } = require('../middleware/auth');

// All wallet routes require authentication and verification
router.use(authenticateToken, requireVerified);

// Wallet routes
router.get('/balance', getWalletBalance);
router.get('/stats', getWalletStats);
router.post('/transfer', validateTransfer, transferMoney);
router.get('/transactions', validatePagination, getTransactionHistory);
router.get('/search-users', searchUsers);

module.exports = router;