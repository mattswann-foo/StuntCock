/**
 * api.test.js — unit tests for mobile/src/api.js
 *
 * Tests the token injection, 401-retry, and URL construction logic without
 * any native modules, Firebase SDK, or real network calls.
 */

// ─── Mock process.env before importing the module under test ─────────────────
const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = {
    ...ORIGINAL_ENV,
    EXPO_PUBLIC_API_BASE: 'https://api.example.com',
  };
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeApi(envOverrides = {}) {
  // Apply env overrides before requiring the module
  Object.assign(process.env, envOverrides);
  return require('../api');
}

// ─── WS_URL construction ──────────────────────────────────────────────────────

describe('WS_URL', () => {
  test('upgrades https:// API_BASE to wss://', () => {
    const { WS_URL } = makeApi({ EXPO_PUBLIC_API_BASE: 'https://run.example.com' });
    expect(WS_URL).toBe('wss://run.example.com');
  });

  test('upgrades http:// API_BASE to wss://', () => {
    const { WS_URL } = makeApi({ EXPO_PUBLIC_API_BASE: 'http://192.168.1.1:3001' });
    expect(WS_URL).toBe('wss://192.168.1.1:3001');
  });

  test('never starts with ws:// (plaintext WebSocket)', () => {
    const { WS_URL } = makeApi({ EXPO_PUBLIC_API_BASE: 'http://localhost:3001' });
    expect(WS_URL.startsWith('ws://')).toBe(false);
    expect(WS_URL.startsWith('wss://')).toBe(true);
  });
});

// ─── API_BASE ─────────────────────────────────────────────────────────────────

describe('API_BASE', () => {
  test('reads from EXPO_PUBLIC_API_BASE env var', () => {
    const { API_BASE } = makeApi({ EXPO_PUBLIC_API_BASE: 'https://cloud-run.example.com' });
    expect(API_BASE).toBe('https://cloud-run.example.com');
  });

  test('falls back to localhost:3001 when env var is absent', () => {
    delete process.env.EXPO_PUBLIC_API_BASE;
    const { API_BASE } = makeApi({});
    expect(API_BASE).toBe('http://localhost:3001');
  });

  test('is not hardcoded to a LAN IP', () => {
    const { API_BASE } = makeApi({ EXPO_PUBLIC_API_BASE: 'https://cloud-run.example.com' });
    expect(API_BASE).not.toMatch(/192\.168\./);
    expect(API_BASE).not.toMatch(/10\.0\.2\.2/);
  });
});

// ─── Authorization header injection ───────────────────────────────────────────

describe('Authorization header injection', () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    delete global.fetch;
  });

  test('includes Authorization: Bearer header when token provider is set', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });

    const { api, setTokenProvider } = makeApi({});
    setTokenProvider({
      getIdToken: async () => 'test-firebase-id-token',
      refreshIdToken: async () => 'refreshed-token',
    });

    await api.health();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.headers['Authorization']).toBe('Bearer test-firebase-id-token');
  });

  test('does NOT include Authorization header before setTokenProvider is called', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });

    const { api } = makeApi({});
    // Do NOT call setTokenProvider

    await api.health();

    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.headers['Authorization']).toBeUndefined();
  });
});

// ─── 401 retry with token refresh ─────────────────────────────────────────────

describe('401 retry with token refresh', () => {
  let fetchMock;
  let refreshIdToken;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    refreshIdToken = jest.fn().mockResolvedValue('new-token');
  });

  afterEach(() => {
    delete global.fetch;
  });

  test('retries once with refreshed token on 401', async () => {
    // First call → 401; second call → 200
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized' })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true }) });

    const { api, setTokenProvider } = makeApi({});
    setTokenProvider({
      getIdToken: jest.fn().mockResolvedValue('old-token'),
      refreshIdToken,
    });

    const result = await api.health();

    expect(refreshIdToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ok: true });
  });

  test('does NOT retry a second time on repeated 401 (surfaces error)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' });

    const { api, setTokenProvider } = makeApi({});
    setTokenProvider({
      getIdToken: jest.fn().mockResolvedValue('old-token'),
      refreshIdToken,
    });

    await expect(api.health()).rejects.toThrow();
    // First attempt + one retry = 2 calls total
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('does not retry on non-401 errors', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden' });

    const { api, setTokenProvider } = makeApi({});
    setTokenProvider({
      getIdToken: jest.fn().mockResolvedValue('token'),
      refreshIdToken,
    });

    await expect(api.health()).rejects.toThrow('403 Forbidden');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(refreshIdToken).not.toHaveBeenCalled();
  });
});

// ─── Content-Type header is always set ───────────────────────────────────────

describe('Content-Type header', () => {
  test('sets Content-Type: application/json on every request', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    const { api } = makeApi({});
    await api.health();

    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.headers['Content-Type']).toBe('application/json');
    delete global.fetch;
  });
});
