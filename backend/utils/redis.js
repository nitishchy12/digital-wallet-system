// Purpose: Singleton ioredis client — one connection shared across the entire process
// Dependencies: ioredis
// Used by: distributedLock.js, rateLimiter.js, balanceCache.js

const Redis = require('ioredis');
const logger = require('./logger');

let client = null;

const createClient = () => {
  const c = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    commandTimeout: 3000,
    retryStrategy: (times) => {
      if (times > 5) {
        logger.warn('Redis: max retry attempts reached — giving up reconnect');
        return null;
      }
      return Math.min(times * 200, 2000);
    }
  });

  c.on('connect',      () => logger.info('Redis connected'));
  c.on('ready',        () => logger.info('Redis ready'));
  c.on('error',        (err) => logger.error('Redis error: %s', err.message));
  c.on('reconnecting', () => logger.warn('Redis reconnecting...'));
  c.on('end', () => {
    logger.warn('Redis connection closed');
    client = null;
  });

  return c;
};

const getRedisClient = () => {
  if (!client) client = createClient();
  return client;
};

const createBullMQConnection = () => {
  return new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times) => Math.min(times * 200, 3000)
  });
};

module.exports = { getRedisClient, createBullMQConnection };
