const mongoose = require("mongoose");

const TransactionSchema = new mongoose.Schema(
  {
    transactionId: {
      type: String,
      unique: true, // ✅ only here
      required: true,
    },

    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    amount: {
      type: Number,
      required: true,
    },

    type: {
      type: String,
      enum: ["SEND", "RECEIVE", "TRANSFER", "ADD_MONEY"],
      required: true,
    },

    status: {
      type: String,
      enum: ["SUCCESS", "FAILED", "PENDING"],
      default: "SUCCESS",
    },

    description: {
      type: String,
      trim: true,
      maxlength: 200,
    },

    paymentGateway: {
      type: String,
      enum: ["INTERNAL", "MOCK", "RAZORPAY", "STRIPE"],
      default: "INTERNAL",
    },

    processedAt: {
      type: Date,
    },

    balanceSnapshot: {
      senderBalance: Number,
      receiverBalance: Number,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Transaction", TransactionSchema);
