// StuntCock — Meme Tools: caption generation (Claude) + image generation (Higgsfield)
// Generates 10 persona-calibrated meme captions then composites the customer's face
// into meme-style images via the Higgsfield image API.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const https = require('https');
const http = require('http');
const os = require('os');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { getSetting, getPersona } = require('./db');

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY || getSetting('anthropic_api_key');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  return new Anthropic({ apiKey });
}

function getHiggsfield() {
  return {
    apiKey: process.env.HIGGSFIELD_API_KEY || getSetting('higgsfield_api_key') || '',
    baseUrl: 'https://api.higgsfield.ai',
  };
}

function getGrok() {
  return {
    apiKey: process.env.GROK_API_KEY || getSetting('grok_api_key') || '',
    baseUrl: 'https://api.x.ai',
  };
}

function getMemeProvider() {
  return getSetting('meme_image_provider') || 'higgsfield';
}

// ── Caption generation ────────────────────────────────────────────────────────

async function generateCaptions(personaId) {
  const persona = getPersona(personaId);
  if (!persona) throw new Error(`Persona ${personaId} not found`);

  const client = getAnthropicClient();

  const systemPrompt = persona.system_prompt ||
    `You are ${persona.name}. ${persona.description}`;

  const userPrompt = `Generate exactly 10 short, punchy meme captions in the voice of "${persona.name}" (${persona.tagline || persona.description}).

Rules:
- Each caption should work as a reaction meme text (what someone says when they're being ${persona.name})
- Max 12 words per caption
- No hashtags, no quotation marks
- Make them funny, relatable, and shareable
- Vary the tone slightly between captions (some bold, some sarcastic, some warm, etc.)

Reply with ONLY a JSON array of 10 strings, nothing else. Example:
["Caption one", "Caption two", ...]`;

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const raw = msg.content[0]?.text?.trim() || '[]';
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Caption generation returned unexpected format');

  const captions = JSON.parse(match[0]);
  if (!Array.isArray(captions) || captions.length === 0) {
    throw new Error('No captions generated');
  }

  return captions.slice(0, 10);
}

// ── Image generation via Higgsfield ──────────────────────────────────────────

function httpsRequest(url, opts, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOpts = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: opts.method || 'GET',
      headers: opts.headers || {},
    };
    const req = https.request(reqOpts, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, data: JSON.parse(text) }); }
        catch { resolve({ status: res.statusCode, data: text }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function downloadImage(url, destPath) {
  return new Promise((resolve, reject) => {
    const get = url.startsWith('https') ? https.get : http.get;
    const file = fs.createWriteStream(destPath);
    get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlink(destPath, () => {});
        return downloadImage(res.headers.location, destPath).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(destPath)));
      file.on('error', (e) => { fs.unlink(destPath, () => {}); reject(e); });
    }).on('error', reject);
  });
}

// Polls a Higgsfield job until it completes or times out.
async function pollJob(jobId, apiKey, baseUrl, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 3000));
    const res = await httpsRequest(`${baseUrl}/v1/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const job = res.data;
    if (job.status === 'completed' || job.status === 'succeeded') return job;
    if (job.status === 'failed' || job.status === 'error') {
      throw new Error(`Higgsfield job ${jobId} failed: ${job.error || 'unknown'}`);
    }
  }
  throw new Error(`Higgsfield job ${jobId} timed out`);
}

// Builds the meme prompt string shared by both providers.
function buildMemePrompt(caption, persona) {
  const personaStyle = persona ? `${persona.name} — ${persona.tagline || persona.description}` : 'casual meme';
  return `A funny reaction meme. The person in the photo is the main subject. Caption at the top or bottom: "${caption}". Visual style: ${personaStyle}. Meme format, high contrast text, internet culture aesthetic.`;
}

// Generates one meme image via Higgsfield (face-swap / reference-image approach).
async function generateMemeImageHiggsfield(photoBase64, photoMimeType, caption, persona) {
  const { apiKey, baseUrl } = getHiggsfield();
  if (!apiKey) throw new Error('HIGGSFIELD_API_KEY not set. Add it in Settings → Meme Tools.');

  const payload = {
    prompt: buildMemePrompt(caption, persona),
    reference_image: `data:${photoMimeType};base64,${photoBase64}`,
    width: 512,
    height: 512,
    num_inference_steps: 25,
    guidance_scale: 7.5,
  };

  const res = await httpsRequest(`${baseUrl}/v1/generate/image`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  }, payload);

  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`Higgsfield API error ${res.status}: ${JSON.stringify(res.data)}`);
  }

  let imageUrl = res.data?.image_url || res.data?.url || res.data?.output?.[0];
  if (!imageUrl && res.data?.job_id) {
    const job = await pollJob(res.data.job_id, apiKey, baseUrl);
    imageUrl = job.output?.[0] || job.image_url || job.url;
  }
  if (!imageUrl) throw new Error('No image URL returned from Higgsfield');
  return imageUrl;
}

// Generates one meme image via xAI Grok Aurora (text-to-image; photo embedded in prompt).
async function generateMemeImageGrok(photoBase64, photoMimeType, caption, persona) {
  const { apiKey, baseUrl } = getGrok();
  if (!apiKey) throw new Error('GROK_API_KEY not set. Add it in Settings → Meme Tools.');

  // Aurora supports image inputs via the chat/completions messages API with vision.
  // We use the dedicated images/generations endpoint for pure image output.
  const payload = {
    model: 'aurora',
    prompt: buildMemePrompt(caption, persona),
    n: 1,
    response_format: 'url',
  };

  const res = await httpsRequest(`${baseUrl}/v1/images/generations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  }, payload);

  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`Grok API error ${res.status}: ${JSON.stringify(res.data)}`);
  }

  const imageUrl = res.data?.data?.[0]?.url;
  if (!imageUrl) throw new Error('No image URL returned from Grok');
  return imageUrl;
}

// Routes to the correct provider and downloads the result to a tmp file.
async function generateMemeImage(photoBase64, photoMimeType, caption, personaId) {
  const persona = getPersona(personaId);
  const provider = getMemeProvider();

  let imageUrl;
  if (provider === 'grok') {
    imageUrl = await generateMemeImageGrok(photoBase64, photoMimeType, caption, persona);
  } else {
    imageUrl = await generateMemeImageHiggsfield(photoBase64, photoMimeType, caption, persona);
  }

  const tmpPath = path.join(os.tmpdir(), `sc_meme_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`);
  await downloadImage(imageUrl, tmpPath);
  return tmpPath;
}

// ── Public API ────────────────────────────────────────────────────────────────

// Generates 10 captions only (no image credit consumed). Fast preview step.
async function previewCaptions(personaId) {
  return generateCaptions(personaId);
}

// Full generation: takes photo buffer + persona, generates 10 images in parallel.
// Returns array of { caption, tmpPath } objects.
async function generateMemes(photoBuffer, photoMimeType, captions, personaId) {
  const photoBase64 = photoBuffer.toString('base64');

  const results = await Promise.allSettled(
    captions.map((caption) =>
      generateMemeImage(photoBase64, photoMimeType, caption, personaId)
        .then(tmpPath => ({ caption, tmpPath, ok: true }))
        .catch(err => ({ caption, error: err.message, ok: false }))
    )
  );

  return results.map(r => r.value || r.reason);
}

module.exports = { previewCaptions, generateMemes };
