// Purpose: BullMQ producer for delayed transfer jobs
// Dependencies: redis.js
// Used by: scheduledController.js, scheduledWorker.js

const { Queue } = require('bullmq');
const { createBullMQConnection } = require('../utils/redis');

let scheduledQueue = null;

const getScheduledQueue = () => {
  if (!scheduledQueue) {
    scheduledQueue = new Queue('scheduled-transfers', {
      connection: createBullMQConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 50,
        removeOnFail: 200
      }
    });
    scheduledQueue.on('error', (err) => {
      const logger = require('../utils/logger');
      logger.error('Scheduled queue error: %s', err.message);
    });
  }
  return scheduledQueue;
};

const scheduleTransferJob = async (scheduledTransferId, scheduledAt) => {
  const queue = getScheduledQueue();
  const delay = Math.max(0, new Date(scheduledAt).getTime() - Date.now());

  const job = await queue.add(
    'execute-transfer',
    { scheduledTransferId: scheduledTransferId.toString() },
    { delay }
  );
  return job.id;
};

const cancelTransferJob = async (jobId) => {
  const queue = getScheduledQueue();
  try {
    const job = await queue.getJob(jobId);
    if (job) await job.remove();
    return true;
  } catch (_) {
    return false;
  }
};

module.exports = { getScheduledQueue, scheduleTransferJob, cancelTransferJob };
