// Tests for POST /api/settings and POST /api/settings/bulk
// Verifies that anthropic_api_key is never persisted to SQLite.

'use strict';

// ── Mock heavy dependencies before requiring the app ────────────────────────

// Mock signalClient so the daemon never actually starts
jest.mock('../signalClient', () => ({
  onMessage: jest.fn(),
  startDaemon: jest.fn(),
  getStatus: jest.fn(() => ({ running: false, restartCount: 0, port: 8080 })),
  sendMessage: jest.fn(),
  register: jest.fn(),
  verifyCode: jest.fn(),
}));

// Mock llmClient
jest.mock('../llmClient', () => ({
  generateLLMReply: jest.fn(),
  resetClient: jest.fn(),
}));

// Mock db with jest.fn() stubs so we can spy on setSetting
const mockDb = {
  getSetting: jest.fn(() => null),
  setSetting: jest.fn(),
  getAllSettings: jest.fn(() => ({})),
  getRules: jest.fn(() => []),
  createRule: jest.fn(),
  updateRule: jest.fn(),
  deleteRule: jest.fn(),
  reorderRules: jest.fn(),
  logMessage: jest.fn(),
  getRecentMessages: jest.fn(() => []),
  getAnalytics: jest.fn(() => []),
  getTodayStats: jest.fn(() => ({ total: 0, replied: 0 })),
};
jest.mock('../db', () => mockDb);

// ── Now it is safe to require supertest and the app ──────────────────────────
const request = require('supertest');

let app;

beforeAll(() => {
  // Require app only after mocks are in place
  // server.js exports `app` on its last line
  app = require('../server');
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ── POST /api/settings ───────────────────────────────────────────────────────

describe('POST /api/settings', () => {
  test('returns 200 { ok: true } for anthropic_api_key', async () => {
    const res = await request(app)
      .post('/api/settings')
      .send({ key: 'anthropic_api_key', value: 'sk-ant-xxx' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  test('does NOT call db.setSetting for anthropic_api_key', async () => {
    await request(app)
      .post('/api/settings')
      .send({ key: 'anthropic_api_key', value: 'sk-ant-xxx' });

    expect(mockDb.setSetting).not.toHaveBeenCalled();
  });

  test('does NOT call resetClient for anthropic_api_key', async () => {
    const { resetClient } = require('../llmClient');
    await request(app)
      .post('/api/settings')
      .send({ key: 'anthropic_api_key', value: 'sk-ant-xxx' });

    expect(resetClient).not.toHaveBeenCalled();
  });

  test('persists other keys normally', async () => {
    const res = await request(app)
      .post('/api/settings')
      .send({ key: 'llm_enabled', value: 'true' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mockDb.setSetting).toHaveBeenCalledWith('llm_enabled', 'true');
  });

  test('returns 400 when key is missing', async () => {
    const res = await request(app)
      .post('/api/settings')
      .send({ value: 'something' });

    expect(res.status).toBe(400);
  });
});

// ── POST /api/settings/bulk ──────────────────────────────────────────────────

describe('POST /api/settings/bulk', () => {
  test('returns 200 { ok: true } even when payload contains only anthropic_api_key', async () => {
    const res = await request(app)
      .post('/api/settings/bulk')
      .send({ anthropic_api_key: 'sk-ant-xxx' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  test('does NOT call db.setSetting for anthropic_api_key in bulk payload', async () => {
    await request(app)
      .post('/api/settings/bulk')
      .send({ anthropic_api_key: 'sk-ant-xxx' });

    expect(mockDb.setSetting).not.toHaveBeenCalled();
  });

  test('does NOT call resetClient for anthropic_api_key in bulk payload', async () => {
    const { resetClient } = require('../llmClient');
    await request(app)
      .post('/api/settings/bulk')
      .send({ anthropic_api_key: 'sk-ant-xxx' });

    expect(resetClient).not.toHaveBeenCalled();
  });

  test('persists other keys in mixed payload and silently drops anthropic_api_key', async () => {
    const res = await request(app)
      .post('/api/settings/bulk')
      .send({
        anthropic_api_key: 'sk-ant-xxx',
        llm_enabled: 'true',
        timezone: 'UTC',
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    // anthropic_api_key must NOT have been written
    const calls = mockDb.setSetting.mock.calls.map(c => c[0]);
    expect(calls).not.toContain('anthropic_api_key');

    // other keys must have been written
    expect(mockDb.setSetting).toHaveBeenCalledWith('llm_enabled', 'true');
    expect(mockDb.setSetting).toHaveBeenCalledWith('timezone', 'UTC');
  });

  test('persists all keys in payload that does not contain anthropic_api_key', async () => {
    const res = await request(app)
      .post('/api/settings/bulk')
      .send({ llm_enabled: 'false', global_cooldown_minutes: '10' });

    expect(res.status).toBe(200);
    expect(mockDb.setSetting).toHaveBeenCalledWith('llm_enabled', 'false');
    expect(mockDb.setSetting).toHaveBeenCalledWith('global_cooldown_minutes', '10');
    expect(mockDb.setSetting).toHaveBeenCalledTimes(2);
  });
});
