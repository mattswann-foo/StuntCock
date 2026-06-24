// Integration tests for the per-user Signal API routes
// Builds a minimal Express app that mounts only the Signal routes,
// so we don't have to start SQLite / WhatsApp / signal-cli etc.

'use strict';

const express = require('express');
const request = require('supertest');
const path = require('path');
const os = require('os');
const fs = require('fs');
const EventEmitter = require('events');

// ── Fake process factory ──────────────────────────────────────────────────────

function makeFakeProc() {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.killed = false;
  proc.kill = jest.fn(() => {
    proc.killed = true;
    proc.emit('exit', 0);
  });
  return proc;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

let app;
let tmpDir;
let spawnMock;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'signal-routes-test-'));
  process.env.SIGNAL_DATA_ROOT = tmpDir;
  process.env.SIGNAL_CLI_PATH = 'signal-cli';

  jest.resetModules();

  const cp = require('child_process');
  spawnMock = jest.spyOn(cp, 'spawn').mockImplementation(() => makeFakeProc());

  const { requireUserId } = require('../authMiddleware');
  const signalDaemonManager = require('../signalDaemonManager');

  app = express();
  app.use(express.json());

  // POST /api/signal/register
  app.post('/api/signal/register', requireUserId, (req, res) => {
    const spawned = signalDaemonManager.start(req.userId);
    res.json({ ok: true, spawned });
  });

  // GET /api/signal/status
  app.get('/api/signal/status', requireUserId, (req, res) => {
    res.json(signalDaemonManager.getStatus(req.userId));
  });

  // POST /api/signal/stop
  app.post('/api/signal/stop', requireUserId, (req, res) => {
    signalDaemonManager.stop(req.userId);
    res.json({ ok: true });
  });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  jest.restoreAllMocks();
  delete process.env.SIGNAL_DATA_ROOT;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/signal/register', () => {
  test('spawns a daemon and returns { ok: true, spawned: true } with valid token', async () => {
    const res = await request(app)
      .post('/api/signal/register')
      .set('Authorization', 'Bearer user1')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, spawned: true });
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  test('does not spawn a second process for the same userId (idempotent)', async () => {
    await request(app)
      .post('/api/signal/register')
      .set('Authorization', 'Bearer user1')
      .send({});

    const res = await request(app)
      .post('/api/signal/register')
      .set('Authorization', 'Bearer user1')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, spawned: false });
    expect(spawnMock).toHaveBeenCalledTimes(1); // still only one spawn
  });

  test('returns 401 without an Authorization header', async () => {
    const res = await request(app)
      .post('/api/signal/register')
      .send({});

    expect(res.status).toBe(401);
  });
});

describe('GET /api/signal/status', () => {
  test('returns { running: true } when a daemon is live for that userId', async () => {
    // Register first
    await request(app)
      .post('/api/signal/register')
      .set('Authorization', 'Bearer user1')
      .send({});

    const res = await request(app)
      .get('/api/signal/status')
      .set('Authorization', 'Bearer user1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ running: true });
  });

  test('returns { running: false } when no daemon has been started for that userId', async () => {
    const res = await request(app)
      .get('/api/signal/status')
      .set('Authorization', 'Bearer nobody');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ running: false });
  });

  test('returns 401 without an Authorization header', async () => {
    const res = await request(app).get('/api/signal/status');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/signal/stop', () => {
  test('stops the daemon for the userId and status becomes false', async () => {
    await request(app)
      .post('/api/signal/register')
      .set('Authorization', 'Bearer user1')
      .send({});

    const stopRes = await request(app)
      .post('/api/signal/stop')
      .set('Authorization', 'Bearer user1')
      .send({});

    expect(stopRes.status).toBe(200);
    expect(stopRes.body).toEqual({ ok: true });

    const statusRes = await request(app)
      .get('/api/signal/status')
      .set('Authorization', 'Bearer user1');

    expect(statusRes.body).toEqual({ running: false });
  });

  test('stopping user1 does not affect user2 daemon', async () => {
    await request(app)
      .post('/api/signal/register')
      .set('Authorization', 'Bearer user1')
      .send({});

    await request(app)
      .post('/api/signal/register')
      .set('Authorization', 'Bearer user2')
      .send({});

    // Stop only user1
    await request(app)
      .post('/api/signal/stop')
      .set('Authorization', 'Bearer user1')
      .send({});

    // user1 is stopped
    const u1 = await request(app)
      .get('/api/signal/status')
      .set('Authorization', 'Bearer user1');
    expect(u1.body).toEqual({ running: false });

    // user2 is still running
    const u2 = await request(app)
      .get('/api/signal/status')
      .set('Authorization', 'Bearer user2');
    expect(u2.body).toEqual({ running: true });
  });

  test('returns 401 without an Authorization header', async () => {
    const res = await request(app).post('/api/signal/stop').send({});
    expect(res.status).toBe(401);
  });
});
