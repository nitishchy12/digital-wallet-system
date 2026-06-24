// Purpose: Prove double-entry ledger writes on every transfer
// Dependencies: real MongoDB, real Redis
// Run: cd backend && npx jest __tests__/ledger.test.js --runInBand --forceExit

require('dotenv').config();
const request = require('supertest');
const { app } = require('../server');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const LedgerEntry = require('../models/LedgerEntry');
const { getRedisClient } = require('../utils/redis');

const TEST_PASS = 'Ledger@1234';
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

  // Pass plain-text password so the pre-save hook hashes it exactly once.
  // bcrypt.hash + User.create causes double-hashing which breaks login.
  const ts = Date.now();

  sender = await User.create({
    name: 'Ledger Sender',
    email: `ledger-sender-${ts}@test.com`,
    phone: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
    password: TEST_PASS,
    isVerified: true,
    isActive: true,
    kycTier: 1
  });

  receiver = await User.create({
    name: 'Ledger Receiver',
    email: `ledger-receiver-${ts}@test.com`,
    phone: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
    password: TEST_PASS,
    isVerified: true,
    isActive: true,
    kycTier: 0
  });

  senderWallet = await Wallet.create({ userId: sender._id, balance: 5000, escrowHeld: 0 });
  receiverWallet = await Wallet.create({ userId: receiver._id, balance: 1000 });

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: sender.email, password: TEST_PASS });
  senderToken = loginRes.body.data?.accessToken;
}, 30000);

afterAll(async () => {
  await LedgerEntry.deleteMany({ walletId: { $in: [senderWallet._id, receiverWallet._id] } });
  await Wallet.deleteMany({ userId: { $in: [sender._id, receiver._id] } });
  await User.deleteMany({ _id: { $in: [sender._id, receiver._id] } });
  await flushRateLimits();
});

describe('Double-Entry Ledger', () => {

  // ── Test 1: Exactly 2 entries per transfer ────────────────────────────────
  test('every transfer creates exactly 2 ledger entries (1 DEBIT + 1 CREDIT)', async () => {
    const res = await request(app)
      .post('/api/wallet/transfer')
      .set('Authorization', `Bearer ${senderToken}`)
      .set('x-idempotency-key', `ledger-test-${Date.now()}`)
      .send({ receiverEmail: receiver.email, amount: 300 });

    expect(res.status).toBe(200);

    // transactionId is the MongoDB ObjectId added to the response in walletController
    const txnId = res.body.data?.transactionId;
    expect(txnId).toBeDefined();

    const entries = await LedgerEntry.find({ transactionId: txnId });
    expect(entries).toHaveLength(2);

    expect(entries.find((e) => e.type === 'DEBIT')).toBeDefined();
    expect(entries.find((e) => e.type === 'CREDIT')).toBeDefined();
  }, 15000);

  // ── Test 2: DEBIT entry has correct balanceBefore / balanceAfter ──────────
  test('debit entry: walletId=sender, balanceBefore and balanceAfter correct', async () => {
    // Read balance BEFORE transfer (pre-debit)
    const senderBalanceBefore = (await Wallet.findById(senderWallet._id)).balance;
    const amount = 200;

    const res = await request(app)
      .post('/api/wallet/transfer')
      .set('Authorization', `Bearer ${senderToken}`)
      .set('x-idempotency-key', `ledger-debit-${Date.now()}`)
      .send({ receiverEmail: receiver.email, amount });

    expect(res.status).toBe(200);

    const txnId = res.body.data?.transactionId;
    const debit = await LedgerEntry.findOne({ transactionId: txnId, type: 'DEBIT' });

    expect(debit).not.toBeNull();
    expect(debit.walletId.toString()).toBe(senderWallet._id.toString());
    expect(debit.amount).toBe(amount);
    expect(debit.balanceBefore).toBe(senderBalanceBefore);
    expect(debit.balanceAfter).toBe(senderBalanceBefore - amount);
  }, 15000);

  // ── Test 3: Sum of debits equals sum of credits ───────────────────────────
  test('sum of debits equals sum of credits for the same transaction', async () => {
    const res = await request(app)
      .post('/api/wallet/transfer')
      .set('Authorization', `Bearer ${senderToken}`)
      .set('x-idempotency-key', `ledger-balance-${Date.now()}`)
      .send({ receiverEmail: receiver.email, amount: 250 });

    expect(res.status).toBe(200);

    const txnId = res.body.data?.transactionId;
    const entries = await LedgerEntry.find({ transactionId: txnId });

    const totalDebits  = entries.filter((e) => e.type === 'DEBIT') .reduce((s, e) => s + e.amount, 0);
    const totalCredits = entries.filter((e) => e.type === 'CREDIT').reduce((s, e) => s + e.amount, 0);

    expect(totalDebits).toBe(totalCredits);
  }, 15000);

  // ── Test 4: counterpartyWalletId cross-references ────────────────────────
  test('debit.counterparty = receiverWallet, credit.counterparty = senderWallet', async () => {
    const res = await request(app)
      .post('/api/wallet/transfer')
      .set('Authorization', `Bearer ${senderToken}`)
      .set('x-idempotency-key', `ledger-counterparty-${Date.now()}`)
      .send({ receiverEmail: receiver.email, amount: 100 });

    expect(res.status).toBe(200);

    const txnId = res.body.data?.transactionId;
    const entries = await LedgerEntry.find({ transactionId: txnId });

    const debit  = entries.find((e) => e.type === 'DEBIT');
    const credit = entries.find((e) => e.type === 'CREDIT');

    expect(debit.counterpartyWalletId.toString()).toBe(receiverWallet._id.toString());
    expect(credit.counterpartyWalletId.toString()).toBe(senderWallet._id.toString());
  }, 15000);

});
