const User = require("../models/User");
const Wallet = require("../models/Wallet");
const Transaction = require("../models/Transaction");

/* ================= GET WALLET BALANCE ================= */

/* ================= GET WALLET BALANCE ================= */

/**
 * SINGLE SOURCE OF TRUTH: Only reads from Wallet model
 * No user.walletBalance - that doesn't exist
 */
const getWalletBalance = async (req, res) => {
  try {
    // Only read from Wallet model (single source of truth)
    const wallet = await Wallet.findOne({ userId: req.user._id });

    if (!wallet) {
      return res.status(404).json({
        success: false,
        code: "WALLET_NOT_FOUND",
        message: "Wallet not found. Please contact support.",
      });
    }

    res.status(200).json({
      success: true,
      data: {
        balance: wallet.balance,
        formattedBalance: `₹${wallet.balance.toLocaleString("en-IN")}`,
        currency: wallet.currency,
      },
    });
  } catch (error) {
    console.error("Get wallet balance error:", error);
    res.status(500).json({
      success: false,
      code: "WALLET_BALANCE_FETCH_FAILED",
      message: "Failed to fetch wallet balance",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/* ================= TRANSFER MONEY ================= */

/**
 * SINGLE SOURCE OF TRUTH: Only Wallet model
 * IMMUTABLE: Once saved, transaction never changes
 * NOTE: Using simple save() operations (no MongoDB transactions for standalone MongoDB)
 */
const transferMoney = async (req, res) => {
  try {
    const { receiverEmail, amount, description } = req.body;
    const senderId = req.user._id;

    // Validation
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        code: "INVALID_AMOUNT",
        message: "Amount must be greater than zero",
      });
    }

    // Find receiver
    const receiver = await User.findOne({ email: receiverEmail });

    if (!receiver) {
      return res.status(404).json({
        success: false,
        code: "RECEIVER_NOT_FOUND",
        message: "Receiver not found",
      });
    }

    if (receiver._id.toString() === senderId.toString()) {
      return res.status(400).json({
        success: false,
        code: "SELF_TRANSFER_NOT_ALLOWED",
        message: "Cannot transfer money to yourself",
      });
    }

    if (!receiver.isVerified) {
      return res.status(400).json({
        success: false,
        code: "RECEIVER_NOT_VERIFIED",
        message: "Receiver account is not verified",
      });
    }

    // Get wallets (SINGLE SOURCE OF TRUTH)
    const senderWallet = await Wallet.findOne({ userId: senderId });
    const receiverWallet = await Wallet.findOne({ userId: receiver._id });

    if (!senderWallet) {
      return res.status(404).json({
        success: false,
        code: "SENDER_WALLET_NOT_FOUND",
        message: "Your wallet not found. Please contact support.",
      });
    }

    if (!receiverWallet) {
      return res.status(404).json({
        success: false,
        code: "RECEIVER_WALLET_NOT_FOUND",
        message: "Receiver wallet not found",
      });
    }

    // Check balance
    if (senderWallet.balance < amount) {
      return res.status(400).json({
        success: false,
        code: "INSUFFICIENT_BALANCE",
        message: "Insufficient wallet balance",
        availableBalance: senderWallet.balance,
      });
    }

    // Generate unique transaction ID
    const transactionId = `TXN${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // Update balances first (before creating transaction records)
    senderWallet.balance -= amount;
    receiverWallet.balance += amount;

    // Save wallet balances
    await senderWallet.save();
    await receiverWallet.save();

    // Create sender transaction record
    const transaction = new Transaction({
      transactionId,
      senderId,
      receiverId: receiver._id,
      amount,
      type: "SEND",
      status: "SUCCESS",
    });
    await transaction.save();

    // Create receiver transaction record (for their history)
    const receiverTransaction = new Transaction({
      transactionId: `${transactionId}_R`,
      senderId,
      receiverId: receiver._id,
      amount,
      type: "RECEIVE",
      status: "SUCCESS",
    });
    await receiverTransaction.save();

    // Emit socket events for both users
    if (global.io) {
      // Notify sender
      global.io.to(`user-${senderId}`).emit('transaction-update', {
        type: 'TRANSFER_SENT',
        transaction: transaction.toObject(),
        newBalance: senderWallet.balance
      });

      // Notify receiver
      global.io.to(`user-${receiver._id}`).emit('transaction-update', {
        type: 'MONEY_RECEIVED',
        transaction: receiverTransaction.toObject(),
        newBalance: receiverWallet.balance
      });
    }

    res.status(200).json({
      success: true,
      message: `₹${amount} transferred successfully to ${receiver.name}`,
      data: {
        transaction: {
          transactionId: transaction.transactionId,
          amount,
          status: transaction.status,
          createdAt: transaction.createdAt,
        },
        senderBalance: senderWallet.balance,
        receiver: {
          name: receiver.name,
          email: receiver.email,
        },
      },
    });
  } catch (error) {
    console.error("Transfer money error:", error);
    res.status(500).json({
      success: false,
      code: "TRANSFER_FAILED",
      message: "Money transfer failed. Please try again.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/* ================= TRANSACTION HISTORY ================= */

const getTransactionHistory = async (req, res) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const filterType = req.query.type; // 'sent', 'received', or undefined

    // Build match query based on filter
    let match = {
      $or: [{ senderId: userId }, { receiverId: userId }],
    };

    // Apply filter if provided
    if (filterType === 'sent') {
      match = { senderId: userId, type: { $in: ['SEND'] } };
    } else if (filterType === 'received') {
      match = { receiverId: userId, type: { $in: ['RECEIVE', 'ADD_MONEY'] } };
    }

    const transactions = await Transaction.find(match)
      .populate("senderId", "name email")
      .populate("receiverId", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(); // Use lean() for better performance

    const total = await Transaction.countDocuments(match);

    const formatted = transactions.map((tx) => {
      // Handle ADD_MONEY type (no sender/receiver)
      if (tx.type === "ADD_MONEY") {
        return {
          _id: tx._id?.toString() || tx._id,
          transactionId: tx.transactionId || `TXN${tx._id}`,
          amount: tx.amount,
          formattedAmount: `₹${tx.amount.toLocaleString("en-IN")}`,
          type: tx.type,
          status: tx.status || "SUCCESS",
          direction: "ADDED",
          counterparty: null,
          createdAt: tx.createdAt,
        };
      }

      // Handle SEND/RECEIVE types
      // Check if user is receiver (received money)
      const isReceived = tx.receiverId && 
        (tx.receiverId._id?.toString() === userId.toString() || 
         (typeof tx.receiverId === 'object' && tx.receiverId._id?.toString() === userId.toString()) ||
         tx.receiverId.toString() === userId.toString());

      // Get counterparty safely
      let counterparty = null;
      if (isReceived && tx.senderId) {
        counterparty = {
          name: tx.senderId.name || "Unknown User",
          email: tx.senderId.email || ""
        };
      } else if (!isReceived && tx.receiverId) {
        counterparty = {
          name: tx.receiverId.name || "Unknown User",
          email: tx.receiverId.email || ""
        };
      }

      return {
        _id: tx._id?.toString() || tx._id,
        transactionId: tx.transactionId || `TXN${tx._id}`,
        amount: tx.amount,
        formattedAmount: `₹${tx.amount.toLocaleString("en-IN")}`,
        type: tx.type,
        status: tx.status || "SUCCESS",
        direction: isReceived ? "RECEIVED" : "SENT",
        counterparty: counterparty,
        createdAt: tx.createdAt,
      };
    });

    res.status(200).json({
      success: true,
      data: {
        transactions: formatted,
        pagination: {
          currentPage: page,
          page: page, // Keep both for compatibility
          totalPages: Math.ceil(total / limit),
          totalTransactions: total,
          hasNextPage: page < Math.ceil(total / limit),
          hasPrevPage: page > 1,
        },
      },
    });
  } catch (error) {
    console.error("Transaction history error:", error);
    res.status(500).json({
      success: false,
      code: "TRANSACTION_HISTORY_FETCH_FAILED",
      message: "Failed to fetch transaction history",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/* ================= WALLET STATS ================= */

/**
 * SINGLE SOURCE OF TRUTH: Only reads from Wallet model
 */
const getWalletStats = async (req, res) => {
  try {
    const userId = req.user._id;

    // Get wallet (single source of truth)
    const wallet = await Wallet.findOne({ userId });

    if (!wallet) {
      return res.status(404).json({
        success: false,
        code: "WALLET_NOT_FOUND",
        message: "Wallet not found",
      });
    }

    // Calculate stats from transactions
    const sentAgg = await Transaction.aggregate([
      { $match: { senderId: userId, status: "SUCCESS", type: "SEND" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    const receivedAgg = await Transaction.aggregate([
      { $match: { receiverId: userId, status: "SUCCESS", type: "RECEIVE" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    // Get total transaction count
    const totalTransactions = await Transaction.countDocuments({
      $or: [{ senderId: userId }, { receiverId: userId }],
    });

    res.status(200).json({
      success: true,
      data: {
        balance: wallet.balance,
        totalSent: sentAgg[0]?.total || 0,
        totalReceived: receivedAgg[0]?.total || 0,
        totalTransactions: totalTransactions,
        formattedBalance: `₹${wallet.balance.toLocaleString("en-IN")}`,
        formattedTotalSent: `₹${(sentAgg[0]?.total || 0).toLocaleString("en-IN")}`,
        formattedTotalReceived: `₹${(receivedAgg[0]?.total || 0).toLocaleString("en-IN")}`,
      },
    });
  } catch (error) {
    console.error("Wallet stats error:", error);
    res.status(500).json({
      success: false,
      code: "WALLET_STATS_FETCH_FAILED",
      message: "Failed to fetch wallet statistics",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/* ================= SEARCH USERS ================= */

const searchUsers = async (req, res) => {
  try {
    const { query } = req.query;
    const currentUserId = req.user._id;

    if (!query || query.length < 2) {
      return res.status(400).json({
        success: false,
        code: "INVALID_SEARCH_QUERY",
        message: "Search query must be at least 2 characters",
      });
    }

    // Only search verified and active users
    const users = await User.find({
      _id: { $ne: currentUserId },
      isVerified: true,
      isActive: true,
      $or: [
        { name: { $regex: query, $options: "i" } },
        { email: { $regex: query, $options: "i" } },
      ],
    })
      .select("name email")
      .limit(10);

    res.status(200).json({
      success: true,
      data: { users },
    });
  } catch (error) {
    console.error("Search users error:", error);
    res.status(500).json({
      success: false,
      code: "USER_SEARCH_FAILED",
      message: "Failed to search users",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/* ================= EXPORTS ================= */

module.exports = {
  getWalletBalance,
  transferMoney,
  getTransactionHistory,
  getWalletStats,
  searchUsers,
};
