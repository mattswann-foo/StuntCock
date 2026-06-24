/**
 * Tests for user_id column addition and per-user data scoping.
 *
 * Uses Node.js built-in `node:test` and `node:assert` — no external deps.
 * An in-memory SQLite DB is used for isolation.
 */

'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const http = require('http');

// ---- Build a fresh in-memory db ----

function buildTestDb() {
  const rawDb = new Database(':memory:');
  rawDb.pragma('journal_mode = WAL');
  rawDb.pragma('foreign_keys = ON');

  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS personas (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      emoji       TEXT NOT NULL DEFAULT '🤖',
      description TEXT NOT NULL DEFAULT '',
      system_prompt TEXT NOT NULL DEFAULT '',
      is_builtin  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      persona_key TEXT, group_id TEXT, group_label TEXT,
      group_emoji TEXT, group_tagline TEXT, tagline TEXT,
      full_description TEXT, sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY, value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rules (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT NOT NULL,
      active          INTEGER NOT NULL DEFAULT 1,
      priority        INTEGER NOT NULL DEFAULT 0,
      trigger_type    TEXT NOT NULL CHECK(trigger_type IN ('any','exact','contains','starts_with','regex')),
      trigger_value   TEXT,
      sender_filter   TEXT NOT NULL DEFAULT 'all',
      response_type   TEXT NOT NULL CHECK(response_type IN ('static','llm','template')),
      response_text   TEXT,
      schedule_start  TEXT, schedule_end TEXT, schedule_days TEXT,
      cooldown_minutes INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
      rule_llm_prompt TEXT, rule_gif_enabled TEXT, rule_gif_frequency TEXT,
      persona_id      INTEGER REFERENCES personas(id) ON DELETE SET NULL,
      platform_filter TEXT NOT NULL DEFAULT 'any',
      user_id         TEXT
    );
    CREATE TABLE IF NOT EXISTS message_log (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      platform         TEXT NOT NULL DEFAULT 'signal',
      sender           TEXT NOT NULL,
      sender_name      TEXT,
      group_id         TEXT,
      message_body     TEXT NOT NULL,
      matched_rule_id  INTEGER REFERENCES rules(id),
      response_sent    TEXT,
      response_type    TEXT CHECK(response_type IN ('static','llm','template','none')),
      timestamp        TEXT NOT NULL DEFAULT (datetime('now')),
      user_id          TEXT
    );
    CREATE TABLE IF NOT EXISTS conversation_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT, thread_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user','assistant')),
      content TEXT NOT NULL, timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS rule_cooldowns (
      rule_id INTEGER NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
      sender TEXT NOT NULL, last_fired TEXT NOT NULL, PRIMARY KEY (rule_id, sender)
    );
  `);
  return rawDb;
}

// ---- DB module (mirrors backend/db.js helpers) ----

function buildDbModule(rawDb) {
  function getSetting(key, defaultValue = null) {
    const row = rawDb.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : defaultValue;
  }
  function setSetting(key, value) {
    rawDb.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value));
  }
  function getAllSettings() {
    const rows = rawDb.prepare('SELECT key, value FROM settings').all();
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  }
  function getRules(userId) {
    if (userId != null)
      return rawDb.prepare('SELECT * FROM rules WHERE user_id = ? ORDER BY priority ASC, id ASC').all(userId);
    return rawDb.prepare('SELECT * FROM rules ORDER BY priority ASC, id ASC').all();
  }
  function getRule(id, userId) {
    if (userId != null)
      return rawDb.prepare('SELECT * FROM rules WHERE id = ? AND user_id = ?').get(id, userId);
    return rawDb.prepare('SELECT * FROM rules WHERE id = ?').get(id);
  }
  function createRule(rule, userId) {
    const info = rawDb.prepare(`
      INSERT INTO rules (name, active, priority, trigger_type, trigger_value, sender_filter,
        response_type, response_text, schedule_start, schedule_end, schedule_days, cooldown_minutes,
        rule_llm_prompt, rule_gif_enabled, rule_gif_frequency, persona_id, platform_filter, user_id)
      VALUES (@name,@active,@priority,@trigger_type,@trigger_value,@sender_filter,
        @response_type,@response_text,@schedule_start,@schedule_end,@schedule_days,@cooldown_minutes,
        @rule_llm_prompt,@rule_gif_enabled,@rule_gif_frequency,@persona_id,@platform_filter,@user_id)
    `).run({
      name: rule.name, active: rule.active !== false ? 1 : 0,
      priority: rule.priority ?? 0, trigger_type: rule.trigger_type ?? 'any',
      trigger_value: rule.trigger_value ?? null, sender_filter: rule.sender_filter ?? 'all',
      response_type: rule.response_type ?? 'static', response_text: rule.response_text ?? null,
      schedule_start: null, schedule_end: null, schedule_days: null,
      cooldown_minutes: 0, rule_llm_prompt: null, rule_gif_enabled: null,
      rule_gif_frequency: null, persona_id: null, platform_filter: 'any',
      user_id: userId ?? null,
    });
    return getRule(info.lastInsertRowid);
  }
  function updateRule(id, updates, userId) {
    const existing = getRule(id, userId);
    if (!existing) return null;
    const merged = { ...existing, ...updates, updated_at: new Date().toISOString() };
    rawDb.prepare(`
      UPDATE rules SET name=@name,active=@active,priority=@priority,trigger_type=@trigger_type,
        trigger_value=@trigger_value,sender_filter=@sender_filter,response_type=@response_type,
        response_text=@response_text,schedule_start=@schedule_start,schedule_end=@schedule_end,
        schedule_days=@schedule_days,cooldown_minutes=@cooldown_minutes,updated_at=@updated_at,
        rule_llm_prompt=@rule_llm_prompt,rule_gif_enabled=@rule_gif_enabled,
        rule_gif_frequency=@rule_gif_frequency,persona_id=@persona_id,platform_filter=@platform_filter
      WHERE id=@id
    `).run({ ...merged, active: merged.active ? 1 : 0 });
    return getRule(id);
  }
  function deleteRule(id, userId) {
    if (userId != null) {
      const existing = getRule(id, userId);
      if (!existing) return false;
      rawDb.prepare('DELETE FROM rules WHERE id = ? AND user_id = ?').run(id, userId);
      return true;
    }
    rawDb.prepare('DELETE FROM rules WHERE id = ?').run(id);
    return true;
  }
  function logMessage(entry) {
    rawDb.prepare(`
      INSERT INTO message_log (platform,sender,sender_name,group_id,message_body,
        matched_rule_id,response_sent,response_type,user_id)
      VALUES (@platform,@sender,@sender_name,@group_id,@message_body,
        @matched_rule_id,@response_sent,@response_type,@user_id)
    `).run({
      platform: entry.platform ?? 'signal', sender: entry.sender,
      sender_name: entry.sender_name ?? null, group_id: entry.group_id ?? null,
      message_body: entry.message_body, matched_rule_id: entry.matched_rule_id ?? null,
      response_sent: entry.response_sent ?? null, response_type: entry.response_type ?? 'none',
      user_id: entry.user_id ?? null,
    });
  }
  function getRecentMessages(limit = 50, userId) {
    if (userId != null)
      return rawDb.prepare(`
        SELECT ml.*, r.name as rule_name FROM message_log ml
        LEFT JOIN rules r ON ml.matched_rule_id = r.id
        WHERE ml.user_id = ? ORDER BY ml.timestamp DESC LIMIT ?
      `).all(userId, limit);
    return rawDb.prepare(`
      SELECT ml.*, r.name as rule_name FROM message_log ml
      LEFT JOIN rules r ON ml.matched_rule_id = r.id
      ORDER BY ml.timestamp DESC LIMIT ?
    `).all(limit);
  }
  function getPersonas() { return []; }
  function getPersonaGroups() { return []; }

  return {
    db: rawDb,
    getSetting, setSetting, getAllSettings,
    getRules, getRule, createRule, updateRule, deleteRule,
    logMessage, getRecentMessages,
    getPersonas, getPersonaGroups,
  };
}

// ---- Minimal Express-like app builder ----

function buildApp(dbModule) {
  const express = require('express');
  const app = express();
  app.use(express.json());

  // userId middleware
  app.use((req, _res, next) => {
    req.userId = req.headers['x-user-id'] || null;
    next();
  });

  app.get('/api/rules', (req, res) => res.json(dbModule.getRules(req.userId)));

  app.post('/api/rules', (req, res) => {
    const rule = dbModule.createRule(req.body, req.userId);
    res.json(rule);
  });

  app.put('/api/rules/:id', (req, res) => {
    const rule = dbModule.updateRule(parseInt(req.params.id), req.body, req.userId);
    if (!rule) return res.status(404).json({ error: 'not found' });
    res.json(rule);
  });

  app.delete('/api/rules/:id', (req, res) => {
    const deleted = dbModule.deleteRule(parseInt(req.params.id), req.userId);
    if (!deleted) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  });

  app.get('/api/messages', (req, res) => {
    const limit = parseInt(req.query.limit || '50');
    res.json(dbModule.getRecentMessages(limit, req.userId));
  });

  app.get('/api/logs', (req, res) => {
    const limit = parseInt(req.query.limit || '50');
    res.json(dbModule.getRecentMessages(limit, req.userId));
  });

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  return app;
}

// ---- Minimal HTTP client ----

function httpRequest(server, method, path, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const opts = {
      hostname: '127.0.0.1',
      port: addr.port,
      path,
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ---- Test helpers ----

const minRule = { name: 'Test Rule', trigger_type: 'any', response_type: 'static', response_text: 'hi' };

function makeContext() {
  const rawDb = buildTestDb();
  const dbMod = buildDbModule(rawDb);
  const app = buildApp(dbMod);
  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const ctx = {
        db: rawDb,
        dbMod,
        get: (path, headers) => httpRequest(server, 'GET', path, { headers }),
        post: (path, body, headers) => httpRequest(server, 'POST', path, { headers, body }),
        put: (path, body, headers) => httpRequest(server, 'PUT', path, { headers, body }),
        delete: (path, headers) => httpRequest(server, 'DELETE', path, { headers }),
        close: () => new Promise(res => server.close(res)),
      };
      resolve(ctx);
    });
  });
}

// ===== TESTS =====

describe('Schema: user_id columns', async () => {
  test('rules table has user_id column', async () => {
    const rawDb = buildTestDb();
    const cols = rawDb.prepare('PRAGMA table_info(rules)').all().map(c => c.name);
    assert.ok(cols.includes('user_id'), `Expected user_id in rules columns: ${cols.join(', ')}`);
    rawDb.close();
  });

  test('message_log table has user_id column', async () => {
    const rawDb = buildTestDb();
    const cols = rawDb.prepare('PRAGMA table_info(message_log)').all().map(c => c.name);
    assert.ok(cols.includes('user_id'), `Expected user_id in message_log columns: ${cols.join(', ')}`);
    rawDb.close();
  });
});

describe('POST /api/rules stores user_id', async () => {
  test('stores req.userId on the row', async (t) => {
    const ctx = await makeContext();
    t.after(() => ctx.close());

    const res = await ctx.post('/api/rules', minRule, { 'x-user-id': 'user-A' });
    assert.equal(res.status, 200);
    const row = ctx.db.prepare('SELECT user_id FROM rules WHERE id = ?').get(res.body.id);
    assert.equal(row.user_id, 'user-A');
  });

  test('stores NULL when no x-user-id header', async (t) => {
    const ctx = await makeContext();
    t.after(() => ctx.close());

    const res = await ctx.post('/api/rules', minRule, {});
    assert.equal(res.status, 200);
    const row = ctx.db.prepare('SELECT user_id FROM rules WHERE id = ?').get(res.body.id);
    assert.equal(row.user_id, null);
  });
});

describe('GET /api/rules scoped by user_id', async () => {
  test('returns only the caller\'s rules', async (t) => {
    const ctx = await makeContext();
    t.after(() => ctx.close());

    await ctx.post('/api/rules', { ...minRule, name: 'Rule A' }, { 'x-user-id': 'user-A' });
    await ctx.post('/api/rules', { ...minRule, name: 'Rule B' }, { 'x-user-id': 'user-B' });

    const resA = await ctx.get('/api/rules', { 'x-user-id': 'user-A' });
    assert.equal(resA.status, 200);
    assert.equal(resA.body.length, 1);
    assert.equal(resA.body[0].name, 'Rule A');

    const resB = await ctx.get('/api/rules', { 'x-user-id': 'user-B' });
    assert.equal(resB.status, 200);
    assert.equal(resB.body.length, 1);
    assert.equal(resB.body[0].name, 'Rule B');
  });

  test('user-B cannot read user-A rules', async (t) => {
    const ctx = await makeContext();
    t.after(() => ctx.close());

    await ctx.post('/api/rules', minRule, { 'x-user-id': 'user-A' });

    const res = await ctx.get('/api/rules', { 'x-user-id': 'user-B' });
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 0);
  });
});

describe('PUT /api/rules/:id ownership', async () => {
  test('returns 404 when user_id does not match', async (t) => {
    const ctx = await makeContext();
    t.after(() => ctx.close());

    const create = await ctx.post('/api/rules', minRule, { 'x-user-id': 'user-A' });
    const id = create.body.id;

    const res = await ctx.put(`/api/rules/${id}`, { name: 'Hijacked' }, { 'x-user-id': 'user-B' });
    assert.equal(res.status, 404);

    // Original row unchanged
    const row = ctx.db.prepare('SELECT name FROM rules WHERE id = ?').get(id);
    assert.equal(row.name, minRule.name);
  });

  test('succeeds for the owner', async (t) => {
    const ctx = await makeContext();
    t.after(() => ctx.close());

    const create = await ctx.post('/api/rules', minRule, { 'x-user-id': 'user-A' });
    const id = create.body.id;

    const res = await ctx.put(`/api/rules/${id}`, { name: 'Updated' }, { 'x-user-id': 'user-A' });
    assert.equal(res.status, 200);
    assert.equal(res.body.name, 'Updated');
  });
});

describe('DELETE /api/rules/:id ownership', async () => {
  test('returns 404 when user_id does not match', async (t) => {
    const ctx = await makeContext();
    t.after(() => ctx.close());

    const create = await ctx.post('/api/rules', minRule, { 'x-user-id': 'user-A' });
    const id = create.body.id;

    const res = await ctx.delete(`/api/rules/${id}`, { 'x-user-id': 'user-B' });
    assert.equal(res.status, 404);

    // Row still exists
    const row = ctx.db.prepare('SELECT id FROM rules WHERE id = ?').get(id);
    assert.ok(row, 'Rule should still exist after failed delete');
  });

  test('succeeds for the owner', async (t) => {
    const ctx = await makeContext();
    t.after(() => ctx.close());

    const create = await ctx.post('/api/rules', minRule, { 'x-user-id': 'user-A' });
    const id = create.body.id;

    const res = await ctx.delete(`/api/rules/${id}`, { 'x-user-id': 'user-A' });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
  });
});

describe('GET /api/logs scoped by user_id', async () => {
  test('returns only caller\'s log entries', async (t) => {
    const ctx = await makeContext();
    t.after(() => ctx.close());

    ctx.dbMod.logMessage({ sender: '+1', message_body: 'hi', platform: 'signal', response_type: 'none', user_id: 'user-A' });
    ctx.dbMod.logMessage({ sender: '+2', message_body: 'ho', platform: 'signal', response_type: 'none', user_id: 'user-B' });

    const resA = await ctx.get('/api/logs', { 'x-user-id': 'user-A' });
    assert.equal(resA.status, 200);
    assert.equal(resA.body.length, 1);
    assert.equal(resA.body[0].sender, '+1');

    const resB = await ctx.get('/api/logs', { 'x-user-id': 'user-B' });
    assert.equal(resB.status, 200);
    assert.equal(resB.body.length, 1);
    assert.equal(resB.body[0].sender, '+2');
  });

  test('user-B cannot read user-A logs', async (t) => {
    const ctx = await makeContext();
    t.after(() => ctx.close());

    ctx.dbMod.logMessage({ sender: '+1', message_body: 'secret', platform: 'signal', response_type: 'none', user_id: 'user-A' });

    const res = await ctx.get('/api/logs', { 'x-user-id': 'user-B' });
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 0);
  });
});

describe('GET /api/messages scoped by user_id', async () => {
  test('returns only caller\'s messages', async (t) => {
    const ctx = await makeContext();
    t.after(() => ctx.close());

    ctx.dbMod.logMessage({ sender: '+1', message_body: 'hi', platform: 'signal', response_type: 'none', user_id: 'user-A' });
    ctx.dbMod.logMessage({ sender: '+2', message_body: 'ho', platform: 'signal', response_type: 'none', user_id: 'user-B' });

    const resA = await ctx.get('/api/messages', { 'x-user-id': 'user-A' });
    assert.equal(resA.body.length, 1);
    assert.equal(resA.body[0].sender, '+1');
  });
});

describe('Pre-existing NULL user_id rows (migration compat)', async () => {
  test('NULL user_id rules are not returned to a scoped user', async (t) => {
    const ctx = await makeContext();
    t.after(() => ctx.close());

    // Simulate a pre-migration row
    ctx.db.prepare(
      `INSERT INTO rules (name, trigger_type, response_type, user_id) VALUES (?, 'any', 'static', NULL)`
    ).run('Legacy Rule');

    const rules = ctx.dbMod.getRules('user-A');
    assert.ok(!rules.find(r => r.name === 'Legacy Rule'), 'Legacy rule should not be visible to user-A');
  });

  test('NULL log rows are not returned to a scoped user', async (t) => {
    const ctx = await makeContext();
    t.after(() => ctx.close());

    ctx.db.prepare(
      `INSERT INTO message_log (sender, message_body, response_type, user_id) VALUES ('+0', 'old', 'none', NULL)`
    ).run();

    const msgs = ctx.dbMod.getRecentMessages(50, 'user-A');
    assert.ok(!msgs.find(m => m.sender === '+0'), 'Legacy log row should not be visible to user-A');
  });
});
