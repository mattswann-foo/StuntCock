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
const signalClient = require('./signalClient');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = parseInt(process.env.PORT || '3001', 10);

app.use(express.json());
app.use(require('cors')({ origin: 'http://localhost:5173' }));

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

// --- Incoming message handler ---

signalClient.onMessage(async (msg) => {
  if (isSelfMessage(msg.sender)) return;

  const llmEnabled = db.getSetting('llm_enabled', 'true') === 'true';
  let matchedRule = null;
  let response = null;
  let responseType = 'none';

  const result = matchMessage(msg);

  if (result) {
    matchedRule = result.rule;
    if (result.rule.response_type === 'llm') {
      if (llmEnabled) {
        try {
          response = await generateLLMReply(msg);
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
  } else if (llmEnabled) {
    try {
      response = await generateLLMReply(msg);
      responseType = 'llm';
    } catch (e) {
      console.error('[StuntCock] LLM fallback error', e.message);
    }
  }

  if (response) {
    try {
      await signalClient.sendMessage(msg.sender, response, msg.groupId);
    } catch (e) {
      console.error('[StuntCock] Send error', e.message);
      broadcast('error', { message: `Failed to send reply: ${e.message}` });
    }
  }

  const logEntry = {
    sender: msg.sender,
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
});

// --- Signal daemon events ---

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

// --- REST API ---

// Settings
app.get('/api/settings', (req, res) => {
  const settings = db.getAllSettings();
  delete settings.anthropic_api_key;
  settings.anthropic_api_key_configured = !!process.env.ANTHROPIC_API_KEY;
  res.json(settings);
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
  for (const [key, value] of Object.entries(settings)) {
    db.setSetting(key, value);
  }
  if (settings.anthropic_api_key) resetClient();
  res.json({ ok: true });
});

// Rules
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
  res.json(signalClient.getStatus());
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
