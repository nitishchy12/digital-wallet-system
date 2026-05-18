// Purpose: Prove dispute system — raise, escrow, resolve, reject
// Dependencies: real MongoDB, real Redis
// Run: cd backend && npx jest __tests__/dispute.test.js --runInBand --forceExit

require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { app } = require('../server');
const Dispute = require('../models/Dispute');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const User = require('../models/User');
const { getRedisClient } = require('../utils/redis');

const TEST_PASS = 'Dispute@1234';
let sender, receiver, admin;
let senderWallet, receiverWallet;
let senderToken, receiverToken, adminToken;
let seedTransaction;

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

  // Create users directly — bypasses rate limits
  sender = await User.findOneAndUpdate(
    { email: `dispute-sender-${ts}@test.com` },
    { $setOnInsert: { name: 'Dispute Sender', email: `dispute-sender-${ts}@test.com`, phone: `9${Math.floor(100000000 + Math.random() * 900000000)}`, password: hashed, isVerified: true, isActive: true, role: 'user', kycTier: 1 } },
    { upsert: true, new: true }
  );
  receiver = await User.findOneAndUpdate(
    { email: `dispute-receiver-${ts}@test.com` },
    { $setOnInsert: { name: 'Dispute Receiver', email: `dispute-receiver-${ts}@test.com`, phone: `9${Math.floor(100000000 + Math.random() * 900000000)}`, password: hashed, isVerified: true, isActive: true, role: 'user', kycTier: 1 } },
    { upsert: true, new: true }
  );
  admin = await User.findOneAndUpdate(
    { email: `dispute-admin-${ts}@test.com` },
    { $setOnInsert: { name: 'Dispute Admin', email: `dispute-admin-${ts}@test.com`, phone: `9${Math.floor(100000000 + Math.random() * 900000000)}`, password: hashed, isVerified: true, isActive: true, role: 'admin', kycTier: 1 } },
    { upsert: true, new: true }
  );

  senderWallet = await Wallet.findOneAndUpdate(
    { userId: sender._id },
    { $setOnInsert: { userId: sender._id, balance: 5000, currency: 'INR', escrowHeld: 0 } },
    { upsert: true, new: true }
  );
  receiverWallet = await Wallet.findOneAndUpdate(
    { userId: receiver._id },
    { $setOnInsert: { userId: receiver._id, balance: 2000, currency: 'INR', escrowHeld: 0 } },
    { upsert: true, new: true }
  );

  // A completed TRANSFER transaction — senderId/receiverId are User IDs
  const crypto = require('crypto');
  seedTransaction = await Transaction.create({
    transactionId: crypto.randomBytes(12).toString('hex'),
    senderId: sender._id,
    receiverId: receiver._id,
    amount: 500,
    type: 'TRANSFER',
    status: 'SUCCESS',
    paymentGateway: 'INTERNAL',
    description: 'Test transfer for dispute',
    processedAt: new Date(),
    idempotencyKey: `dispute-seed-${ts}`
  });

  // Login to get tokens
  const [sl, rl, al] = await Promise.all([
    request(app).post('/api/auth/login').send({ email: sender.email, password: TEST_PASS }),
    request(app).post('/api/auth/login').send({ email: receiver.email, password: TEST_PASS }),
    request(app).post('/api/auth/login').send({ email: admin.email, password: TEST_PASS })
  ]);
  senderToken   = sl.body.data?.accessToken;
  receiverToken = rl.body.data?.accessToken;
  adminToken    = al.body.data?.accessToken;
}, 30000);

afterAll(async () => {
  const ids = [sender?._id, receiver?._id, admin?._id].filter(Boolean);
  await Dispute.deleteMany({ raisedBy: sender?._id });
  await Transaction.deleteMany({ $or: [{ senderId: sender?._id }, { receiverId: sender?._id }] });
  await Wallet.deleteMany({ userId: { $in: ids } });
  await User.deleteMany({ _id: { $in: ids } });
  await flushRateLimits();
});

describe('Dispute System', () => {

  // ── Test 1: Sender raises dispute within 24h ─────────────────────────────
  test('sender can raise dispute within 24h window', async () => {
    const res = await request(app)
      .post('/api/disputes')
      .set('Authorization', `Bearer ${senderToken}`)
      .send({
        transactionId: seedTransaction._id.toString(),
        reason: 'I did not authorize this transfer to this person at all'
      });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.escrowNote).toContain('escrow');

    const wallet = await Wallet.findOne({ userId: sender._id });
    expect(wallet.escrowHeld).toBe(500);
  }, 15000);

  // ── Test 2: Duplicate dispute returns 409 ────────────────────────────────
  test('duplicate dispute on same transaction returns 409', async () => {
    const res = await request(app)
      .post('/api/disputes')
      .set('Authorization', `Bearer ${senderToken}`)
      .send({
        transactionId: seedTransaction._id.toString(),
        reason: 'I did not authorize this transfer to this person at all'
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('DISPUTE_ALREADY_EXISTS');
  });

  // ── Test 3: Receiver cannot dispute incoming transfer ─────────────────────
  test('receiver cannot dispute incoming transfer', async () => {
    const res = await request(app)
      .post('/api/disputes')
      .set('Authorization', `Bearer ${receiverToken}`)
      .send({
        transactionId: seedTransaction._id.toString(),
        reason: 'I did not authorize this transfer to this person at all'
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('NOT_AUTHORIZED');
  });

  // ── Test 4: Dispute after 24h window returns 400 ─────────────────────────
  test('dispute after 24h window returns 400 DISPUTE_WINDOW_EXPIRED', async () => {
    const crypto = require('crypto');
    const oldTxn = await Transaction.create({
      transactionId: crypto.randomBytes(12).toString('hex'),
      senderId: sender._id,
      receiverId: receiver._id,
      amount: 100,
      type: 'TRANSFER',
      status: 'SUCCESS',
      paymentGateway: 'INTERNAL',
      description: 'Old transaction',
      processedAt: new Date(Date.now() - 25 * 3600000),
      idempotencyKey: `dispute-old-${Date.now()}`
    });
    // Backdate createdAt using raw MongoDB to simulate a 25h old transaction
    await Transaction.collection.updateOne(
      { _id: oldTxn._id },
      { $set: { createdAt: new Date(Date.now() - 25 * 3600000) } }
    );

    const res = await request(app)
      .post('/api/disputes')
      .set('Authorization', `Bearer ${senderToken}`)
      .send({
        transactionId: oldTxn._id.toString(),
        reason: 'I did not authorize this transfer to this person at all'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('DISPUTE_WINDOW_EXPIRED');
  }, 15000);

  // ── Test 5: Admin resolves — money returns, original unchanged ───────────
  test('admin resolve: money returns to sender, original transaction unchanged', async () => {
    const dispute = await Dispute.findOne({ raisedBy: sender._id, status: 'pending' });
    expect(dispute).not.toBeNull();

    const senderBefore   = await Wallet.findOne({ userId: sender._id });
    const receiverBefore = await Wallet.findOne({ userId: receiver._id });

    const res = await request(app)
      .post('/api/disputes/admin/resolve')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        disputeId: dispute._id.toString(),
        resolutionNote: 'Verified sender did not authorize this transaction'
      });

    expect(res.status).toBe(200);
    expect(res.body.data.amountReturned).toBe(500);

    // Original transaction status is UNCHANGED
    const original = await Transaction.findById(seedTransaction._id);
    expect(original.status).toBe('SUCCESS');

    // Compensating transaction created with correct type
    const compTxn = await Transaction.findById(res.body.data.compensatingTransactionId);
    expect(compTxn.type).toBe('DISPUTE_REVERSAL');
    expect(compTxn.amount).toBe(500);

    // Balances correct
    const senderAfter   = await Wallet.findOne({ userId: sender._id });
    const receiverAfter = await Wallet.findOne({ userId: receiver._id });
    expect(senderAfter.balance).toBe(senderBefore.balance + 500);
    expect(receiverAfter.balance).toBe(receiverBefore.balance - 500);
    expect(senderAfter.escrowHeld).toBe(0);
  }, 15000);

  // ── Test 6: Admin rejects — escrow released, no balance change ───────────
  test('admin reject: escrow released, no money moves', async () => {
    const crypto = require('crypto');
    const newTxn = await Transaction.create({
      transactionId: crypto.randomBytes(12).toString('hex'),
      senderId: sender._id,
      receiverId: receiver._id,
      amount: 200,
      type: 'TRANSFER',
      status: 'SUCCESS',
      paymentGateway: 'INTERNAL',
      description: 'Reject test transaction',
      processedAt: new Date(),
      idempotencyKey: `dispute-reject-${Date.now()}`
    });

    const newDispute = await Dispute.create({
      transactionId: newTxn._id,
      raisedBy: sender._id,
      againstUserId: receiver._id,
      amount: 200,
      reason: 'Testing rejection flow for this exact transaction please',
      escrowAmount: 200,
      status: 'pending',
      timeline: [{ status: 'pending', changedBy: sender._id, note: 'Test' }]
    });
    await Wallet.findOneAndUpdate({ userId: sender._id }, { $inc: { escrowHeld: 200 } });

    const escrowBefore = (await Wallet.findOne({ userId: sender._id })).escrowHeld;
    const balBefore    = (await Wallet.findOne({ userId: sender._id })).balance;

    const res = await request(app)
      .post('/api/disputes/admin/reject')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        disputeId: newDispute._id.toString(),
        resolutionNote: 'Transfer was legitimate and authorized by user'
      });

    expect(res.status).toBe(200);

    const updated = await Dispute.findById(newDispute._id);
    expect(updated.status).toBe('rejected');

    const walletAfter = await Wallet.findOne({ userId: sender._id });
    expect(walletAfter.escrowHeld).toBe(escrowBefore - 200);
    // Balance unchanged on rejection
    expect(walletAfter.balance).toBe(balBefore);
  }, 15000);

  // ── Test 7: Transfer blocked when balance is insufficient due to escrow ───
  test('transfer blocked when effective balance < amount due to escrow', async () => {
    await Wallet.findOneAndUpdate(
      { userId: sender._id },
      { balance: 500, escrowHeld: 450 }
    );

    const res = await request(app)
      .post('/api/wallet/transfer')
      .set('Authorization', `Bearer ${senderToken}`)
      .send({
        receiverEmail: receiver.email,
        amount: 200,
        description: 'Should fail due to escrow'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INSUFFICIENT_FUNDS');
    expect(res.body.message).toContain('escrow');
  }, 15000);

});
