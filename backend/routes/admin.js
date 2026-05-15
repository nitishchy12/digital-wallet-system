const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { validatePagination } = require('../middleware/validation');

router.use(authenticateToken, requireAdmin);

router.get('/dashboard', async (req, res, next) => {
  try {
    const [
      totalUsers,
      verifiedUsers,
      totalTransactions,
      successfulTransactions,
      totalWalletBalance,
      recentTransactions
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isVerified: true }),
      Transaction.countDocuments(),
      Transaction.countDocuments({ status: 'SUCCESS' }),
      Wallet.aggregate([{ $group: { _id: null, total: { $sum: '$balance' } } }]),
      Transaction.find()
        .populate('senderId', 'name email')
        .populate('receiverId', 'name email')
        .sort({ createdAt: -1 })
        .limit(10)
    ]);

    return res.status(200).json({
      success: true,
      data: {
        stats: {
          totalUsers,
          verifiedUsers,
          totalTransactions,
          successfulTransactions,
          totalWalletBalance: totalWalletBalance[0]?.total || 0
        },
        recentTransactions
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/users', validatePagination, async (req, res, next) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [users, totalUsers] = await Promise.all([
      User.find()
        .select('-password -refreshToken -verificationOTP')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments()
    ]);

    const totalPages = Math.ceil(totalUsers / limit);

    return res.status(200).json({
      success: true,
      data: {
        users,
        pagination: {
          currentPage: page,
          totalPages,
          totalUsers,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/transactions', validatePagination, async (req, res, next) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [transactions, totalTransactions] = await Promise.all([
      Transaction.find()
        .populate('senderId', 'name email')
        .populate('receiverId', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Transaction.countDocuments()
    ]);

    const totalPages = Math.ceil(totalTransactions / limit);

    return res.status(200).json({
      success: true,
      data: {
        transactions,
        pagination: {
          currentPage: page,
          totalPages,
          totalTransactions,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      }
    });
  } catch (error) {
    return next(error);
  }
});

const { freezeWallet, unfreezeWallet } = require('../controllers/adminController');

router.post('/wallet/freeze', freezeWallet);
router.post('/wallet/unfreeze', unfreezeWallet);

module.exports = router;
