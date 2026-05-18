// Purpose: Dispute management routes — user and admin endpoints
// Dependencies: disputeController, auth middleware
// Used by: server.js

const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const {
  raiseDispute,
  getMyDisputes,
  getDisputeById,
  resolveDispute,
  rejectDispute,
  getDisputeQueue
} = require('../controllers/disputeController');

router.use(authenticateToken);

// Admin routes MUST come before /:id to prevent '/admin/queue' matching id='admin'
router.get('/admin/queue',      requireAdmin, getDisputeQueue);
router.post('/admin/resolve',   requireAdmin, resolveDispute);
router.post('/admin/reject',    requireAdmin, rejectDispute);

router.post('/',        raiseDispute);
router.get('/my',       getMyDisputes);
router.get('/:id',      getDisputeById);

module.exports = router;
