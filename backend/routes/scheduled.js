// Purpose: Scheduled transfer routes
// Dependencies: scheduledController, auth middleware
// Used by: server.js

const express = require('express');
const router = express.Router();
const { authenticateToken, requireVerified } = require('../middleware/auth');
const { createScheduledTransfer, getMyScheduledTransfers, cancelScheduledTransfer } = require('../controllers/scheduledController');

router.use(authenticateToken, requireVerified);

router.post('/',       createScheduledTransfer);
router.get('/',        getMyScheduledTransfers);
router.delete('/:id',  cancelScheduledTransfer);

module.exports = router;
