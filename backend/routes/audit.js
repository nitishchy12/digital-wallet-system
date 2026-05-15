// Purpose: Audit log query endpoints — user sees own history, admin sees all
// Dependencies: AuditLog model, auth middleware
// Used by: server.js

const express = require('express');
const router = express.Router();
const AuditLog = require('../models/AuditLog');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// GET /api/audit/my-activity — authenticated user sees their own log
router.get('/my-activity', authenticateToken, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 20;
    const skip = (page - 1) * limit;

    const filter = { userId: req.user._id };

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('action ip userAgent metadata createdAt severity'),
      AuditLog.countDocuments(filter)
    ]);

    return res.status(200).json({
      success: true,
      data: {
        logs,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
          hasNextPage: skip + logs.length < total
        }
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to fetch activity log' });
  }
});

// GET /api/audit/admin/all — admin sees full platform log with filters
router.get('/admin/all', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { action, userId, ip, from, to, severity } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 50;
    const skip = (page - 1) * limit;

    const filter = {};
    if (action)   filter.action = action;
    if (userId)   filter.userId = userId;
    if (ip)       filter.ip = ip;
    if (severity) filter.severity = severity;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to)   filter.createdAt.$lte = new Date(to);
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'name email'),
      AuditLog.countDocuments(filter)
    ]);

    return res.status(200).json({
      success: true,
      data: {
        logs,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to fetch audit logs' });
  }
});

module.exports = router;
