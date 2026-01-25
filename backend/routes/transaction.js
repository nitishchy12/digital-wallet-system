const express = require("express");
const router = express.Router();
const Transaction = require("../models/Transaction");
const { authenticateToken, requireVerified } = require("../middleware/auth");
const { validateObjectId } = require("../middleware/validation");

/**
 * @route   GET /api/transactions/:id
 * @desc    Get a transaction by ID (sender or receiver only)
 * @access  Private + Verified
 */
router.get(
  "/:id",
  authenticateToken,
  requireVerified,
  validateObjectId("id"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user._id;

      const transaction = await Transaction.findOne({
        _id: id,
        $or: [{ senderId: userId }, { receiverId: userId }],
      })
        .populate("senderId", "name email")
        .populate("receiverId", "name email");

      if (!transaction) {
        return res.status(404).json({
          success: false,
          message: "Transaction not found",
        });
      }

      const isReceived =
        transaction.receiverId._id.toString() === userId.toString();

      res.status(200).json({
        success: true,
        data: {
          transaction: {
            ...transaction.toObject(),
            direction: isReceived ? "RECEIVED" : "SENT",
            counterparty: isReceived
              ? transaction.senderId
              : transaction.receiverId,
            formattedAmount: `₹${transaction.amount.toLocaleString("en-IN")}`,
          },
        },
      });
    } catch (error) {
      console.error("Get transaction error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch transaction",
      });
    }
  }
);

module.exports = router;
