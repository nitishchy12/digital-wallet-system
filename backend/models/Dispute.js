// Purpose: Tracks dispute lifecycle for a completed transfer
// Dependencies: mongoose
// Used by: backend/controllers/disputeController.js

const mongoose = require('mongoose');

const disputeSchema = new mongoose.Schema(
  {
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      required: true
    },
    raisedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    againstUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    amount: { type: Number, required: true },
    reason: { type: String, required: true, minlength: 20, maxlength: 500 },
    status: {
      type: String,
      enum: ['pending', 'under_review', 'resolved', 'rejected'],
      default: 'pending'
    },
    escrowAmount: { type: Number, required: true },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
    resolutionNote: { type: String, default: null },
    compensatingTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      default: null
    },
    timeline: [
      {
        status: String,
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        note: String
      }
    ]
  },
  { timestamps: true }
);

disputeSchema.index({ raisedBy: 1, createdAt: -1 });
disputeSchema.index({ status: 1, createdAt: 1 });
disputeSchema.index({ transactionId: 1 });

module.exports = mongoose.model('Dispute', disputeSchema);
