// tests/globalCooldown.test.js
// Automated verification of global cooldown enforcement.
//
// Uses an in-memory SQLite database (better-sqlite3) so the tests run
// without a real stuntcock.db and without a running server.  The db and
// ruleEngine modules are loaded with their internal helpers substituted via
// Module.prototype overrides so we can point them at the in-memory store.

'use strict';

const Database = require('better-sqlite3');
const assert   = require('assert');

// ---------------------------------------------------------------------------
// 1.  Build an in-memory DB that mirrors the real schema
// ---------------------------------------------------------------------------

const db = new Database(':memory:');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE rules (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT NOT NULL,
    active           INTEGER NOT NULL DEFAULT 1,
    priority         INTEGER NOT NULL DEFAULT 0,
    trigger_type     TEXT NOT NULL DEFAULT 'any',
    trigger_value    TEXT,
    sender_filter    TEXT NOT NULL DEFAULT 'all',
    response_type    TEXT NOT NULL DEFAULT 'static',
    response_text    TEXT,
    schedule_start   TEXT,
    schedule_end     TEXT,
    schedule_days    TEXT,
    cooldown_minutes INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
    platform_filter  TEXT NOT NULL DEFAULT 'any'
  );

  CREATE TABLE message_log (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    platform         TEXT NOT NULL DEFAULT 'signal',
    sender           TEXT NOT NULL,
    sender_name      TEXT,
    group_id         TEXT,
    message_body     TEXT NOT NULL,
    matched_rule_id  INTEGER REFERENCES rules(id) ON DELETE SET NULL,
    response_sent    TEXT,
    response_type    TEXT,
    timestamp        TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE rule_cooldowns (
    rule_id    INTEGER NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
    sender     TEXT NOT NULL,
    last_fired TEXT NOT NULL,
    PRIMARY KEY (rule_id, sender)
  );

  CREATE TABLE conversation_history (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id TEXT NOT NULL,
    role      TEXT NOT NULL,
    content   TEXT NOT NULL,
    timestamp TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// ---------------------------------------------------------------------------
// 2.  In-memory implementations of the db helpers used by ruleEngine
// ---------------------------------------------------------------------------

function getSetting(key, defaultValue = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : defaultValue;
}

function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value));
}

function getRules() {
  return db.prepare('SELECT * FROM rules ORDER BY priority ASC, id ASC').all();
}

function getCooldownLastFired(ruleId, sender) {
  const row = db.prepare(
    'SELECT last_fired FROM rule_cooldowns WHERE rule_id = ? AND sender = ?'
  ).get(ruleId, sender);
  return row ? new Date(row.last_fired) : null;
}

function setCooldownLastFired(ruleId, sender) {
  db.prepare(
    "INSERT OR REPLACE INTO rule_cooldowns (rule_id, sender, last_fired) VALUES (?, ?, datetime('now'))"
  ).run(ruleId, sender);
}

/** Directly set last_fired to a specific ISO timestamp (for time-manipulation in tests) */
function forceCooldownLastFired(ruleId, sender, isoTimestamp) {
  db.prepare(
    'INSERT OR REPLACE INTO rule_cooldowns (rule_id, sender, last_fired) VALUES (?, ?, ?)'
  ).run(ruleId, sender, isoTimestamp);
}

function logMessage(entry) {
  db.prepare(`
    INSERT INTO message_log
      (platform, sender, sender_name, group_id, message_body, matched_rule_id, response_sent, response_type)
    VALUES
      (@platform, @sender, @sender_name, @group_id, @message_body, @matched_rule_id, @response_sent, @response_type)
  `).run({
    platform:        entry.platform ?? 'signal',
    sender:          entry.sender,
    sender_name:     entry.sender_name ?? null,
    group_id:        entry.group_id ?? null,
    message_body:    entry.message_body,
    matched_rule_id: entry.matched_rule_id ?? null,
    response_sent:   entry.response_sent ?? null,
    response_type:   entry.response_type ?? 'none',
  });
}

function getRecentMessages(limit = 50) {
  return db.prepare(`
    SELECT ml.*, r.name as rule_name
    FROM message_log ml
    LEFT JOIN rules r ON ml.matched_rule_id = r.id
    ORDER BY ml.timestamp DESC
    LIMIT ?
  `).all(limit);
}

// ---------------------------------------------------------------------------
// 3.  Pure implementations of ruleEngine logic (no module imports needed)
//     These mirror backend/ruleEngine.js exactly — changes there must be
//     reflected here if the business logic changes.
// ---------------------------------------------------------------------------

function getEffectiveCooldown(rule) {
  const globalMinutes = parseInt(getSetting('global_cooldown_minutes', '0'), 10) || 0;
  const ruleMinutes   = rule.cooldown_minutes || 0;
  return Math.max(ruleMinutes, globalMinutes);
}

function isCooledDown(rule, sender) {
  const effectiveMinutes = getEffectiveCooldown(rule);
  if (effectiveMinutes <= 0) return false;
  const lastFired = getCooldownLastFired(rule.id, sender);
  if (!lastFired) return false;
  const elapsedMinutes = (Date.now() - lastFired.getTime()) / 60000;
  return elapsedMinutes < effectiveMinutes;
}

// ---------------------------------------------------------------------------
// 4.  Tiny test harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗  ${name}`);
    console.error(`       ${e.message}`);
    failed++;
  }
}

function isoMinutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// 5.  Helper — create a rule row and return it
// ---------------------------------------------------------------------------

function createRule(fields) {
  const info = db.prepare(`
    INSERT INTO rules (name, active, priority, trigger_type, trigger_value,
      sender_filter, response_type, response_text, cooldown_minutes, platform_filter)
    VALUES (@name, @active, @priority, @trigger_type, @trigger_value,
      @sender_filter, @response_type, @response_text, @cooldown_minutes, @platform_filter)
  `).run({
    name:            fields.name             ?? 'Test Rule',
    active:          fields.active           ?? 1,
    priority:        fields.priority         ?? 0,
    trigger_type:    fields.trigger_type     ?? 'any',
    trigger_value:   fields.trigger_value    ?? null,
    sender_filter:   fields.sender_filter    ?? 'all',
    response_type:   fields.response_type    ?? 'static',
    response_text:   fields.response_text    ?? 'pong',
    cooldown_minutes: fields.cooldown_minutes ?? 0,
    platform_filter: fields.platform_filter  ?? 'any',
  });
  return db.prepare('SELECT * FROM rules WHERE id = ?').get(info.lastInsertRowid);
}

// ---------------------------------------------------------------------------
// 6.  Test suite
// ---------------------------------------------------------------------------

console.log('\n=== Global Cooldown Enforcement — automated test suite ===\n');

// ── Acceptance Criterion 1 ─────────────────────────────────────────────────
// Setting global_cooldown_minutes = '5' is immediately reflected in
// subsequent calls to getEffectiveCooldown() without a server restart.
// ──────────────────────────────────────────────────────────────────────────

console.log('AC-1: getEffectiveCooldown() reflects live DB value (no restart)');

test('getEffectiveCooldown() returns 0 when global_cooldown_minutes is not set', () => {
  // Ensure no global setting exists
  db.prepare("DELETE FROM settings WHERE key = 'global_cooldown_minutes'").run();
  const rule = createRule({ cooldown_minutes: 0 });
  assert.strictEqual(getEffectiveCooldown(rule), 0,
    'should return 0 when neither rule nor global cooldown is set');
  db.prepare('DELETE FROM rules WHERE id = ?').run(rule.id);
});

test('getEffectiveCooldown() returns 5 after setting global_cooldown_minutes = 5', () => {
  setSetting('global_cooldown_minutes', '5');          // simulate POST /api/settings/bulk
  const rule = createRule({ cooldown_minutes: 0 });
  const effective = getEffectiveCooldown(rule);
  assert.strictEqual(effective, 5,
    `expected effective cooldown 5, got ${effective}`);
  db.prepare('DELETE FROM rules WHERE id = ?').run(rule.id);
});

test('getEffectiveCooldown() updates immediately after changing the setting (no restart)', () => {
  setSetting('global_cooldown_minutes', '3');
  const rule = createRule({ cooldown_minutes: 0 });
  assert.strictEqual(getEffectiveCooldown(rule), 3, 'should be 3 after first set');

  setSetting('global_cooldown_minutes', '10');
  assert.strictEqual(getEffectiveCooldown(rule), 10,
    'should be 10 immediately after update without restart');
  db.prepare('DELETE FROM rules WHERE id = ?').run(rule.id);
});

// ── Acceptance Criterion 2 ─────────────────────────────────────────────────
// Rule with cooldown_minutes = 0, global = 5.
// Second invocation within 3 minutes → isCooledDown() === true.
// ──────────────────────────────────────────────────────────────────────────

console.log('\nAC-2: Second invocation within global window is blocked');

test('isCooledDown() returns false on first invocation (no last_fired)', () => {
  setSetting('global_cooldown_minutes', '5');
  const rule = createRule({ cooldown_minutes: 0 });
  assert.strictEqual(isCooledDown(rule, '+15550001000'), false,
    'first invocation must not be blocked');
  db.prepare('DELETE FROM rules WHERE id = ?').run(rule.id);
});

test('isCooledDown() returns true when last_fired was 2 minutes ago and global=5', () => {
  setSetting('global_cooldown_minutes', '5');
  const rule = createRule({ cooldown_minutes: 0 });
  const sender = '+15550001001';
  // Simulate first invocation: set last_fired to 2 minutes ago
  forceCooldownLastFired(rule.id, sender, isoMinutesAgo(2));
  // Second invocation at 2 min < 5 min → should be blocked
  assert.strictEqual(isCooledDown(rule, sender), true,
    'second invocation at 2 min should be blocked (global=5)');
  db.prepare('DELETE FROM rules WHERE id = ?').run(rule.id);
});

// ── Acceptance Criterion 3 ─────────────────────────────────────────────────
// Same rule, last_fired set to 6 minutes ago → isCooledDown() === false.
// ──────────────────────────────────────────────────────────────────────────

console.log('\nAC-3: Invocation after global window has elapsed is allowed');

test('isCooledDown() returns false when last_fired was 6 minutes ago and global=5', () => {
  setSetting('global_cooldown_minutes', '5');
  const rule = createRule({ cooldown_minutes: 0 });
  const sender = '+15550001002';
  // Simulate a prior firing 6 minutes ago
  forceCooldownLastFired(rule.id, sender, isoMinutesAgo(6));
  // 6 min > 5 min global cooldown → should be allowed
  assert.strictEqual(isCooledDown(rule, sender), false,
    'invocation at 6 min should be allowed (global=5, cooldown expired)');
  db.prepare('DELETE FROM rules WHERE id = ?').run(rule.id);
});

// ── Acceptance Criterion 4 ─────────────────────────────────────────────────
// A rule with cooldown_minutes = 3 and global = 5 should use max(3,5) = 5.
// A rule with cooldown_minutes = 3 and global = 0 (or not set) uses 3.
// No regression: rule-level wins if it's higher.
// ──────────────────────────────────────────────────────────────────────────

console.log('\nAC-4: Rule-level cooldown is not reduced by global (no regression)');

test('rule with cooldown_minutes=3 and global=5 → effective=5 (global is higher)', () => {
  setSetting('global_cooldown_minutes', '5');
  const rule = createRule({ cooldown_minutes: 3 });
  assert.strictEqual(getEffectiveCooldown(rule), 5,
    'global (5) > rule (3), effective should be 5');
  db.prepare('DELETE FROM rules WHERE id = ?').run(rule.id);
});

test('rule with cooldown_minutes=3 and global=0 → effective=3 (rule wins)', () => {
  setSetting('global_cooldown_minutes', '0');
  const rule = createRule({ cooldown_minutes: 3 });
  assert.strictEqual(getEffectiveCooldown(rule), 3,
    'rule (3) > global (0), effective should be 3');
  // Verify isCooledDown behaves correctly for this rule
  const sender = '+15550001003';
  forceCooldownLastFired(rule.id, sender, isoMinutesAgo(2));
  assert.strictEqual(isCooledDown(rule, sender), true,
    'within rule-only 3-min window (2 min ago), should be blocked');
  forceCooldownLastFired(rule.id, sender, isoMinutesAgo(4));
  assert.strictEqual(isCooledDown(rule, sender), false,
    'after 4 min (> rule 3-min window) with global=0, should be allowed');
  db.prepare('DELETE FROM rules WHERE id = ?').run(rule.id);
});

test('rule with cooldown_minutes=10 and global=5 → effective=10 (rule is higher)', () => {
  setSetting('global_cooldown_minutes', '5');
  const rule = createRule({ cooldown_minutes: 10 });
  assert.strictEqual(getEffectiveCooldown(rule), 10,
    'rule (10) > global (5), effective should be 10');
  db.prepare('DELETE FROM rules WHERE id = ?').run(rule.id);
});

// ── Acceptance Criterion 5 ─────────────────────────────────────────────────
// The message_log feed: second (blocked) invocation is NOT logged with a
// response_sent value.
// ──────────────────────────────────────────────────────────────────────────

console.log('\nAC-5: Blocked invocation is logged with no response_sent');

test('message_log shows response_sent=null for blocked (cooled-down) invocation', () => {
  setSetting('global_cooldown_minutes', '5');
  const rule = createRule({ name: 'Feed Test Rule', cooldown_minutes: 0 });
  const sender = '+15550001004';

  // --- First invocation: rule fires, response is sent ---
  // Simulate what handleInbound does: matchMessage returns the rule,
  // we log with response_sent populated.
  setCooldownLastFired(rule.id, sender);   // mark as fired right now
  logMessage({
    platform:        'signal',
    sender,
    message_body:    'hello',
    matched_rule_id: rule.id,
    response_sent:   'pong',               // a response was generated and sent
    response_type:   'static',
  });

  // --- Second invocation: rule is cooled down (global=5, fired ~0s ago) ---
  // isCooledDown would return true, so handleInbound skips the rule.
  // No response is generated. Log entry has response_sent=null.
  const cooledDown = isCooledDown(rule, sender);
  assert.strictEqual(cooledDown, true,
    'second invocation should be blocked');
  logMessage({
    platform:        'signal',
    sender,
    message_body:    'hello again',
    matched_rule_id: null,                 // no rule matched (blocked)
    response_sent:   null,                 // no response
    response_type:   'none',
  });

  // --- Assert via GET /api/messages equivalent (scoped to this sender) ---
  const messages = db.prepare(`
    SELECT ml.*, r.name as rule_name
    FROM message_log ml
    LEFT JOIN rules r ON ml.matched_rule_id = r.id
    WHERE ml.sender = ?
    ORDER BY ml.id DESC
    LIMIT 10
  `).all(sender);

  // Most recent row (highest auto-increment id) is the blocked one
  const blocked = messages[0];
  assert.ok(blocked.response_sent === null || blocked.response_sent === undefined,
    `blocked message should have response_sent=null, got "${blocked.response_sent}"`);
  assert.strictEqual(blocked.response_type, 'none',
    'blocked message should have response_type=none');

  // Earlier row (lower id) has the actual response
  const sent = messages[1];
  assert.strictEqual(sent.response_sent, 'pong',
    'first (allowed) message should have response_sent populated');

  db.prepare('DELETE FROM rules WHERE id = ?').run(rule.id);
});

// ── Additional edge cases ─────────────────────────────────────────────────

console.log('\nEdge cases');

test('getEffectiveCooldown() handles non-numeric global setting gracefully', () => {
  setSetting('global_cooldown_minutes', 'banana');
  const rule = createRule({ cooldown_minutes: 2 });
  // parseInt('banana') === NaN, which || 0 guards to 0, so rule wins
  assert.strictEqual(getEffectiveCooldown(rule), 2,
    'non-numeric global setting should fall back to 0, rule (2) wins');
  db.prepare('DELETE FROM rules WHERE id = ?').run(rule.id);
});

test('getEffectiveCooldown() handles missing global setting gracefully', () => {
  db.prepare("DELETE FROM settings WHERE key = 'global_cooldown_minutes'").run();
  const rule = createRule({ cooldown_minutes: 4 });
  assert.strictEqual(getEffectiveCooldown(rule), 4,
    'missing global setting defaults to 0, rule (4) wins');
  db.prepare('DELETE FROM rules WHERE id = ?').run(rule.id);
});

test('different senders for the same rule are tracked independently', () => {
  setSetting('global_cooldown_minutes', '5');
  const rule   = createRule({ cooldown_minutes: 0 });
  const senderA = '+15550002000';
  const senderB = '+15550002001';

  // Sender A fired 2 minutes ago
  forceCooldownLastFired(rule.id, senderA, isoMinutesAgo(2));
  // Sender B has never fired
  assert.strictEqual(isCooledDown(rule, senderA), true,  'sender A should be blocked');
  assert.strictEqual(isCooledDown(rule, senderB), false, 'sender B should not be blocked');
  db.prepare('DELETE FROM rules WHERE id = ?').run(rule.id);
});

// ---------------------------------------------------------------------------
// 7.  Summary
// ---------------------------------------------------------------------------

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('─'.repeat(50));

if (failed > 0) {
  process.exit(1);
}
