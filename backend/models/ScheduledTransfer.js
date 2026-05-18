// Purpose: Persists scheduled/recurring transfer jobs
// Dependencies: mongoose
// Used by: backend/controllers/scheduledController.js

const mongoose = require('mongoose');

const scheduledTransferSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receiverEmail: { type: String, required: true },
    amount: { type: Number, required: true, min: 1 },
    description: { type: String, default: 'Scheduled transfer' },
    scheduledAt: { type: Date, required: true },
    recurring: { type: Boolean, default: false },
    recurringIntervalDays: { type: Number, default: null }, // null=one-time, 1/7/30=daily/weekly/monthly
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
      default: 'pending'
    },
    bullmqJobId: { type: String, default: null },
    lastExecutedAt: { type: Date, default: null },
    failureReason: { type: String, default: null },
    executionCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

scheduledTransferSchema.index({ userId: 1, status: 1 });
scheduledTransferSchema.index({ scheduledAt: 1, status: 1 });

module.exports = mongoose.model('ScheduledTransfer', scheduledTransferSchema);
