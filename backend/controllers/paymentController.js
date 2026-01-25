const crypto = require('crypto');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');

/*
|--------------------------------------------------------------------------
| MOCK PAYMENT CONTROLLER
|--------------------------------------------------------------------------
| Razorpay integration is intentionally mocked to avoid
| PAN/KYC requirements for development and student projects.
|--------------------------------------------------------------------------
*/

// ===============================
// CREATE PAYMENT ORDER (MOCK)
// ===============================
const createPaymentOrder = async (req, res) => {
  try {
    const { amount, paymentGateway } = req.body;
    const userId = req.user._id;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }

    // Get wallet (SINGLE SOURCE OF TRUTH)
    const wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      return res.status(404).json({
        success: false,
        code: 'WALLET_NOT_FOUND',
        message: 'Wallet not found. Please contact support.'
      });
    }

    // Generate unique transaction ID
    const transactionId = `PAY${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // Create transaction
    const transaction = new Transaction({
      transactionId,
      receiverId: userId,
      amount,
      type: 'ADD_MONEY',
      status: 'SUCCESS'
    });

    // Update wallet balance
    wallet.balance += amount;
    
    await transaction.save();
    await wallet.save();

    // Emit socket event
    if (global.io) {
      global.io.to(`user-${userId}`).emit('transaction-update', {
        type: 'MONEY_ADDED',
        transaction: transaction.toObject(),
        newBalance: wallet.balance
      });
    }

    return res.status(200).json({
      success: true,
      message: `₹${amount} added to wallet successfully (Mock)`,
      data: {
        transaction: transaction.toObject(),
        newBalance: wallet.balance,
        formattedBalance: `₹${wallet.balance.toLocaleString('en-IN')}`
      }
    });

  } catch (error) {
    console.error('Mock payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process mock payment'
    });
  }
};

// ===============================
// VERIFY PAYMENT (MOCK)
// ===============================
const verifyPayment = async (req, res) => {
  return res.status(200).json({
    success: true,
    message: 'Payment already verified (Mock mode)'
  });
};

// ===============================
// WEBHOOK HANDLER (DISABLED)
// ===============================
const handleWebhook = async (req, res) => {
  return res.status(200).json({
    success: true,
    message: 'Webhook ignored (Mock mode)'
  });
};

// ===============================
// GET PAYMENT METHODS
// ===============================
const getPaymentMethods = async (req, res) => {
  try {
    const paymentMethods = [
      {
        id: 'mock',
        name: 'Mock Payment',
        description: 'Simulated payment for demo/testing',
        enabled: true,
        logo: '/images/mock-payment.png'
      }
    ];

    res.status(200).json({
      success: true,
      data: {
        paymentMethods
      }
    });

  } catch (error) {
    console.error('Get payment methods error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment methods'
    });
  }
};

module.exports = {
  createPaymentOrder,
  verifyPayment,
  handleWebhook,
  getPaymentMethods
};
