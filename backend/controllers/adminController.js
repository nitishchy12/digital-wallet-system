// Purpose: Admin wallet management — freeze, unfreeze
// Dependencies: Wallet model, auditLogger
// Used by: backend/routes/admin.js

const Wallet = require('../models/Wallet');
const { writeAuditLog } = require('../utils/auditLogger');
const logger = require('../utils/logger');

const freezeWallet = async (req, res, next) => {
  try {
    const { userId, reason } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'MISSING_USER_ID', message: 'userId is required' });
    }

    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({
        success: false,
        error: 'REASON_REQUIRED',
        message: 'A reason of at least 10 characters is required to freeze a wallet.'
      });
    }

    const wallet = await Wallet.findOneAndUpdate(
      { userId },
      {
        status: 'frozen',
        frozenAt: new Date(),
        frozenReason: reason.trim(),
        frozenBy: req.user._id
      },
      { new: true }
    );

    if (!wallet) {
      return res.status(404).json({ success: false, error: 'WALLET_NOT_FOUND', message: 'Wallet not found for this user' });
    }

    await writeAuditLog({
      action: 'WALLET_FROZEN',
      userId: req.user._id,
      req,
      metadata: {
        targetUserId: userId,
        reason: reason.trim(),
        adminId: req.user._id.toString()
      },
      severity: 'critical'
    });

    logger.info('Wallet frozen adminId=%s targetUserId=%s reason=%s', req.user._id, userId, reason.trim());

    return res.status(200).json({
      success: true,
      message: 'Wallet frozen successfully.',
      data: {
        userId,
        status: 'frozen',
        frozenAt: wallet.frozenAt,
        frozenReason: wallet.frozenReason
      }
    });
  } catch (err) {
    logger.error('Freeze wallet error: %s', err.message);
    return next(err);
  }
};

const unfreezeWallet = async (req, res, next) => {
  try {
    const { userId, reason } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'MISSING_USER_ID', message: 'userId is required' });
    }

    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({
        success: false,
        error: 'REASON_REQUIRED',
        message: 'A reason of at least 10 characters is required to unfreeze a wallet.'
      });
    }

    const wallet = await Wallet.findOneAndUpdate(
      { userId },
      {
        status: 'active',
        frozenAt: null,
        frozenReason: null,
        frozenBy: null
      },
      { new: true }
    );

    if (!wallet) {
      return res.status(404).json({ success: false, error: 'WALLET_NOT_FOUND', message: 'Wallet not found for this user' });
    }

    await writeAuditLog({
      action: 'WALLET_UNFROZEN',
      userId: req.user._id,
      req,
      metadata: {
        targetUserId: userId,
        reason: reason.trim(),
        adminId: req.user._id.toString()
      },
      severity: 'warning'
    });

    logger.info('Wallet unfrozen adminId=%s targetUserId=%s', req.user._id, userId);

    return res.status(200).json({
      success: true,
      message: 'Wallet unfrozen successfully.',
      data: { userId, status: 'active' }
    });
  } catch (err) {
    logger.error('Unfreeze wallet error: %s', err.message);
    return next(err);
  }
};

module.exports = { freezeWallet, unfreezeWallet };
