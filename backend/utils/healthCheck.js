// Purpose: Check all critical dependencies are alive
// Dependencies: redis.js, mongoose
// Used by: backend/routes/health.js

const mongoose = require('mongoose');
const { getRedisClient } = require('./redis');

const checkMongoDB = async () => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return { status: 'down', error: 'Not connected' };
    }
    await mongoose.connection.db.admin().ping();
    return { status: 'up' };
  } catch (err) {
    return { status: 'down', error: err.message };
  }
};

const checkRedis = async () => {
  try {
    const client = getRedisClient();
    const pong = await client.ping();
    return pong === 'PONG' ? { status: 'up' } : { status: 'down', error: `Unexpected ping response: ${pong}` };
  } catch (err) {
    return { status: 'down', error: err.message };
  }
};

const getHealthStatus = async () => {
  const [mongo, redis] = await Promise.all([checkMongoDB(), checkRedis()]);
  const allUp = mongo.status === 'up' && redis.status === 'up';

  return {
    status: allUp ? 'ok' : 'degraded',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    services: { mongodb: mongo, redis }
  };
};

module.exports = { getHealthStatus };
