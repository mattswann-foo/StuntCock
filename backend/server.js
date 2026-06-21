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
const { fetchGifPath, searchGiphy } = require('./gifClient');
const { resolveMediaForRule } = require('./mediaPool');
const { previewCaptions, generateMemes } = require('./memeClient');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const fs = require('fs');
const signalClient = require('./signalClient');
const whatsappClient = require('./whatsappClient');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = parseInt(process.env.PORT || '3001', 10);

app.use(express.json());
app.use(require('cors')({ origin: /^http:\/\/localhost:\d+$/ }));

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

  const rule = result?.rule ?? null;

  // ── Media pool: fires as a supplement alongside any response type ─────────
  // Per-rule settings override global gif settings when set.
  const poolEnabledRaw = rule?.media_pool_enabled;
  const poolEnabled = poolEnabledRaw && poolEnabledRaw !== ''
    ? poolEnabledRaw === 'true'
    : (rule?.rule_gif_enabled && rule.rule_gif_enabled !== '' ? rule.rule_gif_enabled === 'true' : globalGifEnabled);

  const poolFreqRaw = rule?.media_pool_frequency;
  const poolFrequency = poolFreqRaw && poolFreqRaw !== ''
    ? parseFloat(poolFreqRaw)
    : (rule?.rule_gif_frequency && rule.rule_gif_frequency !== '' ? parseFloat(rule.rule_gif_frequency) : globalGifFrequency);

  const poolType = rule?.media_pool_type || 'any'; // 'gif' | 'meme' | 'any'

  // Roll for media on any matched rule (not just LLM)
  const rollMedia = result && poolEnabled && Math.random() < poolFrequency;

  if (result && result.rule.response_type === 'meme') {
    // response_type=meme: send a curated/random meme as the sole reply
    matchedRule = result.rule;
    const media = await resolveMediaForRule(msg.body, result.rule.id, result.rule.persona_id || null, 'meme').catch(() => null);
    if (media) {
      try {
        await platformSendAttachment(msg, media.filePath);
        response = media.caption ? `[Meme: ${media.caption}]` : '[Meme]';
        responseType = 'meme';
      } catch (e) {
        console.error('[StuntCock] Meme send error', e.message);
      } finally {
        if (media.isTemp) fs.unlink(media.filePath, () => {});
      }
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

  if (response) {
    try {
      await platformSendMessage(msg, response);
    } catch (e) {
      console.error('[StuntCock] Send error', e.message);
      broadcast('error', { message: `Failed to send reply: ${e.message}` });
    }
  }

  // ── Supplementary media (fires after text reply, based on frequency roll) ──
  if (rollMedia && responseType !== 'meme') {
    resolveMediaForRule(msg.body, rule.id, rule.persona_id || null, poolType)
      .then(async (media) => {
        if (!media) return;
        try {
          await platformSendAttachment(msg, media.filePath);
          console.log(`[StuntCock] Media supplement sent (${media.type})`);
        } catch (e) {
          console.error('[StuntCock] Media supplement send error', e.message);
        } finally {
          if (media.isTemp) fs.unlink(media.filePath, () => {});
        }
      })
      .catch(e => console.error('[StuntCock] Media pool resolve error', e.message));
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

// ── Meme Tools API ────────────────────────────────────────────────────────────

// Meme library
app.get('/api/memes', (req, res) => {
  res.json(db.getMemes());
});

app.delete('/api/memes/:id', (req, res) => {
  const meme = db.deleteMeme(req.params.id);
  if (meme && fs.existsSync(meme.image_path)) fs.unlink(meme.image_path, () => {});
  res.json({ ok: true });
});

// Credits
app.get('/api/memes/credits', (req, res) => {
  res.json(db.getMemeCredits());
});

// Caption preview — no credit consumed
app.post('/api/memes/captions', async (req, res) => {
  const { persona_id } = req.body;
  if (!persona_id) return res.status(400).json({ error: 'persona_id required' });
  try {
    const captions = await previewCaptions(persona_id);
    res.json({ captions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Full generation — consumes 1 credit, generates 10 memes
app.post('/api/memes/generate', upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'photo required' });
  const { persona_id, captions: captionsJson } = req.body;
  if (!persona_id) return res.status(400).json({ error: 'persona_id required' });

  let captions;
  try {
    captions = captionsJson ? JSON.parse(captionsJson) : await previewCaptions(persona_id);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid captions JSON' });
  }

  // Check + consume credit
  try { db.consumeMemeCredit(); } catch (e) {
    return res.status(402).json({ error: e.message });
  }

  const session = `session_${Date.now()}`;

  try {
    const results = await generateMemes(req.file.buffer, req.file.mimetype, captions, parseInt(persona_id));

    const saved = [];
    for (const r of results) {
      if (!r.ok || !r.tmpPath) continue;
      // Move from tmp to persistent data/memes dir
      const memesDir = path.join(__dirname, '..', 'data', 'memes');
      if (!fs.existsSync(memesDir)) fs.mkdirSync(memesDir, { recursive: true });
      const dest = path.join(memesDir, path.basename(r.tmpPath));
      try {
        fs.renameSync(r.tmpPath, dest);
        const meme = db.createMeme({ persona_id: parseInt(persona_id), caption: r.caption, image_path: dest, generation_session: session });
        saved.push(meme);
      } catch (e) {
        console.error('[Meme] save error', e.message);
      }
    }

    res.json({ memes: saved, credits: db.getMemeCredits() });
  } catch (e) {
    // Refund credit on total failure
    db.db.prepare('UPDATE meme_credits SET credits = credits + 1 WHERE id = 1').run();
    res.status(500).json({ error: e.message });
  }
});

// Serve meme images
app.get('/api/memes/image/:id', (req, res) => {
  const meme = db.getMeme(req.params.id);
  if (!meme || !fs.existsSync(meme.image_path)) return res.status(404).json({ error: 'Not found' });
  res.sendFile(meme.image_path);
});

// Toggle meme global flag
app.patch('/api/memes/:id/global', (req, res) => {
  try {
    const meme = db.setMemeGlobal(req.params.id, !!req.body.is_global);
    res.json(meme);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GIF Library API ───────────────────────────────────────────────────────────

app.get('/api/gifs', (req, res) => {
  const { rule_id, persona_id, global: isGlobal } = req.query;
  res.json(db.getGifs({
    ruleId: rule_id ? parseInt(rule_id) : undefined,
    personaId: persona_id ? parseInt(persona_id) : undefined,
    isGlobal: isGlobal === 'true',
  }));
});

app.post('/api/gifs', (req, res) => {
  try {
    const gif = db.addGif(req.body);
    res.json(gif);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/gifs/:id', (req, res) => {
  db.removeGif(req.params.id);
  res.json({ ok: true });
});

app.post('/api/gifs/search', async (req, res) => {
  try {
    const { query, limit = 12 } = req.body;
    if (!query) return res.status(400).json({ error: 'query required' });
    const results = await searchGiphy(query, limit);
    res.json(results);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Rule meme pool API ────────────────────────────────────────────────────────

app.get('/api/rules/:id/meme-pool', (req, res) => {
  res.json(db.getRuleMemePool(req.params.id));
});

app.post('/api/rules/:id/meme-pool', (req, res) => {
  try {
    db.addMemeToRulePool(req.params.id, req.body.meme_id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/rules/:ruleId/meme-pool/:memeId', (req, res) => {
  db.removeMemeFromRulePool(req.params.ruleId, req.params.memeId);
  res.json({ ok: true });
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
