// StuntCock — SQLite database setup, migrations, and query helpers
// All persistent state for StuntCock lives here.

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const MESSAGE_LIMIT       = 50;
const HISTORY_TRIM_LIMIT  = 20;
const HISTORY_FETCH_LIMIT = 10;

const db = new Database(path.join(DB_DIR, 'stuntcock.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
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
    schedule_start  TEXT,
    schedule_end    TEXT,
    schedule_days   TEXT,
    cooldown_minutes INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS message_log (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    sender           TEXT NOT NULL,
    group_id         TEXT,
    message_body     TEXT NOT NULL,
    matched_rule_id  INTEGER REFERENCES rules(id),
    response_sent    TEXT,
    response_type    TEXT CHECK(response_type IN ('static','llm','template','none')),
    timestamp        TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS conversation_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id   TEXT NOT NULL,
    role        TEXT NOT NULL CHECK(role IN ('user','assistant')),
    content     TEXT NOT NULL,
    timestamp   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS rule_cooldowns (
    rule_id    INTEGER NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
    sender     TEXT NOT NULL,
    last_fired TEXT NOT NULL,
    PRIMARY KEY (rule_id, sender)
  );
`);

// --- Settings helpers ---

function getSetting(key, defaultValue = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : defaultValue;
}

function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value));
}

function getAllSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

// --- Rules helpers ---

function getRules() {
  return db.prepare('SELECT * FROM rules ORDER BY priority ASC, id ASC').all();
}

function getRule(id) {
  return db.prepare('SELECT * FROM rules WHERE id = ?').get(id);
}

function createRule(rule) {
  const stmt = db.prepare(`
    INSERT INTO rules (name, active, priority, trigger_type, trigger_value, sender_filter,
      response_type, response_text, schedule_start, schedule_end, schedule_days, cooldown_minutes)
    VALUES (@name, @active, @priority, @trigger_type, @trigger_value, @sender_filter,
      @response_type, @response_text, @schedule_start, @schedule_end, @schedule_days, @cooldown_minutes)
  `);
  const info = stmt.run({
    name: rule.name,
    active: rule.active !== false ? 1 : 0,
    priority: rule.priority ?? 0,
    trigger_type: rule.trigger_type,
    trigger_value: rule.trigger_value ?? null,
    sender_filter: rule.sender_filter ?? 'all',
    response_type: rule.response_type,
    response_text: rule.response_text ?? null,
    schedule_start: rule.schedule_start ?? null,
    schedule_end: rule.schedule_end ?? null,
    schedule_days: rule.schedule_days ?? null,
    cooldown_minutes: rule.cooldown_minutes ?? 0,
  });
  return getRule(info.lastInsertRowid);
}

function updateRule(id, updates) {
  const existing = getRule(id);
  if (!existing) return null;
  const merged = { ...existing, ...updates, updated_at: new Date().toISOString() };
  db.prepare(`
    UPDATE rules SET name=@name, active=@active, priority=@priority, trigger_type=@trigger_type,
      trigger_value=@trigger_value, sender_filter=@sender_filter, response_type=@response_type,
      response_text=@response_text, schedule_start=@schedule_start, schedule_end=@schedule_end,
      schedule_days=@schedule_days, cooldown_minutes=@cooldown_minutes, updated_at=@updated_at
    WHERE id=@id
  `).run({ ...merged, active: merged.active ? 1 : 0 });
  return getRule(id);
}

function deleteRule(id) {
  db.prepare('DELETE FROM rules WHERE id = ?').run(id);
}

function reorderRules(orderedIds) {
  const update = db.prepare('UPDATE rules SET priority = ? WHERE id = ?');
  const tx = db.transaction(() => {
    orderedIds.forEach((id, idx) => update.run(idx, id));
  });
  tx();
}

// --- Message log helpers ---

function logMessage(entry) {
  db.prepare(`
    INSERT INTO message_log (sender, group_id, message_body, matched_rule_id, response_sent, response_type)
    VALUES (@sender, @group_id, @message_body, @matched_rule_id, @response_sent, @response_type)
  `).run({
    sender: entry.sender,
    group_id: entry.group_id ?? null,
    message_body: entry.message_body,
    matched_rule_id: entry.matched_rule_id ?? null,
    response_sent: entry.response_sent ?? null,
    response_type: entry.response_type ?? 'none',
  });
}

function getRecentMessages(limit = MESSAGE_LIMIT) {
  return db.prepare(`
    SELECT ml.*, r.name as rule_name
    FROM message_log ml
    LEFT JOIN rules r ON ml.matched_rule_id = r.id
    ORDER BY ml.timestamp DESC
    LIMIT ?
  `).all(limit);
}

function getAnalytics(days = 7) {
  return db.prepare(`
    SELECT
      date(timestamp) as day,
      COUNT(*) as total,
      SUM(CASE WHEN response_type != 'none' THEN 1 ELSE 0 END) as replied,
      SUM(CASE WHEN response_type = 'llm' THEN 1 ELSE 0 END) as llm_triggered,
      SUM(CASE WHEN response_type = 'none' THEN 1 ELSE 0 END) as unmatched
    FROM message_log
    WHERE timestamp >= datetime('now', '-' || ? || ' days')
    GROUP BY day
    ORDER BY day ASC
  `).all(days);
}

function getTodayStats() {
  return db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN response_type != 'none' THEN 1 ELSE 0 END) as replied
    FROM message_log
    WHERE date(timestamp) = date('now')
  `).get();
}

// --- Conversation history helpers ---

function appendConversation(threadId, role, content) {
  db.prepare(`
    INSERT INTO conversation_history (thread_id, role, content)
    VALUES (?, ?, ?)
  `).run(threadId, role, content);
  // Keep only last HISTORY_TRIM_LIMIT per thread
  db.prepare(`
    DELETE FROM conversation_history
    WHERE thread_id = ? AND id NOT IN (
      SELECT id FROM conversation_history
      WHERE thread_id = ?
      ORDER BY timestamp DESC
      LIMIT ${HISTORY_TRIM_LIMIT}
    )
  `).run(threadId, threadId);
}

function getConversationHistory(threadId, limit = HISTORY_FETCH_LIMIT) {
  return db.prepare(`
    SELECT role, content FROM conversation_history
    WHERE thread_id = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(threadId, limit).reverse();
}

// --- Cooldown helpers ---

function getCooldownLastFired(ruleId, sender) {
  const row = db.prepare('SELECT last_fired FROM rule_cooldowns WHERE rule_id = ? AND sender = ?').get(ruleId, sender);
  return row ? new Date(row.last_fired) : null;
}

function setCooldownLastFired(ruleId, sender) {
  db.prepare('INSERT OR REPLACE INTO rule_cooldowns (rule_id, sender, last_fired) VALUES (?, ?, datetime("now"))').run(ruleId, sender);
}

module.exports = {
  db,
  MESSAGE_LIMIT, HISTORY_TRIM_LIMIT, HISTORY_FETCH_LIMIT,
  getSetting, setSetting, getAllSettings,
  getRules, getRule, createRule, updateRule, deleteRule, reorderRules,
  logMessage, getRecentMessages, getAnalytics, getTodayStats,
  appendConversation, getConversationHistory,
  getCooldownLastFired, setCooldownLastFired,
};
