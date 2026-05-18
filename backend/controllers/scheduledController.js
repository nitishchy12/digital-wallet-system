// Purpose: CRUD for scheduled transfers
// Dependencies: ScheduledTransfer model, scheduledQueue
// Used by: backend/routes/scheduled.js

const ScheduledTransfer = require('../models/ScheduledTransfer');
const User = require('../models/User');
const { scheduleTransferJob, cancelTransferJob } = require('../queues/scheduledQueue');
const logger = require('../utils/logger');

const createScheduledTransfer = async (req, res, next) => {
  try {
    const { receiverEmail, amount, description, scheduledAt, recurring, recurringIntervalDays } = req.body;
    const userId = req.user._id;   // auth middleware sets req.user._id

    if (!scheduledAt || new Date(scheduledAt) <= new Date()) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_SCHEDULED_TIME',
        message: 'Scheduled time must be in the future.'
      });
    }

    if (!amount || amount < 1) {
      return res.status(422).json({ success: false, error: 'INVALID_AMOUNT', message: 'Amount must be at least 1' });
    }

    const receiver = await User.findOne({ email: receiverEmail, isVerified: true, isActive: true });
    if (!receiver) {
      return res.status(404).json({ success: false, error: 'RECEIVER_NOT_FOUND', message: 'No verified user found with that email.' });
    }

    if (receiver._id.toString() === userId.toString()) {
      return res.status(400).json({ success: false, error: 'SELF_TRANSFER', message: 'Cannot schedule a transfer to yourself.' });
    }

    const scheduled = await ScheduledTransfer.create({
      userId,
      receiverEmail,
      amount,
      description: description || 'Scheduled transfer',
      scheduledAt: new Date(scheduledAt),
      recurring: recurring || false,
      recurringIntervalDays: recurring ? (recurringIntervalDays || null) : null,
      status: 'pending'
    });

    const jobId = await scheduleTransferJob(scheduled._id, scheduledAt);
    await ScheduledTransfer.findByIdAndUpdate(scheduled._id, { bullmqJobId: jobId });

    logger.info('Scheduled transfer created userId=%s amount=%s scheduledAt=%s jobId=%s', userId, amount, scheduledAt, jobId);

    return res.status(201).json({
      success: true,
      message: `Transfer of Rs ${amount} to ${receiverEmail} scheduled for ${new Date(scheduledAt).toLocaleString('en-IN')}.`,
      data: { scheduledTransferId: scheduled._id, jobId, scheduledAt, amount }
    });
  } catch (err) {
    logger.error('createScheduledTransfer error: %s', err.message);
    return next(err);
  }
};

const getMyScheduledTransfers = async (req, res, next) => {
  try {
    const { status } = req.query;
    const filter = { userId: req.user._id };
    if (status) filter.status = status;

    const transfers = await ScheduledTransfer.find(filter).sort({ scheduledAt: 1 });
    return res.status(200).json({ success: true, data: transfers });
  } catch (err) {
    logger.error('getMyScheduledTransfers error: %s', err.message);
    return next(err);
  }
};

const cancelScheduledTransfer = async (req, res, next) => {
  try {
    const scheduled = await ScheduledTransfer.findById(req.params.id);

    if (!scheduled) {
      return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Scheduled transfer not found' });
    }

    if (scheduled.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, error: 'NOT_AUTHORIZED', message: 'Not authorized' });
    }

    if (scheduled.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'CANNOT_CANCEL',
        message: `Cannot cancel a transfer with status: ${scheduled.status}`
      });
    }

    if (scheduled.bullmqJobId) {
      await cancelTransferJob(scheduled.bullmqJobId);
    }

    await ScheduledTransfer.findByIdAndUpdate(req.params.id, { status: 'cancelled' });

    logger.info('Scheduled transfer cancelled id=%s userId=%s', req.params.id, req.user._id);

    return res.status(200).json({
      success: true,
      message: 'Scheduled transfer cancelled.',
      data: { scheduledTransferId: req.params.id }
    });
  } catch (err) {
    logger.error('cancelScheduledTransfer error: %s', err.message);
    return next(err);
  }
};

module.exports = { createScheduledTransfer, getMyScheduledTransfers, cancelScheduledTransfer };
