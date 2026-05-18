// Purpose: Prove scheduled transfer CRUD — create, list, cancel, validation
// Dependencies: real MongoDB, real Redis
// Run: cd backend && npx jest __tests__/scheduled.test.js --runInBand --forceExit

require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { app } = require('../server');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const ScheduledTransfer = require('../models/ScheduledTransfer');
const { getRedisClient } = require('../utils/redis');

const TEST_PASS = 'Sched@1234';
let sender, receiver, senderToken;

const flushRateLimits = async () => {
  try {
    const redis = getRedisClient();
    const keys = await redis.keys('ratelimit:*');
    if (keys.length) await redis.del(...keys);
  } catch (_) {}
};

beforeAll(async () => {
  await flushRateLimits();

  const hashed = await bcrypt.hash(TEST_PASS, 10);
  const ts = Date.now();

  sender = await User.findOneAndUpdate(
    { email: `sched-sender-${ts}@test.com` },
    { $setOnInsert: { name: 'Sched Sender', email: `sched-sender-${ts}@test.com`, phone: `9${Math.floor(100000000 + Math.random() * 900000000)}`, password: hashed, isVerified: true, isActive: true, role: 'user', kycTier: 1 } },
    { upsert: true, new: true }
  );
  receiver = await User.findOneAndUpdate(
    { email: `sched-receiver-${ts}@test.com` },
    { $setOnInsert: { name: 'Sched Receiver', email: `sched-receiver-${ts}@test.com`, phone: `9${Math.floor(100000000 + Math.random() * 900000000)}`, password: hashed, isVerified: true, isActive: true, role: 'user', kycTier: 1 } },
    { upsert: true, new: true }
  );

  await Wallet.findOneAndUpdate(
    { userId: sender._id },
    { $setOnInsert: { userId: sender._id, balance: 10000, currency: 'INR' } },
    { upsert: true, new: true }
  );
  await Wallet.findOneAndUpdate(
    { userId: receiver._id },
    { $setOnInsert: { userId: receiver._id, balance: 1000, currency: 'INR' } },
    { upsert: true, new: true }
  );

  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: sender.email, password: TEST_PASS });
  senderToken = login.body.data?.accessToken;
}, 30000);

afterAll(async () => {
  await ScheduledTransfer.deleteMany({ userId: sender?._id });
  await Wallet.deleteMany({ userId: { $in: [sender?._id, receiver?._id] } });
  await User.deleteMany({ _id: { $in: [sender?._id, receiver?._id] } });
  await flushRateLimits();
});

describe('Scheduled Transfers', () => {

  test('create scheduled transfer in the future returns 201 with jobId', async () => {
    const futureDate = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const res = await request(app)
      .post('/api/scheduled-transfers')
      .set('Authorization', `Bearer ${senderToken}`)
      .send({ receiverEmail: receiver.email, amount: 500, description: 'Monthly rent', scheduledAt: futureDate });

    expect(res.status).toBe(201);
    expect(res.body.data.scheduledTransferId).toBeDefined();
    expect(res.body.data.jobId).toBeDefined();
    expect(res.body.data.amount).toBe(500);
  }, 15000);

  test('cannot schedule transfer in the past', async () => {
    const pastDate = new Date(Date.now() - 60000).toISOString();

    const res = await request(app)
      .post('/api/scheduled-transfers')
      .set('Authorization', `Bearer ${senderToken}`)
      .send({ receiverEmail: receiver.email, amount: 100, scheduledAt: pastDate });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_SCHEDULED_TIME');
  });

  test('cannot schedule transfer to self', async () => {
    const futureDate = new Date(Date.now() + 3600000).toISOString();

    const res = await request(app)
      .post('/api/scheduled-transfers')
      .set('Authorization', `Bearer ${senderToken}`)
      .send({ receiverEmail: sender.email, amount: 100, scheduledAt: futureDate });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('SELF_TRANSFER');
  });

  test('cannot schedule transfer to unknown receiver', async () => {
    const futureDate = new Date(Date.now() + 3600000).toISOString();

    const res = await request(app)
      .post('/api/scheduled-transfers')
      .set('Authorization', `Bearer ${senderToken}`)
      .send({ receiverEmail: 'nobody@nowhere.com', amount: 100, scheduledAt: futureDate });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('RECEIVER_NOT_FOUND');
  });

  test('list scheduled transfers returns array', async () => {
    const res = await request(app)
      .get('/api/scheduled-transfers')
      .set('Authorization', `Bearer ${senderToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  test('cancel pending scheduled transfer sets status to cancelled', async () => {
    const futureDate = new Date(Date.now() + 3600000).toISOString();

    const create = await request(app)
      .post('/api/scheduled-transfers')
      .set('Authorization', `Bearer ${senderToken}`)
      .send({ receiverEmail: receiver.email, amount: 200, scheduledAt: futureDate });

    const scheduledId = create.body.data.scheduledTransferId;

    const cancel = await request(app)
      .delete(`/api/scheduled-transfers/${scheduledId}`)
      .set('Authorization', `Bearer ${senderToken}`);

    expect(cancel.status).toBe(200);

    const updated = await ScheduledTransfer.findById(scheduledId);
    expect(updated.status).toBe('cancelled');
  }, 15000);

  test('cannot cancel already completed transfer', async () => {
    const scheduled = await ScheduledTransfer.create({
      userId: sender._id,
      receiverEmail: receiver.email,
      amount: 100,
      scheduledAt: new Date(Date.now() + 3600000),
      status: 'completed'
    });

    const res = await request(app)
      .delete(`/api/scheduled-transfers/${scheduled._id}`)
      .set('Authorization', `Bearer ${senderToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('CANNOT_CANCEL');
  }, 10000);

});

describe('PDF Receipt', () => {

  test('receipt endpoint returns a PDF buffer for a transaction the user owns', async () => {
    // Make a real transfer so we have a Transaction in the DB
    const transferRes = await request(app)
      .post('/api/wallet/transfer')
      .set('Authorization', `Bearer ${senderToken}`)
      .send({ receiverEmail: receiver.email, amount: 50, description: 'Receipt test' });

    expect(transferRes.status).toBe(200);
    const txnId = transferRes.body.data.transaction._id;

    const receiptRes = await request(app)
      .get(`/api/wallet/transactions/${txnId}/receipt`)
      .set('Authorization', `Bearer ${senderToken}`);

    expect(receiptRes.status).toBe(200);
    expect(receiptRes.headers['content-type']).toContain('application/pdf');
    expect(receiptRes.headers['content-disposition']).toContain('attachment');
    expect(receiptRes.body).toBeTruthy();
  }, 20000);

  test('receipt endpoint returns 403 for a transaction the user is not party to', async () => {
    // Login as receiver and try to access a transaction where receiver is neither party
    const Transaction = require('../models/Transaction');
    const crypto = require('crypto');

    // Create a third user
    const thirdHashed = await bcrypt.hash(TEST_PASS, 10);
    const third = await User.findOneAndUpdate(
      { email: `sched-third-${Date.now()}@test.com` },
      { $setOnInsert: { name: 'Third', email: `sched-third-${Date.now()}@test.com`, phone: `9${Math.floor(100000000 + Math.random() * 900000000)}`, password: thirdHashed, isVerified: true, isActive: true, role: 'user', kycTier: 0 } },
      { upsert: true, new: true }
    );
    await Wallet.findOneAndUpdate(
      { userId: third._id },
      { $setOnInsert: { userId: third._id, balance: 100, currency: 'INR' } },
      { upsert: true, new: true }
    );

    // Create a transaction between sender and receiver that third has no part in
    const txn = await Transaction.create({
      transactionId: crypto.randomBytes(12).toString('hex'),
      senderId: sender._id,
      receiverId: receiver._id,
      amount: 10,
      type: 'TRANSFER',
      status: 'SUCCESS',
      paymentGateway: 'INTERNAL',
      processedAt: new Date()
    });

    // Login as third
    const thirdLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: third.email, password: TEST_PASS });
    const thirdToken = thirdLogin.body.data?.accessToken;

    const res = await request(app)
      .get(`/api/wallet/transactions/${txn._id}/receipt`)
      .set('Authorization', `Bearer ${thirdToken}`);

    expect(res.status).toBe(403);

    await User.deleteOne({ _id: third._id });
    await Wallet.deleteOne({ userId: third._id });
  }, 20000);

});
