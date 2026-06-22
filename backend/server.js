// StuntCock — Express API server + WebSocket broadcaster
// Wires together signal-cli, the rule engine, LLM fallback, and the React frontend.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const db = require('./db');
const { matchMessage, isSelfMessage } = require('./ruleEngine');
const { generateLLMReply, resetClient } = require('./llmClient');
const { fetchGifPath } = require('./gifClient');
const fs = require('fs');
const signalClient = require('./signalClient');
const whatsappClient = require('./whatsappClient');
const { verifyFirebaseToken } = require('./auth');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = parseInt(process.env.PORT || '3001', 10);

// --- CORS ---
// Allow CORS_ORIGIN env var; fall back to http://localhost:5173 for dev.
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

app.use(require('cors')({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. server-to-server, curl).
    if (!origin) return callback(null, true);
    if (origin === ALLOWED_ORIGIN) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  optionsSuccessStatus: 200,
}));

// Return 403 (not 500) for disallowed CORS origins.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS_FORBIDDEN' });
  }
  next(err);
});

app.use(express.json());

// Apply Firebase token verification to all /api/* routes.
app.use('/api', verifyFirebaseToken);

// --- WebSocket broadcast ---

function broadcast(event, data) {
  const payload = JSON.stringify({ event, data });
  wss.clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  });
}

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ event: 'connected', data: { status: signalClient.getStatus() } }));
});

// --- Platform send helpers ---

async function platformSendMessage(msg, text) {
  if (msg.platform === 'whatsapp') {
    await whatsappClient.sendMessage(msg.waJid || msg.sender, text);
  } else {
    await signalClient.sendMessage(msg.sender, text, msg.groupId);
  }
}

async function platformSendAttachment(msg, filePath) {
  if (msg.platform === 'whatsapp') {
    await whatsappClient.sendAttachment(msg.waJid || msg.sender, filePath);
  } else {
    await signalClient.sendAttachment(msg.sender, filePath, msg.groupId);
  }
}

// --- Shared inbound message handler (used by both Signal and WhatsApp) ---

async function handleInbound(msg) {
  if (isSelfMessage(msg.sender)) return;

  const llmEnabled = db.getSetting('llm_enabled', 'true') === 'true';
  let matchedRule = null;
  let response = null;
  let responseType = 'none';

  const result = matchMessage(msg);

  const globalGifEnabled = db.getSetting('gif_enabled', 'false') === 'true';
  const globalGifFrequency = parseFloat(db.getSetting('gif_frequency', '0.3'));

  // Per-rule overrides (null means "use global")
  const rule = result?.rule ?? null;
  const ruleGifOverride = rule?.rule_gif_enabled;
  const gifEnabled = (ruleGifOverride && ruleGifOverride !== '') ? ruleGifOverride === 'true' : globalGifEnabled;
  const gifFrequency = (rule?.rule_gif_frequency && rule.rule_gif_frequency !== '') ? parseFloat(rule.rule_gif_frequency) : globalGifFrequency;

  // Roll for GIF on any LLM-bound response (rule-matched or fallback)
  const wouldUseLLM = result ? result.rule.response_type === 'llm' && llmEnabled : llmEnabled;
  const rollGif = gifEnabled && wouldUseLLM && Math.random() < gifFrequency;

  if (rollGif) {
    let gifPath = null;
    try {
      gifPath = await fetchGifPath(msg.body, '').catch(() => null);
      if (gifPath) {
        await platformSendAttachment(msg, gifPath);
        response = '[GIF]';
        responseType = 'static';
        matchedRule = rule;
        console.log('[StuntCock] GIF-only reply:', gifPath);
      }
    } catch (e) {
      console.error('[StuntCock] GIF send error', e.message);
    } finally {
      if (gifPath) fs.unlink(gifPath, () => {});
    }
  } else if (result) {
    matchedRule = result.rule;
    if (result.rule.response_type === 'llm') {
      if (llmEnabled) {
        try {
          response = await generateLLMReply({ ...msg, systemPromptOverride: result.rule.rule_llm_prompt || null, personaId: result.rule.persona_id || null });
          responseType = 'llm';
        } catch (e) {
          console.error('[StuntCock] LLM error', e.message);
          broadcast('error', { message: `LLM error: ${e.message}` });
        }
      }
    } else {
      response = result.response;
      responseType = result.rule.response_type;
    }
  }

  if (response && response !== '[GIF]') {
    try {
      await platformSendMessage(msg, response);
    } catch (e) {
      console.error('[StuntCock] Send error', e.message);
      broadcast('error', { message: `Failed to send reply: ${e.message}` });
    }
  }

  const logEntry = {
    platform: msg.platform ?? 'signal',
    sender: msg.sender,
    sender_name: msg.senderName ?? null,
    group_id: msg.groupId,
    message_body: msg.body,
    matched_rule_id: matchedRule?.id ?? null,
    response_sent: response,
    response_type: responseType,
  };
  db.logMessage(logEntry);

  broadcast('message', {
    ...logEntry,
    rule_name: matchedRule?.name ?? null,
    timestamp: new Date().toISOString(),
  });
}

// --- Register handlers ---

signalClient.onMessage(handleInbound);
whatsappClient.onMessage(handleInbound);

// --- Signal daemon ---

function startSignalDaemon() {
  signalClient.startDaemon(
    () => {
      console.log('[StuntCock] signal-cli ready');
      broadcast('signal_status', { running: true });
    },
    (errMsg) => {
      console.error('[StuntCock] signal-cli crashed:', errMsg);
      broadcast('signal_crashed', { message: errMsg });
    }
  );
}

if (db.getSetting('signal_enabled', 'true') !== 'false') {
  startSignalDaemon();
}

// --- WhatsApp daemon ---

whatsappClient.initialize(
  ({ qr } = {}) => {
    if (qr) {
      broadcast('whatsapp_qr', { qrDataUrl: whatsappClient.getStatus().qrDataUrl });
    } else {
      broadcast('whatsapp_status', { running: true, authenticated: true });
    }
  },
  (errMsg) => {
    console.error('[StuntCock] WhatsApp error:', errMsg);
    broadcast('whatsapp_status', { running: false, authenticated: false, error: errMsg });
  }
);

// --- REST API ---

// Settings
app.get('/api/settings', (req, res) => {
  res.json(db.getAllSettings());
});

app.post('/api/settings', (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: 'key required' });
  db.setSetting(key, value);
  if (key === 'anthropic_api_key') resetClient();
  res.json({ ok: true });
});

app.post('/api/settings/bulk', (req, res) => {
  const settings = req.body;
  const prevWa = db.getSetting('whatsapp_enabled', 'false');
  for (const [key, value] of Object.entries(settings)) {
    db.setSetting(key, value);
  }
  if (settings.anthropic_api_key) resetClient();
  if (settings.whatsapp_enabled !== undefined && settings.whatsapp_enabled !== prevWa) {
    whatsappClient.reinitialize();
    broadcast('whatsapp_status', whatsappClient.getStatus());
  }
  res.json({ ok: true });
});

// Rules
app.get('/api/contacts', (req, res) => {
  res.json(db.getContacts());
});

app.put('/api/contacts/:sender/name', (req, res) => {
  const { sender } = req.params;
  const { name } = req.body;
  db.db.prepare(`UPDATE message_log SET sender_name = ? WHERE sender = ? AND sender_name IS NULL`).run(name, decodeURIComponent(sender));
  db.db.prepare(`UPDATE message_log SET sender_name = ? WHERE sender = ?`).run(name, decodeURIComponent(sender));
  res.json({ ok: true });
});

app.get('/api/rules', (req, res) => {
  res.json(db.getRules());
});

app.post('/api/rules', (req, res) => {
  const rule = db.createRule(req.body);
  res.json(rule);
});

app.put('/api/rules/:id', (req, res) => {
  const rule = db.updateRule(parseInt(req.params.id), req.body);
  if (!rule) return res.status(404).json({ error: 'not found' });
  res.json(rule);
});

app.delete('/api/rules/:id', (req, res) => {
  db.deleteRule(parseInt(req.params.id));
  res.json({ ok: true });
});

app.post('/api/rules/reorder', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
  db.reorderRules(ids);
  res.json({ ok: true });
});

// Message feed
app.get('/api/messages', (req, res) => {
  const limit = parseInt(req.query.limit || '50');
  res.json(db.getRecentMessages(limit));
});

// Analytics
app.get('/api/analytics', (req, res) => {
  const days = parseInt(req.query.days || '7');
  res.json({
    daily: db.getAnalytics(days),
    today: db.getTodayStats(),
    activeRules: db.getRules().filter(r => r.active).length,
  });
});

// Signal status
app.get('/api/signal/status', (req, res) => {
  res.json({ ...signalClient.getStatus(), enabled: db.getSetting('signal_enabled', 'true') !== 'false' });
});

app.post('/api/signal/enable', (req, res) => {
  db.setSetting('signal_enabled', 'true');
  if (!signalClient.getStatus().running) startSignalDaemon();
  broadcast('signal_status', { ...signalClient.getStatus(), enabled: true });
  res.json({ ok: true });
});

app.post('/api/signal/disable', (req, res) => {
  db.setSetting('signal_enabled', 'false');
  signalClient.stopDaemon();
  broadcast('signal_status', { running: false, enabled: false });
  res.json({ ok: true });
});

// WhatsApp status + control
app.get('/api/whatsapp/status', (req, res) => {
  res.json(whatsappClient.getStatus());
});

app.post('/api/whatsapp/enable', (req, res) => {
  db.setSetting('whatsapp_enabled', 'true');
  whatsappClient.reinitialize();
  res.json({ ok: true });
});

app.post('/api/whatsapp/disable', (req, res) => {
  db.setSetting('whatsapp_enabled', 'false');
  whatsappClient.shutdown();
  res.json({ ok: true });
});

// Signal registration
app.post('/api/signal/register', async (req, res) => {
  const { phoneNumber, captcha } = req.body;
  if (!phoneNumber) return res.status(400).json({ error: 'phoneNumber required' });
  try {
    await signalClient.register(phoneNumber, captcha);
    db.setSetting('phone_number', phoneNumber);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/signal/verify', async (req, res) => {
  const { phoneNumber, code } = req.body;
  if (!phoneNumber || !code) return res.status(400).json({ error: 'phoneNumber and code required' });
  try {
    await signalClient.verifyCode(phoneNumber, code);
    db.setSetting('phone_number', phoneNumber);
    db.setSetting('setup_complete', 'true');
    broadcast('signal_status', { running: true, registered: true });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Personas
app.get('/api/personas', (req, res) => {
  res.json(db.getPersonas());
});

app.get('/api/personas/groups', (req, res) => {
  res.json(db.getPersonaGroups());
});

app.post('/api/personas', (req, res) => {
  const { name, emoji, description, system_prompt } = req.body;
  if (!name || !system_prompt) return res.status(400).json({ error: 'name and system_prompt required' });
  res.json(db.createPersona({ name, emoji, description, system_prompt }));
});

app.put('/api/personas/:id', (req, res) => {
  const p = db.updatePersona(parseInt(req.params.id), req.body);
  if (!p) return res.status(404).json({ error: 'not found or built-in' });
  res.json(p);
});

app.delete('/api/personas/:id', (req, res) => {
  db.deletePersona(parseInt(req.params.id));
  res.json({ ok: true });
});

// AI-generate a persona system prompt from a name + description
app.post('/api/personas/generate', async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const apiKey = process.env.ANTHROPIC_API_KEY || db.getSetting('anthropic_api_key');
    if (!apiKey) return res.status(400).json({ error: 'Anthropic API key not set' });
    const client = new Anthropic({ apiKey });
    const result = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: `Write a system prompt for an AI that replies to text messages pretending to be someone's "${name}"${description ? ` — ${description}` : ''}. The prompt should define the personality, tone, and relationship dynamic. Keep it under 100 words. End with "Never reveal you are an AI." Output ONLY the system prompt, no explanation.`,
      }],
    });
    res.json({ system_prompt: result.content[0]?.text?.trim() ?? '' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Health
app.get('/api/health', (req, res) => {
  res.json({ ok: true, version: '1.0.0', product: 'StuntCock' });
});

server.listen(PORT, () => {
  console.log(`\n🐓 StuntCock backend running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => { signalClient.stopDaemon(); process.exit(0); });
process.on('SIGINT', () => { signalClient.stopDaemon(); process.exit(0); });
