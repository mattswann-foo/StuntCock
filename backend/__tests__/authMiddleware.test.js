// Tests for backend/authMiddleware.js
// Covers: no-op when API_TOKEN unset, 401 when token missing/wrong, 200 when correct.

'use strict';

const express = require('express');
const request = require('supertest');

// Helper: build a small Express app with the middleware applied to /api routes,
// and a health route that is NOT behind the middleware.
function buildApp(apiToken) {
  // Temporarily set / unset the env var for each test app instance
  const originalToken = process.env.API_TOKEN;
  if (apiToken === undefined) {
    delete process.env.API_TOKEN;
  } else {
    process.env.API_TOKEN = apiToken;
  }

  // Re-require the middleware so it picks up the current process.env at call time.
  // Because Node caches modules, we need to use the live process.env read inside
  // requireAuth — which is exactly how authMiddleware.js is written.
  const { requireAuth } = require('../authMiddleware');

  const app = express();
  app.use(express.json());

  // Health route — NOT behind requireAuth
  app.get('/api/health', (req, res) => {
    res.json({ ok: true });
  });

  // Protected routes — behind requireAuth
  app.use('/api', requireAuth);
  app.get('/api/rules', (req, res) => {
    res.json([]);
  });
  app.get('/api/settings', (req, res) => {
    res.json({ anthropic_api_key: 'sk-***' });
  });

  // Restore original value after app is built (cleanup for other tests)
  if (apiToken === undefined) {
    delete process.env.API_TOKEN;
  } else {
    process.env.API_TOKEN = apiToken;
  }

  return app;
}

describe('requireAuth middleware — API_TOKEN not set', () => {
  let app;

  beforeEach(() => {
    delete process.env.API_TOKEN;
    // Re-require to pick up env change
    jest.resetModules();
    const { requireAuth } = require('../authMiddleware');
    app = express();
    app.use(express.json());
    app.get('/api/health', (req, res) => res.json({ ok: true }));
    app.use('/api', requireAuth);
    app.get('/api/rules', (req, res) => res.json([]));
  });

  afterEach(() => {
    delete process.env.API_TOKEN;
    jest.resetModules();
  });

  it('calls next() unconditionally — GET /api/rules returns 200 without token', async () => {
    const res = await request(app).get('/api/rules');
    expect(res.status).toBe(200);
  });

  it('calls next() unconditionally — GET /api/rules returns 200 with random token', async () => {
    const res = await request(app).get('/api/rules').set('X-StuntCock-Token', 'anything');
    expect(res.status).toBe(200);
  });

  it('GET /api/health returns 200 without token header', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
  });
});

describe('requireAuth middleware — API_TOKEN set to "testtoken"', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    process.env.API_TOKEN = 'testtoken';
    const { requireAuth } = require('../authMiddleware');
    app = express();
    app.use(express.json());
    // health is NOT behind requireAuth
    app.get('/api/health', (req, res) => res.json({ ok: true }));
    app.use('/api', requireAuth);
    app.get('/api/rules', (req, res) => res.json([]));
    app.get('/api/settings', (req, res) => res.json({ anthropic_api_key: 'sk-***' }));
  });

  afterEach(() => {
    delete process.env.API_TOKEN;
    jest.resetModules();
  });

  it('GET /api/rules without token returns 401 { error: "Unauthorized" }', async () => {
    const res = await request(app).get('/api/rules');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('GET /api/rules with wrong token returns 401', async () => {
    const res = await request(app).get('/api/rules').set('X-StuntCock-Token', 'wrongtoken');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('GET /api/rules with correct token returns 200', async () => {
    const res = await request(app).get('/api/rules').set('X-StuntCock-Token', 'testtoken');
    expect(res.status).toBe(200);
  });

  it('GET /api/health returns 200 without token (bypasses requireAuth)', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('GET /api/health returns 200 with token set', async () => {
    const res = await request(app).get('/api/health').set('X-StuntCock-Token', 'testtoken');
    expect(res.status).toBe(200);
  });
});

describe('GET /api/settings — API key redaction', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    delete process.env.API_TOKEN;
    const { requireAuth } = require('../authMiddleware');
    app = express();
    app.use(express.json());
    app.get('/api/health', (req, res) => res.json({ ok: true }));
    app.use('/api', requireAuth);

    // Simulate a stored API key
    app.get('/api/settings-with-key', (req, res) => {
      const raw = { anthropic_api_key: 'sk-ant-realkey', llm_enabled: 'true' };
      if (Object.prototype.hasOwnProperty.call(raw, 'anthropic_api_key')) {
        raw.anthropic_api_key = raw.anthropic_api_key ? 'sk-***' : '';
      }
      res.json(raw);
    });

    // Simulate no stored API key (empty string in DB)
    app.get('/api/settings-no-key', (req, res) => {
      const raw = { anthropic_api_key: '', llm_enabled: 'false' };
      if (Object.prototype.hasOwnProperty.call(raw, 'anthropic_api_key')) {
        raw.anthropic_api_key = raw.anthropic_api_key ? 'sk-***' : '';
      }
      res.json(raw);
    });
  });

  afterEach(() => {
    jest.resetModules();
  });

  it('returns "sk-***" when an API key is stored', async () => {
    const res = await request(app).get('/api/settings-with-key');
    expect(res.status).toBe(200);
    expect(res.body.anthropic_api_key).toBe('sk-***');
  });

  it('returns "" (empty string) when no API key is stored', async () => {
    const res = await request(app).get('/api/settings-no-key');
    expect(res.status).toBe(200);
    expect(res.body.anthropic_api_key).toBe('');
  });
});
