// Tests for backend/iapValidator.js
// Covers: Apple JWS decoding, idempotent entitlement persistence, error paths.
// Uses a fully-mocked db module (no native SQLite bindings required).

'use strict';

// ---------------------------------------------------------------------------
// In-memory store shared between the mock and the tests.
// Named with `mock` prefix so Jest's scope guard allows access in jest.mock().
// ---------------------------------------------------------------------------

const mockStore = new Map();

// ---------------------------------------------------------------------------
// Mock the db module — no SQLite native bindings needed in tests
// ---------------------------------------------------------------------------

jest.mock('../db', () => {
  // makePrepare is defined INSIDE the factory so it has no out-of-scope refs
  // (except mockStore which is prefixed with "mock" — Jest allows that)
  function makePrepare(store) {
    return function prepare(sql) {
      if (sql.includes('CREATE TABLE')) return { run: () => {} };

      if (
        sql.includes('SELECT * FROM iap_entitlements WHERE transaction_id = ?')
        && !sql.includes('user_id')
      ) {
        return { get: (txId) => store.get(txId) || null };
      }

      if (sql.includes('INSERT INTO iap_entitlements')) {
        return {
          run: (txId, userId, platform, productId, expiresAt) => {
            store.set(txId, {
              transaction_id: txId,
              user_id: userId,
              platform,
              product_id: productId,
              entitlement: 'pro',
              expires_at: expiresAt,
            });
          },
        };
      }

      if (sql.includes('SELECT entitlement, expires_at')) {
        return {
          get: (userId) => {
            let latest = null;
            for (const row of store.values()) {
              if (row.user_id === userId) {
                if (!latest || row.expires_at > latest.expires_at) latest = row;
              }
            }
            return latest
              ? { entitlement: latest.entitlement, expires_at: latest.expires_at }
              : null;
          },
        };
      }

      if (sql.includes('FROM iap_entitlements WHERE user_id')) {
        return { all: (userId) => [...store.values()].filter(r => r.user_id === userId) };
      }

      if (sql.includes('iap_entitlements WHERE transaction_id')) {
        return { all: (txId) => (store.has(txId) ? [store.get(txId)] : []) };
      }

      return { get: () => null, all: () => [], run: () => {} };
    };
  }

  return {
    db: { pragma: () => {}, exec: () => {}, prepare: makePrepare(mockStore) },
    getSetting: () => null,
    setSetting: () => {},
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a fake Apple StoreKit 2 JWS for testing.
 * @param {object} payload - overrides
 * @returns {string} header.payload.signature (all fake)
 */
function buildFakeAppleJWS(payload = {}) {
  const defaults = {
    transactionId: 'txn-apple-001',
    productId: 'com.mattswann.stuntcock.pro_monthly',
    environment: 'Sandbox',
    expiresDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
  };
  const merged = { ...defaults, ...payload };
  const b64url = (obj) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  return `fake-header.${b64url(merged)}.fake-sig`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let iapValidator;

beforeEach(() => {
  mockStore.clear();
  delete process.env.APPLE_APPSTORE_API_KEY;
  delete process.env.GOOGLE_PLAY_ACCESS_TOKEN;
  delete process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  jest.resetModules();
  // Re-mock after resetModules
  jest.mock('../db', () => {
    function makePrepare(store) {
      return function prepare(sql) {
        if (sql.includes('CREATE TABLE')) return { run: () => {} };
        if (
          sql.includes('SELECT * FROM iap_entitlements WHERE transaction_id = ?')
          && !sql.includes('user_id')
        ) return { get: (txId) => store.get(txId) || null };
        if (sql.includes('INSERT INTO iap_entitlements')) {
          return {
            run: (txId, userId, platform, productId, expiresAt) => {
              store.set(txId, { transaction_id: txId, user_id: userId, platform, product_id: productId, entitlement: 'pro', expires_at: expiresAt });
            },
          };
        }
        if (sql.includes('SELECT entitlement, expires_at')) {
          return {
            get: (userId) => {
              let latest = null;
              for (const row of store.values()) {
                if (row.user_id === userId) {
                  if (!latest || row.expires_at > latest.expires_at) latest = row;
                }
              }
              return latest ? { entitlement: latest.entitlement, expires_at: latest.expires_at } : null;
            },
          };
        }
        if (sql.includes('FROM iap_entitlements WHERE user_id')) return { all: (uid) => [...store.values()].filter(r => r.user_id === uid) };
        if (sql.includes('iap_entitlements WHERE transaction_id')) return { all: (txId) => (store.has(txId) ? [store.get(txId)] : []) };
        return { get: () => null, all: () => [], run: () => {} };
      };
    }
    return {
      db: { pragma: () => {}, exec: () => {}, prepare: makePrepare(mockStore) },
      getSetting: () => null,
      setSetting: () => {},
    };
  });
  iapValidator = require('../iapValidator');
});

// ── upsertEntitlement ──────────────────────────────────────────────────────

describe('upsertEntitlement', () => {
  it('creates a new entitlement and returns { entitlement: pro, expiresAt, transactionId }', () => {
    const expiresAt = new Date(Date.now() + 30 * 86400 * 1000).toISOString();
    const result = iapValidator.upsertEntitlement({
      transactionId: 'txn-new-1',
      userId: 'user-a',
      platform: 'ios',
      productId: 'com.mattswann.stuntcock.pro_monthly',
      expiresAt,
    });
    expect(result.entitlement).toBe('pro');
    expect(result.expiresAt).toBe(expiresAt);
    expect(result.transactionId).toBe('txn-new-1');
  });

  it('is idempotent: second call with same transactionId returns original expiresAt', () => {
    const expiresAt = new Date(Date.now() + 30 * 86400 * 1000).toISOString();
    const first = iapValidator.upsertEntitlement({
      transactionId: 'txn-idem',
      userId: 'user-b',
      platform: 'ios',
      productId: 'com.test.prod',
      expiresAt,
    });
    const laterExpiry = new Date(Date.now() + 60 * 86400 * 1000).toISOString();
    const second = iapValidator.upsertEntitlement({
      transactionId: 'txn-idem',
      userId: 'user-b',
      platform: 'ios',
      productId: 'com.test.prod',
      expiresAt: laterExpiry,
    });
    // Must NOT overwrite — same record returned
    expect(second.expiresAt).toBe(first.expiresAt);
    expect(second.entitlement).toBe('pro');
    // Only one entry in the store
    const entries = [...mockStore.entries()].filter(([k]) => k === 'txn-idem');
    expect(entries.length).toBe(1);
  });

  it('allows multiple distinct transactionIds for the same user', () => {
    const exp = new Date(Date.now() + 30 * 86400 * 1000).toISOString();
    iapValidator.upsertEntitlement({ transactionId: 'tx-x', userId: 'user-c', platform: 'ios', productId: 'p', expiresAt: exp });
    iapValidator.upsertEntitlement({ transactionId: 'tx-y', userId: 'user-c', platform: 'ios', productId: 'p', expiresAt: exp });
    const rows = [...mockStore.values()].filter(r => r.user_id === 'user-c');
    expect(rows.length).toBe(2);
  });
});

// ── getEntitlementForUser ──────────────────────────────────────────────────

describe('getEntitlementForUser', () => {
  it('returns null for a user with no entitlements', () => {
    expect(iapValidator.getEntitlementForUser('ghost-user')).toBeNull();
  });

  it('returns the entitlement with the latest expiresAt (cross-device sync)', () => {
    const earlier = new Date(Date.now() + 10 * 86400 * 1000).toISOString();
    const later = new Date(Date.now() + 60 * 86400 * 1000).toISOString();
    iapValidator.upsertEntitlement({ transactionId: 'tx-d1', userId: 'user-d', platform: 'ios', productId: 'p', expiresAt: earlier });
    iapValidator.upsertEntitlement({ transactionId: 'tx-d2', userId: 'user-d', platform: 'ios', productId: 'p', expiresAt: later });
    const result = iapValidator.getEntitlementForUser('user-d');
    expect(result).not.toBeNull();
    expect(result.entitlement).toBe('pro');
    expect(result.expiresAt).toBe(later);
  });
});

// ── validateAppleReceipt ───────────────────────────────────────────────────

describe('validateAppleReceipt', () => {
  it('decodes a valid StoreKit 2 JWS and returns { transactionId, expiresAt }', async () => {
    const jws = buildFakeAppleJWS();
    const result = await iapValidator.validateAppleReceipt(jws, 'com.mattswann.stuntcock.pro_monthly');
    expect(result.transactionId).toBe('txn-apple-001');
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('throws on JWS with fewer than 3 segments', async () => {
    await expect(iapValidator.validateAppleReceipt('only.two', 'prod'))
      .rejects.toThrow(/Invalid StoreKit 2 transaction JWS format/);
  });

  it('throws if the base64url payload decodes to invalid JSON', async () => {
    await expect(iapValidator.validateAppleReceipt('h.!!!.s', 'prod'))
      .rejects.toThrow(/Failed to decode StoreKit 2 transaction payload/);
  });

  it('throws if transactionId is absent from payload', async () => {
    const b64url = (obj) =>
      Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const jws = `h.${b64url({ productId: 'prod', environment: 'Sandbox' })}.sig`;
    await expect(iapValidator.validateAppleReceipt(jws, 'prod'))
      .rejects.toThrow(/Missing transactionId/);
  });

  it('throws on productId mismatch', async () => {
    const jws = buildFakeAppleJWS({ productId: 'wrong.product' });
    await expect(iapValidator.validateAppleReceipt(jws, 'com.mattswann.stuntcock.pro_monthly'))
      .rejects.toThrow(/Product ID mismatch/);
  });

  it('uses far-future expiry for non-subscription (no expiresDate)', async () => {
    const b64url = (obj) =>
      Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const jws = `h.${b64url({ transactionId: 'txn-lt', productId: 'prod.lifetime' })}.sig`;
    const result = await iapValidator.validateAppleReceipt(jws, 'prod.lifetime');
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now() + 300 * 24 * 3600 * 1000);
  });
});

// ── validateAndPersist ─────────────────────────────────────────────────────

describe('validateAndPersist', () => {
  it('validates an Apple receipt and returns { entitlement: pro, expiresAt }', async () => {
    const jws = buildFakeAppleJWS({ transactionId: 'txn-vp-1' });
    const result = await iapValidator.validateAndPersist({
      platform: 'ios',
      receipt: jws,
      productId: 'com.mattswann.stuntcock.pro_monthly',
      userId: 'user-e',
    });
    expect(result.entitlement).toBe('pro');
    expect(result.expiresAt).toBeTruthy();
  });

  it('is idempotent: second call with same JWS returns same expiresAt', async () => {
    const jws = buildFakeAppleJWS({ transactionId: 'txn-vp-idem' });
    const opts = { platform: 'ios', receipt: jws, productId: 'com.mattswann.stuntcock.pro_monthly', userId: 'user-f' };
    const first = await iapValidator.validateAndPersist(opts);
    const second = await iapValidator.validateAndPersist(opts);
    expect(second.expiresAt).toBe(first.expiresAt);
    const rows = [...mockStore.values()].filter(r => r.transaction_id === 'txn-vp-idem');
    expect(rows.length).toBe(1);
  });

  it('throws on unknown platform without writing to the store', async () => {
    await expect(
      iapValidator.validateAndPersist({ platform: 'windows', receipt: 'any', productId: 'prod', userId: 'user-g' }),
    ).rejects.toThrow(/Unknown platform/);
    expect([...mockStore.values()].filter(r => r.user_id === 'user-g').length).toBe(0);
  });

  it('throws on invalid Apple JWS without writing to the store', async () => {
    await expect(
      iapValidator.validateAndPersist({ platform: 'ios', receipt: 'bad-jws', productId: 'prod', userId: 'user-h' }),
    ).rejects.toThrow();
    expect([...mockStore.values()].filter(r => r.user_id === 'user-h').length).toBe(0);
  });

  it('throws for Android when no Google credentials are configured', async () => {
    await expect(
      iapValidator.validateAndPersist({ platform: 'android', receipt: 'purchase-token', productId: 'com.test.prod', userId: 'user-i' }),
    ).rejects.toThrow(/credentials/i);
    expect([...mockStore.values()].filter(r => r.user_id === 'user-i').length).toBe(0);
  });
});
