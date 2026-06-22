// Tests for verifyFirebaseToken middleware
// We mock firebase-admin so no real Firebase project is needed.

'use strict';

// ─── firebase-admin mock ──────────────────────────────────────────────────────
// Jest requires the factory to use only scope-safe vars; we store mutable
// state on module.exports so the tests can inspect and control it.

const mockVerifyIdToken = jest.fn();
const mockApps = [];
const mockInitializeApp = jest.fn();

jest.mock('firebase-admin', () => ({
  get apps() { return mockApps; },
  initializeApp: (...args) => mockInitializeApp(...args),
  credential: { cert: (sa) => sa },
  auth: () => ({ verifyIdToken: mockVerifyIdToken }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────
function mockReq(authHeader) {
  return { headers: authHeader !== undefined ? { authorization: authHeader } : {} };
}

function mockRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

/**
 * Load a fresh copy of auth.js with the given FIREBASE_SERVICE_ACCOUNT_JSON.
 * Clears the module registry first so initFirebase() runs again.
 */
function loadAuth(serviceAccountJson) {
  // Reset mock state
  mockApps.length = 0;
  mockInitializeApp.mockReset();
  mockVerifyIdToken.mockReset();

  const savedEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (serviceAccountJson === undefined) {
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  } else {
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = serviceAccountJson;
  }

  jest.isolateModules(() => {
    // This runs synchronously; we capture the export via closure.
    // But isolateModules doesn't let us return a value, so we use a different
    // technique: delete the cached module and re-require.
  });

  // Delete cached module entry so we get a fresh load.
  delete require.cache[require.resolve('./auth')];

  const mod = require('./auth');

  // Restore env
  if (savedEnv === undefined) {
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  } else {
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = savedEnv;
  }

  return mod;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const VALID_SA_JSON = JSON.stringify({
  type: 'service_account',
  project_id: 'test-project',
  private_key_id: 'key-id',
  private_key: '-----BEGIN RSA PRIVATE KEY-----\nFAKE\n-----END RSA PRIVATE KEY-----\n',
  client_email: 'test@test-project.iam.gserviceaccount.com',
});

describe('verifyFirebaseToken — Firebase initialised', () => {
  let verifyFirebaseToken;

  beforeEach(() => {
    ({ verifyFirebaseToken } = loadAuth(VALID_SA_JSON));
    // Simulate that initializeApp pushed an app entry.
    mockApps.push({});
  });

  test('returns 401 INVALID_TOKEN when Authorization header is absent', async () => {
    const req = mockReq(undefined);
    const res = mockRes();
    const next = jest.fn();

    await verifyFirebaseToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'INVALID_TOKEN' });
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 INVALID_TOKEN when Authorization header has no Bearer prefix', async () => {
    const req = mockReq('Basic dXNlcjpwYXNz');
    const res = mockRes();
    const next = jest.fn();

    await verifyFirebaseToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'INVALID_TOKEN' });
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 INVALID_TOKEN when X-StuntCock-Token header is used (old auth)', async () => {
    const req = { headers: { 'x-stuntcock-token': 'some-secret' } };
    const res = mockRes();
    const next = jest.fn();

    await verifyFirebaseToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'INVALID_TOKEN' });
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 INVALID_TOKEN when Bearer token is expired / invalid', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('Token expired'));

    const req = mockReq('Bearer bad-token');
    const res = mockRes();
    const next = jest.fn();

    await verifyFirebaseToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'INVALID_TOKEN' });
    expect(next).not.toHaveBeenCalled();
  });

  test('calls next() and sets req.userId to uid when token is valid', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'user-abc-123' });

    const req = mockReq('Bearer valid-firebase-id-token');
    const res = mockRes();
    const next = jest.fn();

    await verifyFirebaseToken(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.userId).toBe('user-abc-123');
    expect(res.status).not.toHaveBeenCalled();
  });

  test('returns 401 when Bearer header has double-space (malformed)', async () => {
    // "Bearer  <token>" — two spaces — does not match our regex and gets 401
    const req = mockReq('Bearer  double-spaced-token');
    const res = mockRes();
    const next = jest.fn();

    await verifyFirebaseToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'INVALID_TOKEN' });
  });
});

describe('verifyFirebaseToken — Firebase NOT initialised (missing env var)', () => {
  let verifyFirebaseToken;

  beforeEach(() => {
    ({ verifyFirebaseToken } = loadAuth(undefined));
    // admin.apps stays empty — no initializeApp call expected
  });

  test('returns 401 INVALID_TOKEN even for a well-formed Bearer header', async () => {
    const req = mockReq('Bearer some-token');
    const res = mockRes();
    const next = jest.fn();

    await verifyFirebaseToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'INVALID_TOKEN' });
    expect(next).not.toHaveBeenCalled();
  });
});
