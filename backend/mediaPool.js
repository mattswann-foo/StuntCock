// StuntCock — Context-aware media pool selector
// Resolves the best GIF or meme from a rule's curated pool given an inbound message.
// Falls back to Giphy search when the pool is empty and GIFs are enabled.

const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { getMediaPool, getSetting, getPersona } = require('./db');
const { fetchGifPath, searchGiphy } = require('./gifClient');

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY || getSetting('anthropic_api_key');
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

// Asks Claude Haiku to pick the most contextually relevant item from a list.
// Returns the chosen item or null if the model can't decide.
async function pickByContext(messageBody, items, persona) {
  if (!items.length) return null;
  if (items.length === 1) return items[0];

  const client = getAnthropicClient();
  if (!client) return items[Math.floor(Math.random() * items.length)];

  const personaLabel = persona ? `${persona.name} (${persona.tagline || persona.description})` : 'default';
  const list = items.map((it, i) => `${i}: ${it._label}`).join('\n');

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8,
      messages: [{
        role: 'user',
        content: `You are picking the most fitting reaction media for a message.\n\nPersona: ${personaLabel}\nIncoming message: "${messageBody.slice(0, 300)}"\n\nCandidates (index: description):\n${list}\n\nReply with ONLY the number of the best match.`,
      }],
    });
    const idx = parseInt(msg.content[0]?.text?.trim() ?? '0', 10);
    return items[Number.isFinite(idx) ? Math.min(Math.max(idx, 0), items.length - 1) : 0];
  } catch {
    return items[Math.floor(Math.random() * items.length)];
  }
}

// Downloads a saved GIF from a URL to a temp file so platformSendAttachment can use it.
async function downloadGifToTemp(gifUrl) {
  const https = require('https');
  const http = require('http');
  const os = require('os');
  const tmpPath = path.join(os.tmpdir(), `sc_pool_gif_${Date.now()}.gif`);
  return new Promise((resolve, reject) => {
    const get = gifUrl.startsWith('https') ? https.get : http.get;
    const file = fs.createWriteStream(tmpPath);
    get(gifUrl, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlink(tmpPath, () => {});
        return downloadGifToTemp(res.headers.location).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(tmpPath)));
      file.on('error', (e) => { fs.unlink(tmpPath, () => {}); reject(e); });
    }).on('error', reject);
  });
}

/**
 * Resolves and picks one media item for the rule to send alongside its reply.
 *
 * Priority:
 *   1. Rule-specific GIFs + rule meme pool  (if pool has items)
 *   2. Persona memes + global pool           (fallback when rule pool is empty)
 *   3. Giphy random search                   (if type allows GIFs and pool is fully empty)
 *
 * Returns { type: 'gif'|'meme', filePath } or null.
 */
async function resolveMediaForRule(messageBody, ruleId, personaId, mediaType) {
  const pool = getMediaPool(ruleId, personaId);
  const persona = personaId ? getPersona(personaId) : null;

  // Build candidate lists by type filter
  let gifCandidates  = [];
  let memeCandidates = [];

  const hasRuleItems = pool.ruleGifs.length > 0 || pool.ruleMemes.length > 0;

  if (hasRuleItems) {
    // Prefer rule-specific pool
    if (mediaType !== 'meme') gifCandidates  = pool.ruleGifs.map(g => ({ ...g, _label: g.tags || 'gif' }));
    if (mediaType !== 'gif')  memeCandidates = pool.ruleMemes.map(m => ({ ...m, _label: m.caption }));
  } else {
    // Fall back to persona + global pool
    if (mediaType !== 'gif') {
      memeCandidates = [
        ...pool.personaMemes.map(m => ({ ...m, _label: m.caption })),
        ...pool.globalMemes.map(m => ({ ...m, _label: m.caption })),
      ];
    }
    if (mediaType !== 'meme') {
      gifCandidates = pool.globalGifs.map(g => ({ ...g, _label: g.tags || 'gif' }));
    }
  }

  // Merge and annotate type so picker knows what it chose
  const combined = [
    ...gifCandidates.map(g => ({ ...g, _type: 'gif' })),
    ...memeCandidates.map(m => ({ ...m, _type: 'meme' })),
  ];

  // Cap at 20 to keep the Haiku prompt manageable
  const candidates = combined.slice(0, 20);

  if (!candidates.length) {
    // Nothing in pool — Giphy fallback if GIFs allowed
    if (mediaType === 'meme') return null;
    try {
      const gifPath = await fetchGifPath(messageBody, '');
      return gifPath ? { type: 'gif', filePath: gifPath, isTemp: true } : null;
    } catch { return null; }
  }

  const chosen = await pickByContext(messageBody, candidates, persona);
  if (!chosen) return null;

  if (chosen._type === 'gif') {
    try {
      const filePath = await downloadGifToTemp(chosen.gif_url);
      return { type: 'gif', filePath, isTemp: true };
    } catch { return null; }
  }

  // Meme — use stored image_path
  if (!chosen.image_path || !fs.existsSync(chosen.image_path)) return null;
  return { type: 'meme', filePath: chosen.image_path, caption: chosen.caption, isTemp: false };
}

module.exports = { resolveMediaForRule };
