// Purpose: BullMQ producer — enqueues notification jobs after financial events
// Dependencies: bullmq, redis.js
// Used by: walletController.js, paymentController.js

const { Queue } = require('bullmq');
const { createBullMQConnection } = require('./redis');
const logger = require('./logger');

let notificationQueue = null;

const getNotificationQueue = () => {
  if (!notificationQueue) {
    notificationQueue = new Queue('notifications', {
      connection: createBullMQConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 100 }, // 100ms → 200ms → 400ms
        removeOnComplete: 100,   // keep last 100 completed for inspection
        removeOnFail: 500        // keep last 500 failed for debugging
      }
    });

    notificationQueue.on('error', (err) => {
      logger.error('Notification queue error: %s', err.message);
    });
  }
  return notificationQueue;
};

/**
 * Add a notification job to the queue.
 * NEVER throws — queue failure must never affect the transfer response.
 */
const enqueueNotification = async (type, payload) => {
  try {
    const queue = getNotificationQueue();
    const job = await queue.add(type, payload);
    logger.info('Notification enqueued type=%s jobId=%s', type, job.id);
  } catch (err) {
    logger.error('Failed to enqueue notification type=%s: %s', type, err.message);
    // Swallowed intentionally — transfer already succeeded
  }
};

module.exports = { enqueueNotification, getNotificationQueue };
