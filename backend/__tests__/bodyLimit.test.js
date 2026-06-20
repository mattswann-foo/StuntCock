// Tests for express.json({ limit: '64kb' }) body size cap on key endpoints
// Verifies: 64 KB accepted (200), >64 KB rejected (413), normal payloads unaffected

'use strict';

const express = require('express');
const http = require('http');
const supertest = require('supertest');

/**
 * Build a minimal Express app that replicates ONLY the body-parsing middleware
 * and the three routes under test.  This avoids pulling in signal-cli,
 * WhatsApp, SQLite etc. while still exercising the real middleware config.
 */
function buildApp() {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  // Minimal route stubs that mirror what the real server does
  app.post('/api/rules', (req, res) => {
    res.json({ id: 1, ...req.body });
  });

  app.post('/api/settings/bulk', (req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/personas', (req, res) => {
    const { name, system_prompt } = req.body;
    if (!name || !system_prompt) {
      return res.status(400).json({ error: 'name and system_prompt required' });
    }
    res.json({ id: 1, name, system_prompt });
  });

  return app;
}

// Helpers ---------------------------------------------------------------

/** Generate a JSON string whose byte-length is EXACTLY targetBytes */
function jsonOfSize(targetBytes) {
  // {"padding":"<value>"} overhead: '{"padding":""}' = 14 bytes
  const overhead = Buffer.byteLength('{"padding":""}');
  const valueLen = targetBytes - overhead;
  if (valueLen < 0) throw new Error('targetBytes too small');
  return JSON.stringify({ padding: 'x'.repeat(valueLen) });
}

/** 64 × 1024 = 65536 bytes */
const LIMIT_BYTES = 64 * 1024;

// -----------------------------------------------------------------------

describe('express.json body-size limit (64 KB)', () => {
  let agent;

  beforeAll(() => {
    agent = supertest(buildApp());
  });

  // --- /api/rules -------------------------------------------------------

  test('POST /api/rules: 64 KB body is accepted (200)', async () => {
    const body = jsonOfSize(LIMIT_BYTES);
    expect(Buffer.byteLength(body)).toBe(LIMIT_BYTES);

    const res = await agent
      .post('/api/rules')
      .set('Content-Type', 'application/json')
      .send(body);

    expect(res.status).toBe(200);
  });

  test('POST /api/rules: body exceeding 64 KB returns 413', async () => {
    const body = jsonOfSize(LIMIT_BYTES + 1);
    expect(Buffer.byteLength(body)).toBe(LIMIT_BYTES + 1);

    const res = await agent
      .post('/api/rules')
      .set('Content-Type', 'application/json')
      .send(body);

    expect(res.status).toBe(413);
  });

  // --- /api/settings/bulk -----------------------------------------------

  test('POST /api/settings/bulk: body exceeding 64 KB returns 413', async () => {
    const body = jsonOfSize(LIMIT_BYTES + 1);

    const res = await agent
      .post('/api/settings/bulk')
      .set('Content-Type', 'application/json')
      .send(body);

    expect(res.status).toBe(413);
  });

  // --- /api/personas ----------------------------------------------------

  test('POST /api/personas: body exceeding 64 KB returns 413', async () => {
    const body = jsonOfSize(LIMIT_BYTES + 1);

    const res = await agent
      .post('/api/personas')
      .set('Content-Type', 'application/json')
      .send(body);

    expect(res.status).toBe(413);
  });

  // --- Normal payloads unaffected ---------------------------------------

  test('POST /api/rules: normal small payload (<1 KB) succeeds with 200', async () => {
    const res = await agent
      .post('/api/rules')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({
        name: 'test rule',
        trigger_type: 'exact',
        trigger_value: 'hello',
        response_type: 'static',
        response_text: 'Hi there!',
      }));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'test rule' });
  });

  test('POST /api/settings/bulk: normal small payload succeeds with 200', async () => {
    const res = await agent
      .post('/api/settings/bulk')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ timezone: 'UTC', global_cooldown_minutes: '5' }));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
  });

  test('POST /api/personas: valid small payload succeeds with 200', async () => {
    const res = await agent
      .post('/api/personas')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ name: 'Busy Bot', system_prompt: 'You are a busy bot.' }));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Busy Bot' });
  });
});
