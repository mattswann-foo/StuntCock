// Tests for the /api/iap/* routes middleware logic.
// Exercises the requireJwt middleware, validate endpoint, and entitlement endpoint
// using a minimal Express app built from the same handlers as server.js.
// No native SQLite bindings required — iapValidator is fully mocked.

'use strict';

const express = require('express');
const request = require('supertest');

// ---------------------------------------------------------------------------
// Mock iapValidator so tests don't touch any DB or external APIs
// Variable names MUST start with "mock" for Jest's factory scope guard.
// ---------------------------------------------------------------------------

const mockValidateAndPersist = jest.fn();
const mockGetEntitlementForUser = jest.fn();

jest.mock('../iapValidator', () => ({
  validateAndPersist: mockValidateAndPersist,
  getEntitlementForUser: mockGetEntitlementForUser,
  upsertEntitlement: jest.fn(),
  _db: null,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal JWT for tests.
 * @param {object} overrides
 */
function buildTestJwt(overrides = {}) {
  const payload = {
    sub: 'test-user-001',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
  const b64url = (obj) =>
    Buffer.from(JSON.stringify(obj)).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.fake-sig`;
}

function buildExpiredJwt() {
  return buildTestJwt({ exp: Math.floor(Date.now() / 1000) - 3600 });
}

// ---------------------------------------------------------------------------
// Build a minimal test app with the same middleware as server.js IAP section
// ---------------------------------------------------------------------------

function createTestApp() {
  const app = express();
  app.use(express.json());

  const iapValidator = require('../iapValidator');

  function requireJwt(req, res, next) {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Authorization required' });
    try {
      const parts = token.split('.');
      if (parts.length !== 3) throw new Error('Malformed JWT');
      const payload = JSON.parse(
        Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
      );
      if (!payload.sub) throw new Error('JWT missing sub claim');
      if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
        throw new Error('JWT expired');
      }
      req.jwtPayload = payload;
      next();
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }

  app.post('/api/iap/validate', requireJwt, async (req, res) => {
    const rawReceipt = req.body.receipt;
    const { platform, productId } = req.body;
    if (!platform || !rawReceipt || !productId) {
      return res.status(400).json({ error: 'platform, receipt, and productId are required' });
    }
    if (platform !== 'ios' && platform !== 'android') {
      return res.status(400).json({ error: 'platform must be ios or android' });
    }
    try {
      const result = await iapValidator.validateAndPersist({
        platform,
        receipt: rawReceipt,
        productId,
        userId: req.jwtPayload.sub,
      });
      res.json(result);
    } catch {
      res.status(402).json({ error: 'Receipt validation failed' });
    }
  });

  app.get('/api/iap/entitlement', requireJwt, (req, res) => {
    const entitlement = iapValidator.getEntitlementForUser(req.jwtPayload.sub);
    if (!entitlement) return res.status(404).json({ error: 'No entitlement found' });
    res.json(entitlement);
  });

  return app;
}

// ---------------------------------------------------------------------------
// POST /api/iap/validate
// ---------------------------------------------------------------------------

describe('POST /api/iap/validate', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
    mockValidateAndPersist.mockReset();
    mockGetEntitlementForUser.mockReset();
  });

  it('returns 401 when Authorization header is absent', async () => {
    const res = await request(app)
      .post('/api/iap/validate')
      .send({ platform: 'ios', receipt: 'abc', productId: 'prod' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Authorization required/i);
  });

  it('returns 401 for an expired JWT', async () => {
    const res = await request(app)
      .post('/api/iap/validate')
      .set('Authorization', `Bearer ${buildExpiredJwt()}`)
      .send({ platform: 'ios', receipt: 'abc', productId: 'prod' });
    expect(res.status).toBe(401);
  });

  it('returns 401 for a malformed JWT (only 2 segments)', async () => {
    const res = await request(app)
      .post('/api/iap/validate')
      .set('Authorization', 'Bearer only.two')
      .send({ platform: 'ios', receipt: 'abc', productId: 'prod' });
    expect(res.status).toBe(401);
  });

  it('returns 401 for a JWT without a sub claim', async () => {
    // Manually build a JWT without sub
    const b64url = (obj) =>
      Buffer.from(JSON.stringify(obj)).toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const badJwt = `${b64url({ alg: 'none' })}.${b64url({ iat: 123, exp: 9999999999 })}.sig`;
    const res = await request(app)
      .post('/api/iap/validate')
      .set('Authorization', `Bearer ${badJwt}`)
      .send({ platform: 'ios', receipt: 'abc', productId: 'prod' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when receipt is missing', async () => {
    const res = await request(app)
      .post('/api/iap/validate')
      .set('Authorization', `Bearer ${buildTestJwt()}`)
      .send({ platform: 'ios', productId: 'prod' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when platform is missing', async () => {
    const res = await request(app)
      .post('/api/iap/validate')
      .set('Authorization', `Bearer ${buildTestJwt()}`)
      .send({ receipt: 'abc', productId: 'prod' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when productId is missing', async () => {
    const res = await request(app)
      .post('/api/iap/validate')
      .set('Authorization', `Bearer ${buildTestJwt()}`)
      .send({ platform: 'ios', receipt: 'abc' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid platform value', async () => {
    const res = await request(app)
      .post('/api/iap/validate')
      .set('Authorization', `Bearer ${buildTestJwt()}`)
      .send({ platform: 'windows', receipt: 'abc', productId: 'prod' });
    expect(res.status).toBe(400);
  });

  it('returns 200 with { entitlement, expiresAt } on valid iOS receipt', async () => {
    const expiresAt = new Date(Date.now() + 30 * 86400 * 1000).toISOString();
    mockValidateAndPersist.mockResolvedValueOnce({ entitlement: 'pro', expiresAt });

    const res = await request(app)
      .post('/api/iap/validate')
      .set('Authorization', `Bearer ${buildTestJwt({ sub: 'user-ios' })}`)
      .send({ platform: 'ios', receipt: 'valid-jws', productId: 'com.test.pro' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ entitlement: 'pro', expiresAt });
    expect(mockValidateAndPersist).toHaveBeenCalledWith({
      platform: 'ios',
      receipt: 'valid-jws',
      productId: 'com.test.pro',
      userId: 'user-ios',
    });
  });

  it('returns 200 with { entitlement, expiresAt } on valid Android receipt', async () => {
    const expiresAt = new Date(Date.now() + 30 * 86400 * 1000).toISOString();
    mockValidateAndPersist.mockResolvedValueOnce({ entitlement: 'pro', expiresAt });

    const res = await request(app)
      .post('/api/iap/validate')
      .set('Authorization', `Bearer ${buildTestJwt({ sub: 'user-android' })}`)
      .send({ platform: 'android', receipt: 'purchase-token', productId: 'com.test.pro' });

    expect(res.status).toBe(200);
    expect(res.body.entitlement).toBe('pro');
  });

  it('returns 402 when validateAndPersist throws (invalid receipt)', async () => {
    mockValidateAndPersist.mockRejectedValueOnce(new Error('Receipt validation failed'));

    const res = await request(app)
      .post('/api/iap/validate')
      .set('Authorization', `Bearer ${buildTestJwt()}`)
      .send({ platform: 'ios', receipt: 'bad-receipt', productId: 'com.test.pro' });

    expect(res.status).toBe(402);
    expect(res.body.error).toBe('Receipt validation failed');
  });

  it('does not include the receipt in the 402 error response body', async () => {
    mockValidateAndPersist.mockRejectedValueOnce(new Error('bad'));

    const sensitiveReceipt = 'SUPER_SECRET_RECEIPT_SHOULD_NOT_APPEAR';
    const res = await request(app)
      .post('/api/iap/validate')
      .set('Authorization', `Bearer ${buildTestJwt()}`)
      .send({ platform: 'ios', receipt: sensitiveReceipt, productId: 'prod' });

    expect(JSON.stringify(res.body)).not.toContain(sensitiveReceipt);
  });

  it('is idempotent: second call with same body returns same data (mock returns same value)', async () => {
    const expiresAt = new Date(Date.now() + 30 * 86400 * 1000).toISOString();
    mockValidateAndPersist.mockResolvedValue({ entitlement: 'pro', expiresAt });

    const body = { platform: 'ios', receipt: 'idem-receipt', productId: 'com.test.pro' };
    const jwt = buildTestJwt({ sub: 'user-idem' });

    const first = await request(app).post('/api/iap/validate').set('Authorization', `Bearer ${jwt}`).send(body);
    const second = await request(app).post('/api/iap/validate').set('Authorization', `Bearer ${jwt}`).send(body);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.expiresAt).toBe(first.body.expiresAt);
    expect(mockValidateAndPersist).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// GET /api/iap/entitlement
// ---------------------------------------------------------------------------

describe('GET /api/iap/entitlement', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
    mockValidateAndPersist.mockReset();
    mockGetEntitlementForUser.mockReset();
  });

  it('returns 401 without Authorization header', async () => {
    const res = await request(app).get('/api/iap/entitlement');
    expect(res.status).toBe(401);
  });

  it('returns 401 for expired JWT', async () => {
    const res = await request(app)
      .get('/api/iap/entitlement')
      .set('Authorization', `Bearer ${buildExpiredJwt()}`);
    expect(res.status).toBe(401);
  });

  it('returns 404 when user has no entitlement', async () => {
    mockGetEntitlementForUser.mockReturnValueOnce(null);

    const res = await request(app)
      .get('/api/iap/entitlement')
      .set('Authorization', `Bearer ${buildTestJwt({ sub: 'user-no-ent' })}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/No entitlement found/i);
    expect(mockGetEntitlementForUser).toHaveBeenCalledWith('user-no-ent');
  });

  it('returns 200 with { entitlement, expiresAt } when entitlement exists', async () => {
    const expiresAt = new Date(Date.now() + 30 * 86400 * 1000).toISOString();
    mockGetEntitlementForUser.mockReturnValueOnce({ entitlement: 'pro', expiresAt });

    const res = await request(app)
      .get('/api/iap/entitlement')
      .set('Authorization', `Bearer ${buildTestJwt({ sub: 'user-has-ent' })}`);

    expect(res.status).toBe(200);
    expect(res.body.entitlement).toBe('pro');
    expect(res.body.expiresAt).toBe(expiresAt);
    expect(mockGetEntitlementForUser).toHaveBeenCalledWith('user-has-ent');
  });
});
