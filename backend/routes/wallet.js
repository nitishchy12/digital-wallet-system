const express = require('express');
const router = express.Router();
const {
  getWalletBalance,
  transferMoney,
  getTransactionHistory,
  getWalletStats,
  getAnalytics,
  searchUsers
} = require('../controllers/walletController');
const { validateTransfer, validatePagination, validateDateRangeFilters } = require('../middleware/validation');
const { authenticateToken, requireVerified } = require('../middleware/auth');

router.use(authenticateToken, requireVerified);

router.get('/balance', getWalletBalance);
router.get('/stats', getWalletStats);
router.get('/analytics', getAnalytics);
router.post('/transfer', validateTransfer, transferMoney);
router.get('/transactions', validatePagination, validateDateRangeFilters, getTransactionHistory);
router.get('/search-users', searchUsers);

module.exports = router;
