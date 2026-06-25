// Integration tests for StuntCock backend API
// Tests: auth middleware, tenant isolation, health endpoint, CRUD endpoints

// ---- Mock heavy native modules BEFORE any imports ----
jest.mock('../signalClient', () => ({
  getStatus: jest.fn(() => ({ running: false, restartCount: 0, port: 8080 })),
  startDaemon: jest.fn(),
  stopDaemon: jest.fn(),
  onMessage: jest.fn(),
  sendMessage: jest.fn(),
  sendAttachment: jest.fn(),
  register: jest.fn(),
  verifyCode: jest.fn(),
}));

jest.mock('../whatsappClient', () => ({
  getStatus: jest.fn(() => ({ running: false, authenticated: false })),
  initialize: jest.fn(),
  reinitialize: jest.fn(),
  shutdown: jest.fn(),
  onMessage: jest.fn(),
  sendMessage: jest.fn(),
  sendAttachment: jest.fn(),
}));

jest.mock('../gifClient', () => ({
  fetchGifPath: jest.fn(() => null),
}));

jest.mock('../llmClient', () => ({
  generateLLMReply: jest.fn(async () => 'mock-llm-reply'),
  resetClient: jest.fn(),
}));

jest.mock('better-sqlite3', () => {
  return jest.fn(() => ({
    pragma: jest.fn(),
    exec: jest.fn(),
    prepare: jest.fn(() => ({ run: jest.fn(), get: jest.fn(), all: jest.fn(() => []) })),
    transaction: jest.fn(fn => fn),
  }));
});

// ---- Firebase Admin mock (self-contained factory) ----
jest.mock('firebase-admin', () => ({
  apps: [],
  credential: { applicationDefault: jest.fn(() => ({})) },
  initializeApp: jest.fn(),
  auth: jest.fn(() => ({
    verifyIdToken: jest.fn(async (token) => {
      if (token === 'valid-token-uid-A') return { uid: 'uid-A' };
      if (token === 'valid-token-uid-B') return { uid: 'uid-B' };
      throw new Error('auth/invalid-id-token');
    }),
  })),
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      add: jest.fn(async () => ({ id: 'mock-id' })),
      doc: jest.fn(() => ({
        get: jest.fn(async () => ({ exists: false, data: () => null, id: 'mock' })),
        set: jest.fn(async () => {}),
        update: jest.fn(async () => {}),
        delete: jest.fn(async () => {}),
      })),
      get: jest.fn(async () => ({ size: 0, docs: [], forEach: () => {}, empty: true })),
      where: jest.fn(function() { return this; }),
      orderBy: jest.fn(function() { return this; }),
      limit: jest.fn(function() { return this; }),
    })),
    batch: jest.fn(() => ({
      set: jest.fn(), update: jest.fn(), delete: jest.fn(),
      commit: jest.fn(async () => {}),
    })),
  })),
}));

// ---- firestoreDb mock with in-memory per-uid store ----
// Use jest.fn() placeholders; implementations are set in beforeEach using mockImplementation
jest.mock('../firestoreDb', () => ({
  getSetting: jest.fn(),
  setSetting: jest.fn(),
  getAllSettings: jest.fn(),
  bulkSetSettings: jest.fn(),
  getRules: jest.fn(),
  getRule: jest.fn(),
  createRule: jest.fn(),
  updateRule: jest.fn(),
  deleteRule: jest.fn(),
  reorderRules: jest.fn(),
  logMessage: jest.fn(),
  getRecentMessages: jest.fn(),
  getAnalytics: jest.fn(),
  getTodayStats: jest.fn(),
  getContacts: jest.fn(),
  appendConversation: jest.fn(),
  getConversationHistory: jest.fn(),
  getCooldownLastFired: jest.fn(),
  setCooldownLastFired: jest.fn(),
  getPersonas: jest.fn(),
  getPersonaGroups: jest.fn(),
  createPersona: jest.fn(),
  updatePersona: jest.fn(),
  deletePersona: jest.fn(),
}));

// ---- Import after mocks ----
const request = require('supertest');
const fdb = require('../firestoreDb');

// In-memory store keyed by uid
let store = {};

function getUidCol(uid, colName) {
  if (!store[uid]) store[uid] = {};
  if (!store[uid][colName]) store[uid][colName] = {};
  return store[uid][colName];
}

function setupMockImplementations() {
  fdb.getSetting.mockImplementation(async (uid, key, def = null) => {
    const col = getUidCol(uid, 'settings');
    return col[key] !== undefined ? col[key].value : def;
  });

  fdb.setSetting.mockImplementation(async (uid, key, value) => {
    const col = getUidCol(uid, 'settings');
    col[key] = { value: String(value) };
  });

  fdb.getAllSettings.mockImplementation(async (uid) => {
    const col = getUidCol(uid, 'settings');
    const result = {};
    for (const [k, v] of Object.entries(col)) result[k] = v.value;
    return result;
  });

  fdb.bulkSetSettings.mockImplementation(async (uid, settings) => {
    const col = getUidCol(uid, 'settings');
    for (const [k, v] of Object.entries(settings)) col[k] = { value: String(v) };
  });

  fdb.getRules.mockImplementation(async (uid) => {
    const col = getUidCol(uid, 'rules');
    return Object.entries(col)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => (a.priority || 0) - (b.priority || 0));
  });

  fdb.getRule.mockImplementation(async (uid, id) => {
    const col = getUidCol(uid, 'rules');
    return col[id] ? { id, ...col[id] } : null;
  });

  fdb.createRule.mockImplementation(async (uid, rule) => {
    const col = getUidCol(uid, 'rules');
    const id = `rule_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
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
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    col[id] = data;
    return { id, ...data };
  });

  fdb.updateRule.mockImplementation(async (uid, id, updates) => {
    const col = getUidCol(uid, 'rules');
    if (!col[id]) return null;
    col[id] = { ...col[id], ...updates, updated_at: new Date().toISOString() };
    return { id, ...col[id] };
  });

  fdb.deleteRule.mockImplementation(async (uid, id) => {
    const col = getUidCol(uid, 'rules');
    delete col[id];
  });

  fdb.reorderRules.mockImplementation(async (uid, ids) => {
    const col = getUidCol(uid, 'rules');
    ids.forEach((id, idx) => {
      if (col[id]) col[id] = { ...col[id], priority: idx };
    });
  });

  fdb.logMessage.mockImplementation(async () => {});

  fdb.getRecentMessages.mockImplementation(async (uid, limit = 50) => {
    const col = getUidCol(uid, 'messages');
    return Object.entries(col)
      .map(([id, data]) => ({ id, ...data }))
      .slice(0, limit);
  });

  fdb.getAnalytics.mockImplementation(async () => []);
  fdb.getTodayStats.mockImplementation(async () => ({ total: 0, replied: 0 }));
  fdb.getContacts.mockImplementation(async () => []);
  fdb.appendConversation.mockImplementation(async () => {});
  fdb.getConversationHistory.mockImplementation(async () => []);
  fdb.getCooldownLastFired.mockImplementation(async () => null);
  fdb.setCooldownLastFired.mockImplementation(async () => {});
  fdb.getPersonas.mockImplementation(async () => []);
  fdb.getPersonaGroups.mockImplementation(async () => []);
  fdb.createPersona.mockImplementation(async (data) => ({ id: 'p1', ...data }));
  fdb.updatePersona.mockImplementation(async (id, updates) => ({ id, ...updates }));
  fdb.deletePersona.mockImplementation(async () => {});
}

let app;
let closeServer;

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  setupMockImplementations();
  const serverModule = require('../server');
  app = serverModule.app;
  closeServer = () => serverModule.server.close();
});

afterAll(() => {
  if (closeServer) closeServer();
});

beforeEach(() => {
  store = {};
  // Re-apply implementations in case any test cleared them
  setupMockImplementations();
});

// ============================================================
// Health endpoint — no auth required
// ============================================================
describe('GET /api/health', () => {
  it('returns { ok: true } without Authorization header', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ============================================================
// Auth middleware
// ============================================================
describe('Auth middleware', () => {
  it('returns 401 when no Authorization header is supplied', async () => {
    const res = await request(app).get('/api/rules');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  it('returns 401 when an invalid token is supplied', async () => {
    const res = await request(app)
      .get('/api/rules')
      .set('Authorization', 'Bearer bad-token');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  it('allows requests with a valid token', async () => {
    const res = await request(app)
      .get('/api/rules')
      .set('Authorization', 'Bearer valid-token-uid-A');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ============================================================
// Rules CRUD — uid-A
// ============================================================
describe('Rules CRUD (uid-A)', () => {
  const authA = { Authorization: 'Bearer valid-token-uid-A' };

  it('GET /api/rules returns empty array initially', async () => {
    const res = await request(app).get('/api/rules').set(authA);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('POST /api/rules creates a rule', async () => {
    const res = await request(app)
      .post('/api/rules')
      .set(authA)
      .send({
        name: 'Test Rule A',
        trigger_type: 'any',
        response_type: 'static',
        response_text: 'Hello from rule A',
      });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Test Rule A');
    expect(res.body.id).toBeTruthy();
  });

  it('GET /api/rules returns the created rule', async () => {
    await request(app)
      .post('/api/rules')
      .set(authA)
      .send({ name: 'Rule 1', trigger_type: 'exact', trigger_value: 'hi', response_type: 'static', response_text: 'Hey' });

    const res = await request(app).get('/api/rules').set(authA);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].name).toBe('Rule 1');
  });

  it('PUT /api/rules/:id updates a rule', async () => {
    const created = await request(app)
      .post('/api/rules')
      .set(authA)
      .send({ name: 'Old Name', trigger_type: 'any', response_type: 'static', response_text: 'old' });
    const id = created.body.id;

    const res = await request(app)
      .put(`/api/rules/${id}`)
      .set(authA)
      .send({ name: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('New Name');
  });

  it('DELETE /api/rules/:id removes a rule', async () => {
    const created = await request(app)
      .post('/api/rules')
      .set(authA)
      .send({ name: 'To Delete', trigger_type: 'any', response_type: 'static', response_text: 'bye' });
    const id = created.body.id;

    const delRes = await request(app).delete(`/api/rules/${id}`).set(authA);
    expect(delRes.status).toBe(200);
    expect(delRes.body.ok).toBe(true);

    const listRes = await request(app).get('/api/rules').set(authA);
    expect(listRes.body.length).toBe(0);
  });
});

// ============================================================
// Tenant isolation — uid-A cannot see uid-B's rules
// ============================================================
describe('Tenant isolation', () => {
  const authA = { Authorization: 'Bearer valid-token-uid-A' };
  const authB = { Authorization: 'Bearer valid-token-uid-B' };

  it('uid-B cannot see rules created by uid-A', async () => {
    await request(app)
      .post('/api/rules')
      .set(authA)
      .send({ name: 'UID-A Secret Rule', trigger_type: 'any', response_type: 'static', response_text: 'Secret' });

    const res = await request(app).get('/api/rules').set(authB);
    expect(res.status).toBe(200);
    const ruleNames = res.body.map(r => r.name);
    expect(ruleNames).not.toContain('UID-A Secret Rule');
  });

  it('uid-A rules are independent from uid-B rules', async () => {
    await request(app)
      .post('/api/rules')
      .set(authA)
      .send({ name: 'A Rule', trigger_type: 'any', response_type: 'static', response_text: 'A' });
    await request(app)
      .post('/api/rules')
      .set(authB)
      .send({ name: 'B Rule', trigger_type: 'any', response_type: 'static', response_text: 'B' });

    const resA = await request(app).get('/api/rules').set(authA);
    const resB = await request(app).get('/api/rules').set(authB);

    expect(resA.body.map(r => r.name)).toContain('A Rule');
    expect(resA.body.map(r => r.name)).not.toContain('B Rule');
    expect(resB.body.map(r => r.name)).toContain('B Rule');
    expect(resB.body.map(r => r.name)).not.toContain('A Rule');
  });
});

// ============================================================
// Settings CRUD
// ============================================================
describe('Settings', () => {
  const authA = { Authorization: 'Bearer valid-token-uid-A' };

  it('POST /api/settings stores a setting', async () => {
    const res = await request(app)
      .post('/api/settings')
      .set(authA)
      .send({ key: 'timezone', value: 'America/Los_Angeles' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('GET /api/settings returns all settings', async () => {
    await request(app)
      .post('/api/settings')
      .set(authA)
      .send({ key: 'llm_enabled', value: 'true' });
    const res = await request(app).get('/api/settings').set(authA);
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('object');
  });

  it('POST /api/settings requires a key', async () => {
    const res = await request(app)
      .post('/api/settings')
      .set(authA)
      .send({ value: 'orphan' });
    expect(res.status).toBe(400);
  });
});

// ============================================================
// Structured logging — PII redaction unit tests
// ============================================================
describe('PII redaction', () => {
  const { redactPII } = require('../middleware/loggingMiddleware');

  it('redacts email fields', () => {
    const result = redactPII({ email: 'user@example.com', name: 'Alice' });
    expect(result.email).toBe('[REDACTED]');
    expect(result.name).toBe('Alice');
  });

  it('redacts phone_number fields', () => {
    const result = redactPII({ phone_number: '+15550001234' });
    expect(result.phone_number).toBe('[REDACTED]');
  });

  it('redacts anthropic_api_key fields', () => {
    const result = redactPII({ anthropic_api_key: 'sk-ant-...' });
    expect(result.anthropic_api_key).toBe('[REDACTED]');
  });

  it('does not redact non-PII fields', () => {
    const result = redactPII({ name: 'Test Rule', trigger_type: 'any' });
    expect(result.name).toBe('Test Rule');
    expect(result.trigger_type).toBe('any');
  });

  it('recursively redacts nested PII', () => {
    const result = redactPII({ user: { email: 'x@x.com', role: 'admin' } });
    expect(result.user.email).toBe('[REDACTED]');
    expect(result.user.role).toBe('admin');
  });

  it('returns non-objects unchanged', () => {
    expect(redactPII('hello')).toBe('hello');
    expect(redactPII(42)).toBe(42);
    expect(redactPII(null)).toBeNull();
  });

  it('handles arrays', () => {
    const result = redactPII([{ email: 'a@b.com' }, { name: 'Alice' }]);
    expect(result[0].email).toBe('[REDACTED]');
    expect(result[1].name).toBe('Alice');
  });
});

// ============================================================
// POST /api/rules/reorder
// ============================================================
describe('POST /api/rules/reorder', () => {
  const authA = { Authorization: 'Bearer valid-token-uid-A' };

  it('returns 400 without ids array', async () => {
    const res = await request(app)
      .post('/api/rules/reorder')
      .set(authA)
      .send({ ids: 'not-an-array' });
    expect(res.status).toBe(400);
  });

  it('accepts a valid ids array and returns ok', async () => {
    const res = await request(app)
      .post('/api/rules/reorder')
      .set(authA)
      .send({ ids: ['id1', 'id2'] });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ============================================================
// Messages + Analytics endpoints
// ============================================================
describe('Messages and Analytics', () => {
  const authA = { Authorization: 'Bearer valid-token-uid-A' };

  it('GET /api/messages returns array', async () => {
    const res = await request(app).get('/api/messages').set(authA);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/analytics returns daily + today + activeRules', async () => {
    const res = await request(app).get('/api/analytics').set(authA);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('daily');
    expect(res.body).toHaveProperty('today');
    expect(res.body).toHaveProperty('activeRules');
  });
});

// ============================================================
// Logging middleware emits structured JSON
// ============================================================
describe('Logging middleware', () => {
  it('emits a structured JSON log line to stdout for each request', async () => {
    const lines = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (data) => {
      try {
        const parsed = JSON.parse(data);
        lines.push(parsed);
      } catch (_) {}
      return true;
    };

    await request(app).get('/api/health');

    process.stdout.write = origWrite;

    expect(lines.length).toBeGreaterThan(0);
    const log = lines.find(l => l.path === '/api/health');
    expect(log).toBeDefined();
    expect(log).toHaveProperty('method', 'GET');
    expect(log).toHaveProperty('status', 200);
    expect(log).toHaveProperty('durationMs');
    expect(log).toHaveProperty('traceId');
    // userId may be null for unauthenticated health check
    expect(log).toHaveProperty('userId');
    // PII fields must NOT appear
    expect(log).not.toHaveProperty('email');
    expect(log).not.toHaveProperty('phone_number');
    expect(log).not.toHaveProperty('anthropic_api_key');
  });
});
