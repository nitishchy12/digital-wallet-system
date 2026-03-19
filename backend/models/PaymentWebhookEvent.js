const mongoose = require('mongoose');

const PaymentWebhookEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    eventType: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['RECEIVED', 'PROCESSED', 'DUPLICATE', 'FAILED', 'SKIPPED', 'ORPHAN'],
      default: 'RECEIVED'
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction'
    },
    reason: String,
    payloadMeta: mongoose.Schema.Types.Mixed,
    processedAt: Date
  },
  { timestamps: true }
);

module.exports = mongoose.model('PaymentWebhookEvent', PaymentWebhookEventSchema);
