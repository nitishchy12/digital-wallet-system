const mongoose = require("mongoose");
const crypto = require("crypto");
const User = require("../models/User");
const Wallet = require("../models/Wallet");
const Transaction = require("../models/Transaction");

/* ================= GET WALLET BALANCE ================= */

const getWalletBalance = async (req, res) => {
  try {
    let wallet;

    try {
      wallet = await Wallet.findOneAndUpdate(
        { userId: req.user._id },
        {
          $setOnInsert: {
            userId: req.user._id,
            balance: 0,
            currency: "INR",
          },
        },
        { new: true, upsert: true }
      );
    } catch (error) {
      // Handle rare race condition on unique index
      if (error.code === 11000) {
        wallet = await Wallet.findOne({ userId: req.user._id });
      } else {
        throw error;
      }
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
      message: "Failed to fetch wallet balance",
    });
  }
};

/* ================= TRANSFER MONEY ================= */

const transferMoney = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { receiverEmail, amount, description } = req.body;
    const senderId = req.user._id;

    if (amount <= 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Amount must be greater than zero",
      });
    }

    // ================= FIND RECEIVER =================
    const receiver = await User.findOne({ email: receiverEmail }).session(
      session
    );

    if (!receiver) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Receiver not found",
      });
    }

    if (receiver._id.toString() === senderId.toString()) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Cannot transfer money to yourself",
      });
    }

    if (!receiver.isVerified) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Receiver account is not verified",
      });
    }

    // ================= GET WALLETS =================
    const senderWallet = await Wallet.findOneAndUpdate(
      { userId: senderId },
      {
        $setOnInsert: {
          userId: senderId,
          balance: 0,
          currency: "INR",
        },
      },
      { new: true, upsert: true, session }
    );

    const receiverWallet = await Wallet.findOneAndUpdate(
      { userId: receiver._id },
      {
        $setOnInsert: {
          userId: receiver._id,
          balance: 0,
          currency: "INR",
        },
      },
      { new: true, upsert: true, session }
    );

    if (senderWallet.balance < amount) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Insufficient wallet balance",
      });
    }

    // ================= CREATE TRANSACTION =================
    const transactionId = crypto.randomBytes(12).toString("hex");

    const transaction = new Transaction({
      transactionId,
      senderId,
      receiverId: receiver._id,
      amount,
      type: "TRANSFER",
      status: "PENDING",
      description: description || `Transfer to ${receiver.name}`,
      paymentGateway: "INTERNAL",
    });

    await transaction.save({ session });

    // ================= UPDATE BALANCES =================
    senderWallet.balance -= amount;
    receiverWallet.balance += amount;

    await senderWallet.save({ session });
    await receiverWallet.save({ session });

    // ================= MARK SUCCESS =================
    transaction.status = "SUCCESS";
    transaction.balanceSnapshot = {
      senderBalance: senderWallet.balance,
      receiverBalance: receiverWallet.balance,
    };

    await transaction.save({ session });

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: `₹${amount} transferred successfully to ${receiver.name}`,
      data: {
        transaction,
        senderBalance: senderWallet.balance,
        receiver: {
          name: receiver.name,
          email: receiver.email,
        },
      },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Transfer money error:", error);
    res.status(500).json({
      success: false,
      message: "Money transfer failed",
    });
  } finally {
    session.endSession();
  }
};

/* ================= TRANSACTION HISTORY ================= */

const getTransactionHistory = async (req, res) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const match = {
      $or: [{ senderId: userId }, { receiverId: userId }],
    };

    const transactions = await Transaction.find(match)
      .populate("senderId", "name email")
      .populate("receiverId", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Transaction.countDocuments(match);

    const formatted = transactions.map((tx) => {
      const isReceived =
        tx.receiverId._id.toString() === userId.toString();

      return {
        ...tx.toObject(),
        direction: isReceived ? "RECEIVED" : "SENT",
        counterparty: isReceived ? tx.senderId : tx.receiverId,
        formattedAmount: `₹${tx.amount.toLocaleString("en-IN")}`,
      };
    });

    res.status(200).json({
      success: true,
      data: {
        transactions: formatted,
        pagination: {
          page,
          totalPages: Math.ceil(total / limit),
          totalTransactions: total,
        },
      },
    });
  } catch (error) {
    console.error("Transaction history error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch transaction history",
    });
  }
};

/* ================= WALLET STATS ================= */

const getWalletStats = async (req, res) => {
  try {
    const userId = req.user._id;

    let wallet;

    try {
      wallet = await Wallet.findOneAndUpdate(
        { userId },
        {
          $setOnInsert: {
            userId,
            balance: 0,
            currency: "INR",
          },
        },
        { new: true, upsert: true }
      );
    } catch (error) {
      // Handle rare race condition on unique index
      if (error.code === 11000) {
        wallet = await Wallet.findOne({ userId });
      } else {
        throw error;
      }
    }

    const sentAgg = await Transaction.aggregate([
      { $match: { senderId: userId, status: "SUCCESS" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    const receivedAgg = await Transaction.aggregate([
      { $match: { receiverId: userId, status: "SUCCESS" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    res.status(200).json({
      success: true,
      data: {
        balance: wallet.balance,
        totalSent: sentAgg[0]?.total || 0,
        totalReceived: receivedAgg[0]?.total || 0,
        formattedBalance: `₹${wallet.balance.toLocaleString("en-IN")}`,
      },
    });
  } catch (error) {
    console.error("Wallet stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch wallet statistics",
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
        message: "Search query must be at least 2 characters",
      });
    }

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
      message: "Failed to search users",
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
