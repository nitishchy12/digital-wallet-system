// Purpose: Prove health endpoint works and error handler never leaks stack traces
// Dependencies: real MongoDB, real Redis
// Run: cd backend && npx jest __tests__/health.test.js --runInBand --forceExit

require('dotenv').config();
const request = require('supertest');
const { app } = require('../server');

describe('Health Check', () => {

  test('returns 200 when all services are up', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.services.mongodb.status).toBe('up');
    expect(res.body.services.redis.status).toBe('up');
    expect(res.body.uptime).toBeGreaterThan(0);
    expect(res.body.timestamp).toBeDefined();
  });

  test('response includes all required fields', async () => {
    const res = await request(app).get('/api/health');

    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('services');
    expect(res.body.services).toHaveProperty('mongodb');
    expect(res.body.services).toHaveProperty('redis');
  });

  test('uptime increases over time', async () => {
    const res1 = await request(app).get('/api/health');
    await new Promise((r) => setTimeout(r, 1100));
    const res2 = await request(app).get('/api/health');

    expect(res2.body.uptime).toBeGreaterThanOrEqual(res1.body.uptime);
  }, 10000);

});

describe('Error Handler', () => {

  test('unknown route returns 404 not 500', async () => {
    const res = await request(app).get('/api/nonexistent-route-xyz');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  test('invalid JWT returns 401 without stack trace', async () => {
    const res = await request(app)
      .post('/api/wallet/transfer')
      .set('Authorization', 'Bearer this.is.not.a.valid.jwt')
      .send({ receiverEmail: 'test@test.com', amount: 100 });

    expect(res.status).toBe(401);
    expect(res.body.stack).toBeUndefined();
    expect(res.body.success).toBe(false);
  });

  test('malformed JSON body returns 400 not 500', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{ this is : invalid json }');

    expect(res.status).toBe(400);
    expect(res.body.stack).toBeUndefined();
  });

  test('error response shape is consistent', async () => {
    const res = await request(app).get('/api/nonexistent-route-xyz');

    // Every error response must have these fields
    expect(res.body).toHaveProperty('success', false);
    expect(res.body).toHaveProperty('error');
    expect(res.body).toHaveProperty('message');
    // Stack trace must NEVER be present
    expect(res.body.stack).toBeUndefined();
  });

});
