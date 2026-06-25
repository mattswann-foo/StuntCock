// StuntCock — Cloud Firestore data layer
// All data access is scoped per authenticated user: users/{uid}/...
// This replaces better-sqlite3 for all REST-API-driven data.

const admin = require('./firebaseAdmin');

const db = admin.firestore();

// ---- Helpers ----------------------------------------------------------------

/**
 * Returns a Firestore CollectionReference scoped to the given uid.
 * @param {string} uid  Firebase Auth user ID
 * @param {string} col  Sub-collection name (e.g. 'rules', 'settings', 'messages')
 */
function col(uid, collection) {
  return db.collection('users').doc(uid).collection(collection);
}

// ---- Settings ---------------------------------------------------------------

/**
 * Fetch a single setting value for a user.
 * @param {string} uid
 * @param {string} key
 * @param {*} defaultValue
 */
async function getSetting(uid, key, defaultValue = null) {
  const snap = await col(uid, 'settings').doc(key).get();
  if (!snap.exists) return defaultValue;
  return snap.data().value ?? defaultValue;
}

/**
 * Upsert a single setting for a user.
 * @param {string} uid
 * @param {string} key
 * @param {*} value
 */
async function setSetting(uid, key, value) {
  await col(uid, 'settings').doc(key).set({ value: String(value) }, { merge: true });
}

/**
 * Fetch all settings as a flat key→value object for a user.
 * @param {string} uid
 */
async function getAllSettings(uid) {
  const snap = await col(uid, 'settings').get();
  const result = {};
  snap.forEach(doc => { result[doc.id] = doc.data().value; });
  return result;
}

/**
 * Upsert multiple settings in parallel for a user.
 * @param {string} uid
 * @param {Object} settings  key→value map
 */
async function bulkSetSettings(uid, settings) {
  const batch = db.batch();
  for (const [key, value] of Object.entries(settings)) {
    batch.set(col(uid, 'settings').doc(key), { value: String(value) }, { merge: true });
  }
  await batch.commit();
}

// ---- Rules ------------------------------------------------------------------

/**
 * Map a Firestore document snapshot to a plain rule object.
 */
function snapToRule(snap) {
  const d = snap.data();
  return {
    id: snap.id,
    name: d.name,
    active: d.active !== false,
    priority: d.priority ?? 0,
    trigger_type: d.trigger_type,
    trigger_value: d.trigger_value ?? null,
    sender_filter: d.sender_filter ?? 'all',
    response_type: d.response_type,
    response_text: d.response_text ?? null,
    schedule_start: d.schedule_start ?? null,
    schedule_end: d.schedule_end ?? null,
    schedule_days: d.schedule_days ?? null,
    cooldown_minutes: d.cooldown_minutes ?? 0,
    rule_llm_prompt: d.rule_llm_prompt ?? null,
    rule_gif_enabled: d.rule_gif_enabled ?? null,
    rule_gif_frequency: d.rule_gif_frequency ?? null,
    persona_id: d.persona_id ?? null,
    platform_filter: d.platform_filter ?? 'any',
    created_at: d.created_at ?? null,
    updated_at: d.updated_at ?? null,
  };
}

/**
 * List all rules for a user, ordered by priority then id.
 * @param {string} uid
 */
async function getRules(uid) {
  const snap = await col(uid, 'rules')
    .orderBy('priority', 'asc')
    .get();
  return snap.docs.map(snapToRule);
}

/**
 * Fetch a single rule.
 * @param {string} uid
 * @param {string} id  Firestore document ID
 */
async function getRule(uid, id) {
  const snap = await col(uid, 'rules').doc(String(id)).get();
  if (!snap.exists) return null;
  return snapToRule(snap);
}

/**
 * Create a new rule for a user.
 * @param {string} uid
 * @param {Object} rule
 */
async function createRule(uid, rule) {
  const now = new Date().toISOString();
  const data = {
    name: rule.name,
    active: rule.active !== false,
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
    rule_llm_prompt: rule.rule_llm_prompt ?? null,
    rule_gif_enabled: rule.rule_gif_enabled ?? null,
    rule_gif_frequency: rule.rule_gif_frequency ?? null,
    persona_id: rule.persona_id ?? null,
    platform_filter: rule.platform_filter ?? 'any',
    created_at: now,
    updated_at: now,
  };
  const ref = await col(uid, 'rules').add(data);
  return { id: ref.id, ...data };
}

/**
 * Update an existing rule for a user.
 * @param {string} uid
 * @param {string} id
 * @param {Object} updates
 */
async function updateRule(uid, id, updates) {
  const ref = col(uid, 'rules').doc(String(id));
  const existing = await ref.get();
  if (!existing.exists) return null;
  const merged = {
    ...existing.data(),
    ...updates,
    updated_at: new Date().toISOString(),
  };
  // Remove id from the stored data if it snuck in
  delete merged.id;
  await ref.set(merged);
  return { id, ...merged };
}

/**
 * Delete a rule and its cooldowns for a user.
 * @param {string} uid
 * @param {string} id
 */
async function deleteRule(uid, id) {
  const batch = db.batch();
  batch.delete(col(uid, 'rules').doc(String(id)));
  // Delete associated cooldowns
  const cooldowns = await col(uid, 'rule_cooldowns')
    .where('rule_id', '==', String(id))
    .get();
  cooldowns.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
}

/**
 * Reassign priorities to match the supplied ordered array of IDs.
 * @param {string} uid
 * @param {string[]} orderedIds
 */
async function reorderRules(uid, orderedIds) {
  const batch = db.batch();
  orderedIds.forEach((id, idx) => {
    batch.update(col(uid, 'rules').doc(String(id)), { priority: idx });
  });
  await batch.commit();
}

// ---- Message log ------------------------------------------------------------

/**
 * Append a message log entry.
 * @param {string} uid
 * @param {Object} entry
 */
async function logMessage(uid, entry) {
  const now = new Date().toISOString();
  await col(uid, 'messages').add({
    platform: entry.platform ?? 'signal',
    sender: entry.sender,
    sender_name: entry.sender_name ?? null,
    group_id: entry.group_id ?? null,
    message_body: entry.message_body,
    matched_rule_id: entry.matched_rule_id ?? null,
    response_sent: entry.response_sent ?? null,
    response_type: entry.response_type ?? 'none',
    timestamp: now,
  });
}

/**
 * Fetch recent messages, newest first.
 * @param {string} uid
 * @param {number} limit
 */
async function getRecentMessages(uid, limit = 50) {
  const snap = await col(uid, 'messages')
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// ---- Analytics --------------------------------------------------------------

/**
 * 7-day per-day aggregate stats.
 * @param {string} uid
 * @param {number} days
 */
async function getAnalytics(uid, days = 7) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const snap = await col(uid, 'messages')
    .where('timestamp', '>=', cutoff)
    .orderBy('timestamp', 'asc')
    .get();

  const byDay = {};
  snap.forEach(doc => {
    const d = doc.data();
    const day = d.timestamp.slice(0, 10);
    if (!byDay[day]) byDay[day] = { day, total: 0, replied: 0, llm_triggered: 0, unmatched: 0 };
    byDay[day].total++;
    if (d.response_type && d.response_type !== 'none') byDay[day].replied++;
    if (d.response_type === 'llm') byDay[day].llm_triggered++;
    if (!d.response_type || d.response_type === 'none') byDay[day].unmatched++;
  });

  return Object.values(byDay).sort((a, b) => a.day.localeCompare(b.day));
}

/**
 * Today's totals.
 * @param {string} uid
 */
async function getTodayStats(uid) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const snap = await col(uid, 'messages')
    .where('timestamp', '>=', todayStart.toISOString())
    .get();
  let total = 0;
  let replied = 0;
  snap.forEach(doc => {
    total++;
    if (doc.data().response_type && doc.data().response_type !== 'none') replied++;
  });
  return { total, replied };
}

// ---- Contacts ---------------------------------------------------------------

/**
 * Get unique contacts from message log.
 * @param {string} uid
 */
async function getContacts(uid) {
  const snap = await col(uid, 'messages')
    .orderBy('timestamp', 'desc')
    .get();
  const seen = {};
  snap.forEach(doc => {
    const d = doc.data();
    const sender = d.sender;
    if (!seen[sender]) {
      seen[sender] = {
        sender,
        sender_name: d.sender_name ?? null,
        platform: d.platform ?? 'signal',
        message_count: 0,
        last_seen: d.timestamp,
      };
    }
    seen[sender].message_count++;
  });
  return Object.values(seen);
}

// ---- Conversation history ---------------------------------------------------

/**
 * Append a conversation history entry and trim to last 20.
 * @param {string} uid
 * @param {string} threadId
 * @param {string} role
 * @param {string} content
 */
async function appendConversation(uid, threadId, role, content) {
  const now = new Date().toISOString();
  await col(uid, 'conversation_history').add({ thread_id: threadId, role, content, timestamp: now });
  // Trim: keep only latest 20 per thread
  const snap = await col(uid, 'conversation_history')
    .where('thread_id', '==', threadId)
    .orderBy('timestamp', 'desc')
    .get();
  if (snap.size > 20) {
    const batch = db.batch();
    snap.docs.slice(20).forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
}

/**
 * Fetch conversation history for a thread.
 * @param {string} uid
 * @param {string} threadId
 * @param {number} limit
 */
async function getConversationHistory(uid, threadId, limit = 10) {
  const snap = await col(uid, 'conversation_history')
    .where('thread_id', '==', threadId)
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map(doc => ({ role: doc.data().role, content: doc.data().content })).reverse();
}

// ---- Cooldowns --------------------------------------------------------------

/**
 * Get cooldown last-fired time for a rule + sender.
 * @param {string} uid
 * @param {string} ruleId
 * @param {string} sender
 */
async function getCooldownLastFired(uid, ruleId, sender) {
  const id = `${ruleId}_${sender.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const snap = await col(uid, 'rule_cooldowns').doc(id).get();
  if (!snap.exists) return null;
  return new Date(snap.data().last_fired);
}

/**
 * Set/update cooldown last-fired timestamp.
 * @param {string} uid
 * @param {string} ruleId
 * @param {string} sender
 */
async function setCooldownLastFired(uid, ruleId, sender) {
  const id = `${ruleId}_${sender.replace(/[^a-zA-Z0-9]/g, '_')}`;
  await col(uid, 'rule_cooldowns').doc(id).set({
    rule_id: String(ruleId),
    sender,
    last_fired: new Date().toISOString(),
  });
}

// ---- Personas ---------------------------------------------------------------
// Personas are stored globally (shared), not per-user, to preserve the
// built-in catalogue. If a per-user isolation is desired, change col to scope by uid.

async function getPersonas() {
  const snap = await db.collection('personas').orderBy('sort_order', 'asc').get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function getPersonaGroups() {
  const PERSONA_GROUPS = [
    { id: 'relationship_ladder', label: 'The Relationship Ladder', emoji: '❤️', tagline: "The people you chose. And the ones you're stuck with." },
    { id: 'family_unit', label: 'The Family Unit', emoji: '👨‍👩‍👧‍👦', tagline: "The people you didn't choose but cannot unsubscribe from." },
    { id: 'friend_tier', label: 'The Friend Tier', emoji: '🍺', tagline: 'Ranked by how often they actually show up.' },
    { id: 'work_ecosystem', label: 'The Work Ecosystem', emoji: '💼', tagline: 'Professional relationships across the entire formality spectrum.' },
    { id: 'diversity_deck', label: 'The Diversity Deck', emoji: '🌍', tagline: 'Every person is a context. Get the tone right.' },
    { id: 'life_stage_arc', label: 'The Life Stage Arc', emoji: '📅', tagline: 'Where someone is in life changes everything about how they communicate.' },
    { id: 'wildcard_drawer', label: 'The Wildcard Drawer', emoji: '🃏', tagline: "The one that doesn't fit anywhere else. Always necessary." },
  ];
  return PERSONA_GROUPS;
}

async function createPersona(data) {
  const now = new Date().toISOString();
  const ref = await db.collection('personas').add({ ...data, is_builtin: false, created_at: now, sort_order: 9999 });
  return { id: ref.id, ...data, is_builtin: false, created_at: now };
}

async function updatePersona(id, updates) {
  const ref = db.collection('personas').doc(String(id));
  const snap = await ref.get();
  if (!snap.exists) return null;
  if (snap.data().is_builtin) return null; // protect built-in personas
  const merged = { ...snap.data(), ...updates };
  delete merged.id;
  await ref.set(merged);
  return { id, ...merged };
}

async function deletePersona(id) {
  await db.collection('personas').doc(String(id)).delete();
}

// ---- Exports ----------------------------------------------------------------

module.exports = {
  // Settings
  getSetting,
  setSetting,
  getAllSettings,
  bulkSetSettings,
  // Rules
  getRules,
  getRule,
  createRule,
  updateRule,
  deleteRule,
  reorderRules,
  // Messages
  logMessage,
  getRecentMessages,
  // Analytics
  getAnalytics,
  getTodayStats,
  // Contacts
  getContacts,
  // Conversation history
  appendConversation,
  getConversationHistory,
  // Cooldowns
  getCooldownLastFired,
  setCooldownLastFired,
  // Personas
  getPersonas,
  getPersonaGroups,
  createPersona,
  updatePersona,
  deletePersona,
};
