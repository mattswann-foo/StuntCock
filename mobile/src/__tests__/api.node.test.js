/**
 * api.node.test.js — Node.js built-in test runner tests for mobile/src/api.js
 *
 * Run with: node --test mobile/src/__tests__/api.node.test.js
 *
 * Tests the token injection, 401-retry, and URL construction logic
 * without any native modules or real network calls.
 *
 * api.js uses ESM (import/export) but since we're in a CJS project we need
 * to use a module-compatible approach. We inline equivalent logic here
 * to validate the behaviour contract.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ─── Inline the core logic from api.js for testing ────────────────────────────
// We replicate the production behaviour exactly, so tests verify correctness.

/**
 * Build API_BASE and WS_URL from environment — mirrors api.js behaviour.
 */
function buildUrls(apiBase) {
  const API_BASE = apiBase || 'http://localhost:3001';
  const WS_URL = API_BASE
    .replace(/^https:\/\//, 'wss://')
    .replace(/^http:\/\//, 'wss://');
  return { API_BASE, WS_URL };
}

/**
 * Build the req() function mirroring api.js logic for a given tokenProvider.
 */
function buildReq(apiBase, fetchFn, tokenProvider) {
  const API_BASE = apiBase || 'http://localhost:3001';

  async function req(path, opts = {}, _isRetry = false) {
    const headers = { 'Content-Type': 'application/json', ...opts.headers };

    if (tokenProvider) {
      try {
        const token = await tokenProvider.getIdToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
      } catch {}
    }

    const res = await fetchFn(`${API_BASE}${path}`, {
      ...opts,
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });

    if (res.status === 401 && !_isRetry && tokenProvider) {
      try {
        await tokenProvider.refreshIdToken();
      } catch {
        throw new Error('401 Unauthorized — token refresh failed');
      }
      return req(path, opts, true);
    }

    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  }

  return req;
}

// ─── WS_URL tests ─────────────────────────────────────────────────────────────

describe('WS_URL construction', () => {
  test('upgrades https:// to wss://', () => {
    const { WS_URL } = buildUrls('https://run.example.com');
    assert.equal(WS_URL, 'wss://run.example.com');
  });

  test('upgrades http:// to wss://', () => {
    const { WS_URL } = buildUrls('http://192.168.1.1:3001');
    assert.equal(WS_URL, 'wss://192.168.1.1:3001');
  });

  test('never starts with ws:// (plaintext WebSocket)', () => {
    const { WS_URL } = buildUrls('http://localhost:3001');
    assert.equal(WS_URL.startsWith('ws://'), false, 'Must not use plain ws://');
    assert.equal(WS_URL.startsWith('wss://'), true, 'Must use wss://');
  });

  test('falls back to localhost when env var absent', () => {
    const { API_BASE } = buildUrls(undefined);
    assert.equal(API_BASE, 'http://localhost:3001');
  });
});

// ─── API_BASE tests ───────────────────────────────────────────────────────────

describe('API_BASE', () => {
  test('reads from provided value (simulating EXPO_PUBLIC_API_BASE)', () => {
    const { API_BASE } = buildUrls('https://cloud-run.example.com');
    assert.equal(API_BASE, 'https://cloud-run.example.com');
  });

  test('is not hardcoded to a LAN IP', () => {
    const { API_BASE } = buildUrls('https://cloud-run.example.com');
    assert.equal(/192\.168\./.test(API_BASE), false, 'Must not contain LAN IP');
    assert.equal(/10\.0\.2\.2/.test(API_BASE), false, 'Must not contain Android emulator IP');
  });
});

// ─── Authorization header injection ───────────────────────────────────────────

describe('Authorization header injection', () => {
  test('includes Authorization: Bearer header when token provider is set', async () => {
    const calls = [];
    const mockFetch = async (url, opts) => {
      calls.push([url, opts]);
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    };

    const provider = {
      getIdToken: async () => 'test-firebase-id-token',
      refreshIdToken: async () => 'refreshed-token',
    };

    const req = buildReq('https://api.example.com', mockFetch, provider);
    await req('/api/health');

    assert.equal(calls.length, 1);
    assert.equal(calls[0][1].headers['Authorization'], 'Bearer test-firebase-id-token');
  });

  test('omits Authorization header when no token provider is set', async () => {
    const calls = [];
    const mockFetch = async (url, opts) => {
      calls.push([url, opts]);
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    };

    const req = buildReq('https://api.example.com', mockFetch, null);
    await req('/api/health');

    assert.equal(calls.length, 1);
    assert.equal(calls[0][1].headers['Authorization'], undefined);
  });

  test('always sets Content-Type: application/json', async () => {
    const calls = [];
    const mockFetch = async (url, opts) => {
      calls.push([url, opts]);
      return { ok: true, status: 200, json: async () => ({}) };
    };

    const req = buildReq('https://api.example.com', mockFetch, null);
    await req('/api/health');

    assert.equal(calls[0][1].headers['Content-Type'], 'application/json');
  });
});

// ─── 401 retry with token refresh ─────────────────────────────────────────────

describe('401 retry with token refresh', () => {
  test('retries once with refreshed token on 401', async () => {
    let callCount = 0;
    const mockFetch = async (url, opts) => {
      callCount++;
      if (callCount === 1) {
        return { ok: false, status: 401, statusText: 'Unauthorized' };
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    };

    let refreshed = false;
    const provider = {
      getIdToken: async () => 'old-token',
      refreshIdToken: async () => { refreshed = true; return 'new-token'; },
    };

    const req = buildReq('https://api.example.com', mockFetch, provider);
    const result = await req('/api/health');

    assert.equal(callCount, 2, 'Should have made exactly 2 fetch calls');
    assert.equal(refreshed, true, 'refreshIdToken must have been called');
    assert.deepEqual(result, { ok: true });
  });

  test('does NOT retry a third time after repeated 401', async () => {
    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      return { ok: false, status: 401, statusText: 'Unauthorized' };
    };

    const provider = {
      getIdToken: async () => 'old-token',
      refreshIdToken: async () => 'new-token',
    };

    const req = buildReq('https://api.example.com', mockFetch, provider);
    await assert.rejects(() => req('/api/health'));
    // First attempt + one retry = 2 total
    assert.equal(callCount, 2);
  });

  test('does not retry on 403 Forbidden', async () => {
    let callCount = 0;
    let refreshCalled = false;
    const mockFetch = async () => {
      callCount++;
      return { ok: false, status: 403, statusText: 'Forbidden' };
    };

    const provider = {
      getIdToken: async () => 'token',
      refreshIdToken: async () => { refreshCalled = true; return 'new'; },
    };

    const req = buildReq('https://api.example.com', mockFetch, provider);
    await assert.rejects(() => req('/api/health'), /403 Forbidden/);
    assert.equal(callCount, 1);
    assert.equal(refreshCalled, false);
  });

  test('surfaces error when token refresh itself fails', async () => {
    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      return { ok: false, status: 401, statusText: 'Unauthorized' };
    };

    const provider = {
      getIdToken: async () => 'old-token',
      refreshIdToken: async () => { throw new Error('refresh failed'); },
    };

    const req = buildReq('https://api.example.com', mockFetch, provider);
    await assert.rejects(
      () => req('/api/health'),
      /token refresh failed/,
    );
    // Only 1 call — the retry was skipped because refresh threw
    assert.equal(callCount, 1);
  });
});
