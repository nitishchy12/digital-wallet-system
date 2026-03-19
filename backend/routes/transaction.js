const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const { authenticateToken, requireVerified } = require('../middleware/auth');
const { validateObjectId } = require('../middleware/validation');

router.get('/:id', authenticateToken, requireVerified, validateObjectId('id'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const transaction = await Transaction.findOne({
      _id: id,
      $or: [{ senderId: userId }, { receiverId: userId }]
    })
      .populate('senderId', 'name email')
      .populate('receiverId', 'name email');

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    const isReceived = transaction.receiverId?._id?.toString() === userId.toString();

    return res.status(200).json({
      success: true,
      data: {
        transaction: {
          ...transaction.toObject(),
          direction: isReceived ? 'RECEIVED' : 'SENT',
          counterparty: isReceived ? transaction.senderId : transaction.receiverId,
          formattedAmount: `Rs ${transaction.amount.toLocaleString('en-IN')}`
        }
      }
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
