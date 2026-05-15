const express = require('express');
const router = express.Router();
const {
  getWalletBalance,
  transferMoney,
  getTransactionHistory,
  getWalletStats,
  getAnalytics,
  searchUsers,
  exportTransactions
} = require('../controllers/walletController');
const { validateTransfer, validatePagination, validateDateRangeFilters } = require('../middleware/validation');
const { authenticateToken, requireVerified } = require('../middleware/auth');
const { transferLimiter } = require('../middleware/rateLimiter');

router.use(authenticateToken, requireVerified);

router.get('/balance', getWalletBalance);
router.get('/stats', getWalletStats);
router.get('/analytics', getAnalytics);
router.post('/transfer', transferLimiter, validateTransfer, transferMoney);
router.get('/transactions/export', validateDateRangeFilters, exportTransactions);
router.get('/transactions', validatePagination, validateDateRangeFilters, getTransactionHistory);
router.get('/search-users', searchUsers);

module.exports = router;
