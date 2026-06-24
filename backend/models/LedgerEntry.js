// Purpose: Double-entry bookkeeping — every transfer creates two entries
// Dependencies: mongoose
// Used by: backend/controllers/walletController.js

const mongoose = require('mongoose');

const ledgerEntrySchema = new mongoose.Schema(
  {
    walletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
      required: true
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      required: true
    },
    type: {
      type: String,
      enum: ['DEBIT', 'CREDIT'],
      required: true
    },
    amount: { type: Number, required: true, min: 0 },
    balanceBefore: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    description: { type: String, default: '' },
    counterpartyWalletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
      default: null
    }
  },
  { timestamps: true }
);

// Wallet statement queries
ledgerEntrySchema.index({ walletId: 1, createdAt: -1 });
// Reconciliation by transaction
ledgerEntrySchema.index({ transactionId: 1 });

module.exports = mongoose.model('LedgerEntry', ledgerEntrySchema);
