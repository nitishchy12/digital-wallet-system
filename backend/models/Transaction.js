const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema(
  {
    transactionId: {
      type: String,
      unique: true,
      required: true
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    amount: {
      type: Number,
      required: true
    },
    type: {
      type: String,
      enum: ['SEND', 'RECEIVE', 'TRANSFER', 'ADD_MONEY'],
      required: true
    },
    status: {
      type: String,
      enum: ['SUCCESS', 'FAILED', 'PENDING'],
      default: 'SUCCESS'
    },
    description: {
      type: String,
      trim: true,
      maxlength: 200
    },
    paymentGateway: {
      type: String,
      enum: ['INTERNAL', 'MOCK', 'RAZORPAY', 'STRIPE'],
      default: 'INTERNAL'
    },
    processedAt: {
      type: Date
    },
    idempotencyKey: {
      type: String,
      trim: true
    },
    idempotencyUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    gatewayOrderId: {
      type: String,
      trim: true
    },
    gatewayPaymentId: {
      type: String,
      trim: true
    },
    gatewaySignature: {
      type: String,
      trim: true
    },
    gatewayMeta: {
      type: mongoose.Schema.Types.Mixed
    },
    balanceSnapshot: {
      senderBalance: Number,
      receiverBalance: Number
    }
  },
  { timestamps: true }
);

TransactionSchema.index({ senderId: 1, createdAt: -1 });
TransactionSchema.index({ receiverId: 1, createdAt: -1 });
TransactionSchema.index({ createdAt: -1 });
TransactionSchema.index({ idempotencyUserId: 1, idempotencyKey: 1 }, { unique: true, sparse: true });
TransactionSchema.index({ gatewayOrderId: 1 });

module.exports = mongoose.model('Transaction', TransactionSchema);
