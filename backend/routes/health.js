// Purpose: Health check endpoint for Kubernetes liveness + readiness probes
// Dependencies: healthCheck.js
// Used by: backend/server.js

const express = require('express');
const router = express.Router();
const { getHealthStatus } = require('../utils/healthCheck');

router.get('/', async (req, res) => {
  try {
    const health = await getHealthStatus();
    return res.status(health.status === 'ok' ? 200 : 503).json(health);
  } catch (err) {
    return res.status(503).json({
      status: 'down',
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
