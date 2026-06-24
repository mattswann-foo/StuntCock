// StuntCock — Automated security regression tests
// Exercises the three security controls: auth (401/200), body-size limit (413),
// and ReDoS guard (matchesTrigger timing). Exits non-zero on any failure.

'use strict';

const http = require('http');
const path = require('path');
const Module = require('module');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function pass(name) {
  console.log(`  \u2705 PASS  ${name}`);
  passed++;
}

function fail(name, reason) {
  console.error(`  \u274c FAIL  ${name}`);
  console.error(`         ${reason}`);
  failed++;
}

/**
 * Make a simple HTTP request and return { statusCode, body }.
 */
function request(options, bodyData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: raw }));
    });
    req.on('error', reject);
    if (bodyData !== undefined) req.write(bodyData);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Module stubs (prevent real DB / daemon startup)
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, '..');

const DB_STUB = {
  getSetting: (key, def) => def ?? null,
  setSetting: () => {},
  getAllSettings: () => ({}),
  getRules: () => [],
  createRule: (r) => ({ id: 1, ...r }),
  updateRule: () => null,
  deleteRule: () => {},
  reorderRules: () => {},
  logMessage: () => {},
  getRecentMessages: () => [],
  getAnalytics: () => [],
  getTodayStats: () => ({ total: 0, replied: 0 }),
  getPersonas: () => [],
  getPersonaGroups: () => [],
  createPersona: (p) => ({ id: 1, ...p }),
  updatePersona: () => null,
  deletePersona: () => {},
  getContacts: () => [],
  getCooldownLastFired: () => null,
  setCooldownLastFired: () => {},
  db: { prepare: () => ({ run: () => {} }) },
};

const SIGNAL_STUB = {
  startDaemon: () => {},
  stopDaemon: () => {},
  onMessage: () => {},
  getStatus: () => ({ running: false, restartCount: 0, port: 8080 }),
  sendMessage: async () => {},
  sendAttachment: async () => {},
  register: async () => {},
  verifyCode: async () => {},
};

const WHATSAPP_STUB = {
  initialize: () => {},
  shutdown: () => {},
  reinitialize: () => {},
  onMessage: () => {},
  getStatus: () => ({ running: false, authenticated: false }),
  sendMessage: async () => {},
  sendAttachment: async () => {},
};

const LLM_STUB = {
  generateLLMReply: async () => 'stub reply',
  resetClient: () => {},
};

const GIF_STUB = {
  fetchGifPath: async () => null,
};

const STUBS = {
  [path.resolve(ROOT, 'backend/db.js')]: DB_STUB,
  [path.resolve(ROOT, 'backend/signalClient.js')]: SIGNAL_STUB,
  [path.resolve(ROOT, 'backend/whatsappClient.js')]: WHATSAPP_STUB,
  [path.resolve(ROOT, 'backend/llmClient.js')]: LLM_STUB,
  [path.resolve(ROOT, 'backend/gifClient.js')]: GIF_STUB,
};

function installStubs() {
  const original = Module._load;
  Module._load = function stubLoader(request, parent, isMain) {
    let resolved = null;
    try { resolved = Module._resolveFilename(request, parent); } catch (_) {}
    if (resolved && STUBS[resolved]) return STUBS[resolved];
    return original.apply(this, arguments);
  };
  return function uninstall() { Module._load = original; };
}

// ---------------------------------------------------------------------------
// Test server bootstrap
// ---------------------------------------------------------------------------

async function startTestServer() {
  // Set a known API token for auth tests.
  process.env.API_TOKEN = 'test-secret-token-xyz';
  // Pick a random port by setting to 0; server.js reads PORT.
  process.env.PORT = '0';

  // Flush any previously cached backend modules.
  Object.keys(require.cache).forEach(k => {
    if (k.includes(`${path.sep}backend${path.sep}`)) delete require.cache[k];
  });

  const uninstall = installStubs();

  // Hook http.createServer to capture the Server instance before server.js
  // kicks off listen().
  const originalCreate = http.createServer.bind(http);
  let capturedServer = null;
  http.createServer = function(...args) {
    capturedServer = originalCreate(...args);
    http.createServer = originalCreate; // restore immediately
    return capturedServer;
  };

  try {
    require('../backend/server.js');
  } finally {
    uninstall();
    http.createServer = originalCreate;
  }

  if (!capturedServer) throw new Error('Could not capture http.Server from server.js');

  // Wait up to 2 s for the server to start listening.
  await new Promise((resolve, reject) => {
    if (capturedServer.listening) return resolve();
    const t = setTimeout(() => reject(new Error('Server did not start within 2 s')), 2000);
    capturedServer.once('listening', () => { clearTimeout(t); resolve(); });
    capturedServer.once('error', (e) => { clearTimeout(t); reject(e); });
  });

  const { port } = capturedServer.address();

  return {
    port,
    close: () => capturedServer.close(),
  };
}

// ---------------------------------------------------------------------------
// HTTP-based security control tests
// ---------------------------------------------------------------------------

async function runHttpTests(port) {
  const TOKEN = process.env.API_TOKEN;

  // Test 1: GET /api/settings WITHOUT token → 401
  try {
    const res = await request({
      hostname: '127.0.0.1',
      port,
      path: '/api/settings',
      method: 'GET',
    });
    if (res.statusCode === 401) {
      pass('GET /api/settings without token → 401');
    } else {
      fail('GET /api/settings without token → 401', `Got HTTP ${res.statusCode} (expected 401). Ensure API_TOKEN env var is set and requireAuth middleware is active.`);
    }
  } catch (e) {
    fail('GET /api/settings without token → 401', e.message);
  }

  // Test 2: GET /api/settings WITH correct token → 200
  try {
    const res = await request({
      hostname: '127.0.0.1',
      port,
      path: '/api/settings',
      method: 'GET',
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (res.statusCode === 200) {
      pass('GET /api/settings with correct token → 200');
    } else {
      fail('GET /api/settings with correct token → 200', `Got HTTP ${res.statusCode} (expected 200)`);
    }
  } catch (e) {
    fail('GET /api/settings with correct token → 200', e.message);
  }

  // Test 3: POST with body > 64 KB → 413
  try {
    // Build a JSON body just over 64 KB.
    const bigBody = JSON.stringify({ key: 'x', value: 'a'.repeat(70 * 1024) });
    const res = await request({
      hostname: '127.0.0.1',
      port,
      path: '/api/settings',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bigBody),
        Authorization: `Bearer ${TOKEN}`,
      },
    }, bigBody);
    if (res.statusCode === 413) {
      pass('POST with body > 64 KB → 413');
    } else {
      fail('POST with body > 64 KB → 413', `Got HTTP ${res.statusCode} (expected 413). Check express.json({ limit: '64kb' }) middleware.`);
    }
  } catch (e) {
    fail('POST with body > 64 KB → 413', e.message);
  }
}

// ---------------------------------------------------------------------------
// ReDoS guard tests (in-process, no server needed)
// ---------------------------------------------------------------------------

async function runReDoSTests() {
  // Load matchesTrigger in isolation using stubs for db + scheduler.
  const ruleEnginePath = require.resolve('../backend/ruleEngine.js');
  const dbPath = require.resolve('../backend/db.js');
  const schedulerPath = require.resolve('../backend/scheduler.js');

  // Clear cached versions so we get fresh module load.
  delete require.cache[ruleEnginePath];

  const uninstall = installStubs();
  // Also stub scheduler.
  const schedulerStub = { isScheduleActive: () => true };
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    let resolved = null;
    try { resolved = Module._resolveFilename(request, parent); } catch (_) {}
    if (resolved === schedulerPath) return schedulerStub;
    return originalLoad.apply(this, arguments);
  };

  let matchesTrigger;
  try {
    const mod = require('../backend/ruleEngine.js');
    matchesTrigger = mod.matchesTrigger;
  } finally {
    Module._load = originalLoad;
    uninstall();
  }

  if (typeof matchesTrigger !== 'function') {
    fail('ReDoS guard: (a+)+$ on evil input → false within 200 ms', 'matchesTrigger is not exported from ruleEngine.js');
    fail('matchesTrigger regex: "hello" matches "hello world" → true', 'matchesTrigger is not exported from ruleEngine.js');
    return;
  }

  // Test 4: ReDoS pattern returns false within 200 ms
  try {
    const start = Date.now();
    const result = matchesTrigger(
      { trigger_type: 'regex', trigger_value: '(a+)+$' },
      'aaaaaaaaaaaaaaaaab'
    );
    const elapsed = Date.now() - start;
    if (result !== false) {
      fail('ReDoS guard: (a+)+$ on evil input → false within 200 ms', `Expected false, got ${result}`);
    } else if (elapsed > 200) {
      fail('ReDoS guard: (a+)+$ on evil input → false within 200 ms', `Returned false but took ${elapsed} ms (> 200 ms limit)`);
    } else {
      pass(`ReDoS guard: (a+)+$ on evil input → false within 200 ms (${elapsed} ms)`);
    }
  } catch (e) {
    fail('ReDoS guard: (a+)+$ on evil input → false within 200 ms', e.message);
  }

  // Test 5: Normal regex returns true
  try {
    const result = matchesTrigger(
      { trigger_type: 'regex', trigger_value: 'hello' },
      'hello world'
    );
    if (result === true) {
      pass('matchesTrigger regex: "hello" matches "hello world" → true');
    } else {
      fail('matchesTrigger regex: "hello" matches "hello world" → true', `Got ${result}`);
    }
  } catch (e) {
    fail('matchesTrigger regex: "hello" matches "hello world" → true', e.message);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

(async () => {
  console.log('\n\uD83D\uDD12 StuntCock \u2014 Security Regression Tests\n');

  // --- HTTP-based controls (auth + body size) ---
  console.log('HTTP Controls:');
  let ctx = null;
  try {
    ctx = await startTestServer();
    await runHttpTests(ctx.port);
  } catch (e) {
    fail('Server startup', e.message);
    if (process.env.DEBUG) console.error(e);
  } finally {
    if (ctx) {
      try { ctx.close(); } catch (_) {}
    }
  }

  // --- In-process controls (ReDoS) ---
  console.log('\nReDoS Guard:');
  await runReDoSTests();

  // --- Summary ---
  const total = passed + failed;
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${passed}/${total} passed, ${failed} failed`);

  if (failed > 0) {
    console.error('\n\u274c Security regression tests FAILED\n');
    process.exit(1);
  } else {
    console.log('\n\u2705 All security controls PASSING\n');
    process.exit(0);
  }
})();
