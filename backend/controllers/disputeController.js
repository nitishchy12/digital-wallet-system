// Purpose: Dispute lifecycle — raise, review, resolve, reject
// Dependencies: Dispute, Transaction, Wallet models, auditLogger, notificationQueue
// Used by: backend/routes/dispute.js

const crypto = require('crypto');
const Dispute = require('../models/Dispute');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const { writeAuditLog } = require('../utils/auditLogger');
const { enqueueNotification } = require('../utils/notificationQueue');
const { invalidateMany } = require('../utils/balanceCache');
const logger = require('../utils/logger');

const raiseDispute = async (req, res, next) => {
  try {
    const { transactionId, reason } = req.body;
    const userId = req.user._id;

    if (!transactionId) {
      return res.status(422).json({ success: false, error: 'MISSING_TRANSACTION_ID', message: 'transactionId is required' });
    }
    if (!reason || reason.trim().length < 20) {
      return res.status(422).json({ success: false, error: 'REASON_TOO_SHORT', message: 'Reason must be at least 20 characters' });
    }

    // Validate transaction exists and sender owns it
    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      return res.status(404).json({ success: false, error: 'TRANSACTION_NOT_FOUND', message: 'Transaction not found' });
    }

    // senderId on Transaction is a User ObjectId — compare directly with the authenticated user
    if (transaction.senderId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        error: 'NOT_AUTHORIZED',
        message: 'You can only dispute transfers you sent.'
      });
    }

    // Only SUCCESS transfers can be disputed
    if (transaction.status !== 'SUCCESS') {
      return res.status(400).json({
        success: false,
        error: 'TRANSACTION_NOT_DISPUTABLE',
        message: `Cannot dispute a transaction with status: ${transaction.status}`
      });
    }

    // 24-hour dispute window
    const hoursElapsed = (Date.now() - new Date(transaction.createdAt).getTime()) / 3600000;
    if (hoursElapsed > 24) {
      return res.status(400).json({
        success: false,
        error: 'DISPUTE_WINDOW_EXPIRED',
        message: 'Disputes must be raised within 24 hours of the transfer.'
      });
    }

    // One dispute per transaction
    const existing = await Dispute.findOne({ transactionId });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'DISPUTE_ALREADY_EXISTS',
        message: 'A dispute already exists for this transaction.'
      });
    }

    const dispute = await Dispute.create({
      transactionId,
      raisedBy: userId,
      againstUserId: transaction.receiverId,
      amount: transaction.amount,
      reason: reason.trim(),
      escrowAmount: transaction.amount,
      status: 'pending',
      timeline: [{ status: 'pending', changedBy: userId, note: 'Dispute raised by sender' }]
    });

    // Lock the disputed amount in escrow on the sender's wallet
    await Wallet.findOneAndUpdate(
      { userId },
      { $inc: { escrowHeld: transaction.amount } }
    );

    await writeAuditLog({
      action: 'DISPUTE_RAISED',
      userId,
      req,
      metadata: {
        disputeId: dispute._id.toString(),
        transactionId: transactionId.toString(),
        amount: transaction.amount
      },
      severity: 'warning'
    });

    await enqueueNotification('DISPUTE_RAISED', {
      userEmail: req.user.email,
      userName: req.user.name,
      transactionId: transactionId.toString(),
      amount: transaction.amount,
      disputeId: dispute._id.toString()
    });

    return res.status(201).json({
      success: true,
      message: 'Dispute raised. We will review it within 48 hours.',
      data: {
        disputeId: dispute._id,
        status: 'pending',
        amount: transaction.amount,
        escrowNote: `Rs ${transaction.amount.toLocaleString('en-IN')} is held in escrow pending resolution.`
      }
    });
  } catch (err) {
    logger.error('raiseDispute error: %s', err.message);
    return next(err);
  }
};

const getMyDisputes = async (req, res, next) => {
  try {
    const disputes = await Dispute.find({ raisedBy: req.user._id })
      .sort({ createdAt: -1 })
      .populate('transactionId', 'amount createdAt description transactionId')
      .populate('againstUserId', 'name email');

    return res.status(200).json({ success: true, data: disputes });
  } catch (err) {
    logger.error('getMyDisputes error: %s', err.message);
    return next(err);
  }
};

const getDisputeById = async (req, res, next) => {
  try {
    const dispute = await Dispute.findById(req.params.id)
      .populate('transactionId')
      .populate('raisedBy', 'name email')
      .populate('againstUserId', 'name email')
      .populate('resolvedBy', 'name email');

    if (!dispute) {
      return res.status(404).json({ success: false, error: 'DISPUTE_NOT_FOUND', message: 'Dispute not found' });
    }

    if (dispute.raisedBy._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'NOT_AUTHORIZED', message: 'Not authorized' });
    }

    return res.status(200).json({ success: true, data: dispute });
  } catch (err) {
    logger.error('getDisputeById error: %s', err.message);
    return next(err);
  }
};

const resolveDispute = async (req, res, next) => {
  try {
    const { disputeId, resolutionNote } = req.body;

    if (!resolutionNote || resolutionNote.trim().length < 10) {
      return res.status(422).json({ success: false, error: 'NOTE_REQUIRED', message: 'Resolution note must be at least 10 characters' });
    }

    const dispute = await Dispute.findById(disputeId);
    if (!dispute) {
      return res.status(404).json({ success: false, error: 'DISPUTE_NOT_FOUND', message: 'Dispute not found' });
    }

    if (!['pending', 'under_review'].includes(dispute.status)) {
      return res.status(400).json({
        success: false,
        error: 'DISPUTE_ALREADY_CLOSED',
        message: `Dispute is already ${dispute.status}`
      });
    }

    const senderWallet   = await Wallet.findOne({ userId: dispute.raisedBy });
    const receiverWallet = await Wallet.findOne({ userId: dispute.againstUserId });

    if (!senderWallet || !receiverWallet) {
      return res.status(404).json({ success: false, error: 'WALLET_NOT_FOUND', message: 'One or both wallets not found' });
    }

    // Compensating transaction — original is NEVER modified
    const compensatingTxn = await Transaction.create({
      transactionId: crypto.randomBytes(12).toString('hex'),
      senderId: dispute.againstUserId,   // receiver of original sends back
      receiverId: dispute.raisedBy,       // original sender receives back
      amount: dispute.amount,
      type: 'DISPUTE_REVERSAL',
      status: 'SUCCESS',
      paymentGateway: 'INTERNAL',
      description: `Dispute reversal for transaction ${dispute.transactionId}`,
      processedAt: new Date(),
      idempotencyKey: `dispute-reversal-${dispute._id}`
    });

    // Return money to sender, reduce escrow hold; debit receiver
    await Wallet.findByIdAndUpdate(senderWallet._id, {
      $inc: { balance: dispute.amount, escrowHeld: -dispute.amount }
    });
    await Wallet.findByIdAndUpdate(receiverWallet._id, {
      $inc: { balance: -dispute.amount }
    });

    // Invalidate balance caches for both parties
    await invalidateMany([dispute.raisedBy.toString(), dispute.againstUserId.toString()]);

    await Dispute.findByIdAndUpdate(disputeId, {
      status: 'resolved',
      resolvedBy: req.user._id,
      resolvedAt: new Date(),
      resolutionNote: resolutionNote.trim(),
      compensatingTransactionId: compensatingTxn._id,
      $push: { timeline: { status: 'resolved', changedBy: req.user._id, note: resolutionNote.trim() } }
    });

    await writeAuditLog({
      action: 'DISPUTE_RESOLVED',
      userId: req.user._id,
      req,
      metadata: {
        disputeId: disputeId.toString(),
        outcome: 'resolved',
        compensatingTransactionId: compensatingTxn._id.toString(),
        amount: dispute.amount
      },
      severity: 'critical'
    });

    logger.info('Dispute resolved disputeId=%s adminId=%s amount=%s', disputeId, req.user._id, dispute.amount);

    return res.status(200).json({
      success: true,
      message: 'Dispute resolved. Transfer reversed.',
      data: {
        disputeId,
        compensatingTransactionId: compensatingTxn._id,
        amountReturned: dispute.amount
      }
    });
  } catch (err) {
    logger.error('resolveDispute error: %s', err.message);
    return next(err);
  }
};

const rejectDispute = async (req, res, next) => {
  try {
    const { disputeId, resolutionNote } = req.body;

    if (!resolutionNote || resolutionNote.trim().length < 10) {
      return res.status(422).json({ success: false, error: 'NOTE_REQUIRED', message: 'Resolution note must be at least 10 characters' });
    }

    const dispute = await Dispute.findById(disputeId);
    if (!dispute) {
      return res.status(404).json({ success: false, error: 'DISPUTE_NOT_FOUND', message: 'Dispute not found' });
    }

    if (!['pending', 'under_review'].includes(dispute.status)) {
      return res.status(400).json({ success: false, error: 'DISPUTE_ALREADY_CLOSED', message: `Dispute is already ${dispute.status}` });
    }

    // Release escrow only — no balance movement
    await Wallet.findOneAndUpdate(
      { userId: dispute.raisedBy },
      { $inc: { escrowHeld: -dispute.amount } }
    );

    await Dispute.findByIdAndUpdate(disputeId, {
      status: 'rejected',
      resolvedBy: req.user._id,
      resolvedAt: new Date(),
      resolutionNote: resolutionNote.trim(),
      $push: { timeline: { status: 'rejected', changedBy: req.user._id, note: resolutionNote.trim() } }
    });

    await writeAuditLog({
      action: 'DISPUTE_RESOLVED',
      userId: req.user._id,
      req,
      metadata: { disputeId: disputeId.toString(), outcome: 'rejected' },
      severity: 'warning'
    });

    return res.status(200).json({
      success: true,
      message: 'Dispute rejected. Original transfer stands.',
      data: { disputeId, status: 'rejected' }
    });
  } catch (err) {
    logger.error('rejectDispute error: %s', err.message);
    return next(err);
  }
};

const getDisputeQueue = async (req, res, next) => {
  try {
    const { status = 'pending' } = req.query;
    const disputes = await Dispute.find({ status })
      .sort({ createdAt: 1 })
      .populate('raisedBy', 'name email')
      .populate('againstUserId', 'name email')
      .populate('transactionId', 'amount createdAt transactionId');

    return res.status(200).json({ success: true, data: disputes });
  } catch (err) {
    logger.error('getDisputeQueue error: %s', err.message);
    return next(err);
  }
};

module.exports = { raiseDispute, getMyDisputes, getDisputeById, resolveDispute, rejectDispute, getDisputeQueue };
