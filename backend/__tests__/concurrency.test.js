// Purpose: Prove distributed lock prevents double-spend under real concurrent load
// Dependencies: real MongoDB, real Redis
// Run: cd backend && npx jest __tests__/concurrency.test.js --runInBand --forceExit

require('dotenv').config();
const request = require('supertest');
const { app } = require('../server');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const { getRedisClient } = require('../utils/redis');

const TEST_PASS = 'Conc@1234';
let sender, receiver, senderWallet, receiverWallet, senderToken;

const flushRateLimits = async () => {
  try {
    const redis = getRedisClient();
    const keys = await redis.keys('ratelimit:*');
    if (keys.length) await redis.del(...keys);
  } catch (_) {}
};

beforeAll(async () => {
  await flushRateLimits();

  // Plain-text password — pre-save hook hashes it once. bcrypt.hash + User.create
  // causes double-hashing which breaks login.
  const ts = Date.now();

  sender = await User.create({
    name: 'Concurrency Sender',
    email: `conc-sender-${ts}@test.com`,
    phone: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
    password: TEST_PASS,
    isVerified: true,
    isActive: true,
    kycTier: 2
  });

  receiver = await User.create({
    name: 'Concurrency Receiver',
    email: `conc-receiver-${ts}@test.com`,
    phone: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
    password: TEST_PASS,
    isVerified: true,
    isActive: true,
    kycTier: 2
  });

  senderWallet = await Wallet.create({ userId: sender._id, balance: 10000, escrowHeld: 0 });
  receiverWallet = await Wallet.create({ userId: receiver._id, balance: 0 });

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: sender.email, password: TEST_PASS });
  senderToken = loginRes.body.data?.accessToken;
}, 30000);

afterAll(async () => {
  // senderId on Transaction is a User ObjectId, not a Wallet ObjectId
  await Transaction.deleteMany({ $or: [{ senderId: sender._id }, { receiverId: receiver._id }] });
  await Wallet.deleteMany({ userId: { $in: [sender._id, receiver._id] } });
  await User.deleteMany({ _id: { $in: [sender._id, receiver._id] } });
  await flushRateLimits();
});

describe('Concurrency — Distributed Lock', () => {

  // ── Test 1: Same idempotency key 10× — exactly 1 debit ─────────────────
  test('10 simultaneous transfers same idempotency key — exactly 1 debit', async () => {
    await Wallet.findByIdAndUpdate(senderWallet._id, { balance: 5000, escrowHeld: 0 });
    await Wallet.findByIdAndUpdate(receiverWallet._id, { balance: 0 });

    const idempotencyKey = `conc-idem-${Date.now()}`;

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app)
          .post('/api/wallet/transfer')
          .set('Authorization', `Bearer ${senderToken}`)
          .set('x-idempotency-key', idempotencyKey)
          .send({ receiverEmail: receiver.email, amount: 500, description: 'Idempotency test' })
      )
    );

    // 200 = transfer went through, 409 = lock held (request arrived before cache populated)
    // Both are correct — the KEY invariant is that only 1 debit happened (checked below)
    results.forEach((r) => expect([200, 201, 409]).toContain(r.status));

    // Exactly 1 Transaction created for this idempotency key
    // senderId on Transaction is User ObjectId
    const txnCount = await Transaction.countDocuments({
      senderId: sender._id,
      idempotencyKey
    });
    expect(txnCount).toBe(1);

    // Balance debited exactly once
    const updatedSender = await Wallet.findById(senderWallet._id);
    expect(updatedSender.balance).toBe(4500);
  }, 30000);

  // ── Test 2: Different keys, same wallet — balance never negative ─────────
  test('2 simultaneous transfers different keys — balance never negative', async () => {
    // Exactly ₹800: only one ₹500 transfer can succeed
    await Wallet.findByIdAndUpdate(senderWallet._id, { balance: 800, escrowHeld: 0 });
    await Wallet.findByIdAndUpdate(receiverWallet._id, { balance: 0 });

    const [r1, r2] = await Promise.all([
      request(app)
        .post('/api/wallet/transfer')
        .set('Authorization', `Bearer ${senderToken}`)
        .set('x-idempotency-key', `conc-key1-${Date.now()}`)
        .send({ receiverEmail: receiver.email, amount: 500 }),
      request(app)
        .post('/api/wallet/transfer')
        .set('Authorization', `Bearer ${senderToken}`)
        .set('x-idempotency-key', `conc-key2-${Date.now()}`)
        .send({ receiverEmail: receiver.email, amount: 500 })
    ]);

    const statuses = [r1.status, r2.status];
    // One succeeds (200), one fails (400 insufficient or 409 lock contention)
    expect(statuses).toContain(200);
    expect(statuses.some((s) => s === 400 || s === 409)).toBe(true);

    // Balance never went negative
    const finalWallet = await Wallet.findById(senderWallet._id);
    expect(finalWallet.balance).toBeGreaterThanOrEqual(0);
  }, 30000);

  // ── Test 3: 5 concurrent transfers — arithmetic is exact ─────────────────
  test('5 transfers — total debit matches successful count × amount', async () => {
    await Wallet.findByIdAndUpdate(senderWallet._id, { balance: 3000, escrowHeld: 0 });
    await Wallet.findByIdAndUpdate(receiverWallet._id, { balance: 0 });

    const amount = 400;
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        request(app)
          .post('/api/wallet/transfer')
          .set('Authorization', `Bearer ${senderToken}`)
          .set('x-idempotency-key', `conc-multi-${Date.now()}-${i}`)
          .send({ receiverEmail: receiver.email, amount })
      )
    );

    // Count how many actually succeeded (200 = transfer went through)
    const successCount = results.filter((r) => r.status === 200).length;

    const finalSender   = await Wallet.findById(senderWallet._id);
    const finalReceiver = await Wallet.findById(receiverWallet._id);

    // Arithmetic must be exact — no phantom debits or credits
    expect(finalSender.balance).toBe(3000 - successCount * amount);
    expect(finalReceiver.balance).toBe(successCount * amount);
    expect(finalSender.balance).toBeGreaterThanOrEqual(0);
  }, 30000);

});
