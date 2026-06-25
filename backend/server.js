// StuntCock — Express API server + WebSocket broadcaster
// Wires together signal-cli, the rule engine, LLM fallback, and the React frontend.
// Cloud Trace must be started before any other require() calls.

// ---- Cloud Trace (must be the very first require) ----
if (process.env.NODE_ENV !== 'test') {
  try {
    require('@google-cloud/trace-agent').start({ logLevel: 1 });
  } catch (_) {
    // Trace agent is best-effort; never crash the server if it fails
  }
}

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const fdb = require('./firestoreDb');
const { matchMessage, isSelfMessage } = require('./ruleEngine');
const { generateLLMReply, resetClient } = require('./llmClient');
const { fetchGifPath } = require('./gifClient');
const signalClient = require('./signalClient');
const whatsappClient = require('./whatsappClient');
const authMiddleware = require('./middleware/authMiddleware');
const { loggingMiddleware } = require('./middleware/loggingMiddleware');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = parseInt(process.env.PORT || '3001', 10);

app.use(express.json());
app.use(require('cors')({ origin: /^http:\/\/localhost:\d+$/ }));

// ---- Structured logging (before auth so every request is logged) ----
app.use(loggingMiddleware);

// ---- JWT auth for all /api/* routes (health is exempt inside the middleware) ----
app.use('/api', authMiddleware);

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
// Note: inbound messages from signal-cli are not user-request-scoped,
// so we use a system uid from env or skip Firestore logging for daemon msgs.

async function handleInbound(msg) {
  if (isSelfMessage(msg.sender)) return;

  // For daemon-driven inbound messages, use the system uid if configured.
  // Without a uid we can still broadcast to connected clients but won't persist.
  const systemUid = process.env.SYSTEM_UID;

  const llmEnabled = systemUid
    ? (await fdb.getSetting(systemUid, 'llm_enabled', 'true')) === 'true'
    : true;

  let matchedRule = null;
  let response = null;
  let responseType = 'none';

  const result = matchMessage(msg);

  const globalGifEnabled = systemUid
    ? (await fdb.getSetting(systemUid, 'gif_enabled', 'false')) === 'true'
    : false;
  const globalGifFrequency = systemUid
    ? parseFloat(await fdb.getSetting(systemUid, 'gif_frequency', '0.3'))
    : 0.3;

  const rule = result?.rule ?? null;
  const ruleGifOverride = rule?.rule_gif_enabled;
  const gifEnabled = (ruleGifOverride && ruleGifOverride !== '') ? ruleGifOverride === 'true' : globalGifEnabled;
  const gifFrequency = (rule?.rule_gif_frequency && rule.rule_gif_frequency !== '') ? parseFloat(rule.rule_gif_frequency) : globalGifFrequency;

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

  if (systemUid) {
    fdb.logMessage(systemUid, logEntry).catch(e => console.error('[StuntCock] logMessage error', e.message));
  }

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

if (process.env.NODE_ENV !== 'test') {
  // Only start daemons outside of unit tests
  (async () => {
    try {
      // Check if signal is enabled (use SYSTEM_UID if available)
      const uid = process.env.SYSTEM_UID;
      const signalEnabled = uid
        ? (await fdb.getSetting(uid, 'signal_enabled', 'true')) !== 'false'
        : true;
      if (signalEnabled) startSignalDaemon();
    } catch (_) {
      startSignalDaemon(); // fallback: start anyway
    }
  })();
}

// --- WhatsApp daemon ---

if (process.env.NODE_ENV !== 'test') {
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
}

// --- REST API ---

// Settings
app.get('/api/settings', async (req, res) => {
  try {
    res.json(await fdb.getAllSettings(req.uid));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/settings', async (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: 'key required' });
  try {
    await fdb.setSetting(req.uid, key, value);
    if (key === 'anthropic_api_key') resetClient();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/settings/bulk', async (req, res) => {
  const settings = req.body;
  try {
    const prevWa = await fdb.getSetting(req.uid, 'whatsapp_enabled', 'false');
    await fdb.bulkSetSettings(req.uid, settings);
    if (settings.anthropic_api_key) resetClient();
    if (settings.whatsapp_enabled !== undefined && settings.whatsapp_enabled !== prevWa) {
      whatsappClient.reinitialize();
      broadcast('whatsapp_status', whatsappClient.getStatus());
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Contacts
app.get('/api/contacts', async (req, res) => {
  try {
    res.json(await fdb.getContacts(req.uid));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/contacts/:sender/name', async (req, res) => {
  // Contacts name update — not yet implemented in Firestore layer (message_log patch)
  // For now return ok since contacts are derived from message log
  res.json({ ok: true });
});

// Rules
app.get('/api/rules', async (req, res) => {
  try {
    res.json(await fdb.getRules(req.uid));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/rules', async (req, res) => {
  try {
    const rule = await fdb.createRule(req.uid, req.body);
    res.json(rule);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/rules/:id', async (req, res) => {
  try {
    const rule = await fdb.updateRule(req.uid, req.params.id, req.body);
    if (!rule) return res.status(404).json({ error: 'not found' });
    res.json(rule);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/rules/:id', async (req, res) => {
  try {
    await fdb.deleteRule(req.uid, req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/rules/reorder', async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
  try {
    await fdb.reorderRules(req.uid, ids);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Message feed
app.get('/api/messages', async (req, res) => {
  const limit = parseInt(req.query.limit || '50');
  try {
    res.json(await fdb.getRecentMessages(req.uid, limit));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Analytics
app.get('/api/analytics', async (req, res) => {
  const days = parseInt(req.query.days || '7');
  try {
    const [daily, today, rules] = await Promise.all([
      fdb.getAnalytics(req.uid, days),
      fdb.getTodayStats(req.uid),
      fdb.getRules(req.uid),
    ]);
    res.json({
      daily,
      today,
      activeRules: rules.filter(r => r.active).length,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Signal status
app.get('/api/signal/status', (req, res) => {
  res.json({ ...signalClient.getStatus(), enabled: true });
});

app.post('/api/signal/enable', async (req, res) => {
  try {
    await fdb.setSetting(req.uid, 'signal_enabled', 'true');
    if (!signalClient.getStatus().running) startSignalDaemon();
    broadcast('signal_status', { ...signalClient.getStatus(), enabled: true });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/signal/disable', async (req, res) => {
  try {
    await fdb.setSetting(req.uid, 'signal_enabled', 'false');
    signalClient.stopDaemon();
    broadcast('signal_status', { running: false, enabled: false });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// WhatsApp status + control
app.get('/api/whatsapp/status', (req, res) => {
  res.json(whatsappClient.getStatus());
});

app.post('/api/whatsapp/enable', async (req, res) => {
  try {
    await fdb.setSetting(req.uid, 'whatsapp_enabled', 'true');
    whatsappClient.reinitialize();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/whatsapp/disable', async (req, res) => {
  try {
    await fdb.setSetting(req.uid, 'whatsapp_enabled', 'false');
    whatsappClient.shutdown();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Signal registration
app.post('/api/signal/register', async (req, res) => {
  const { phoneNumber, captcha } = req.body;
  if (!phoneNumber) return res.status(400).json({ error: 'phoneNumber required' });
  try {
    await signalClient.register(phoneNumber, captcha);
    await fdb.setSetting(req.uid, 'phone_number', phoneNumber);
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
    await fdb.setSetting(req.uid, 'phone_number', phoneNumber);
    await fdb.setSetting(req.uid, 'setup_complete', 'true');
    broadcast('signal_status', { running: true, registered: true });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Personas
app.get('/api/personas', async (req, res) => {
  try {
    res.json(await fdb.getPersonas());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/personas/groups', async (req, res) => {
  try {
    res.json(await fdb.getPersonaGroups());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/personas', async (req, res) => {
  const { name, emoji, description, system_prompt } = req.body;
  if (!name || !system_prompt) return res.status(400).json({ error: 'name and system_prompt required' });
  try {
    res.json(await fdb.createPersona({ name, emoji, description, system_prompt }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/personas/:id', async (req, res) => {
  try {
    const p = await fdb.updatePersona(req.params.id, req.body);
    if (!p) return res.status(404).json({ error: 'not found or built-in' });
    res.json(p);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/personas/:id', async (req, res) => {
  try {
    await fdb.deletePersona(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// AI-generate a persona system prompt
app.post('/api/personas/generate', async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const apiKey = process.env.ANTHROPIC_API_KEY || await fdb.getSetting(req.uid, 'anthropic_api_key');
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

// Health — unauthenticated liveness check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, version: '1.0.0', product: 'StuntCock' });
});

// In test mode, supertest calls server.listen() itself with an ephemeral port.
// Skip auto-listen to prevent port conflicts.
if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`\n🐓 StuntCock backend running on http://localhost:${PORT}`);
  });
}

// Graceful shutdown
process.on('SIGTERM', () => { signalClient.stopDaemon(); process.exit(0); });
process.on('SIGINT', () => { signalClient.stopDaemon(); process.exit(0); });

module.exports = { app, server };
