// StuntCock — Giphy GIF search
// Searches Giphy for a contextually relevant GIF given a message + reply.
// Returns a public GIF URL string, or null on failure.

const https = require('https');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getSetting } = require('./db');

function getGiphyKey() {
  return process.env.GIPHY_API_KEY || getSetting('giphy_api_key') || '';
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function extractSearchTerm(messageBody, replyText) {
  const combined = (messageBody + ' ' + replyText).toLowerCase();

  const moods = [
    { terms: ['miss you','missing you','i miss'], q: 'missing you sweet' },
    { terms: ['love you','i love','so in love'], q: 'love you romantic' },
    { terms: ['good morning','morning'], q: 'good morning sweet' },
    { terms: ['good night','goodnight','sweet dreams'], q: 'good night sweet' },
    { terms: ['thinking of you','thought of you'], q: 'thinking of you' },
    { terms: ["you're amazing","you're the best","you're so"], q: 'you are amazing' },
    { terms: ['funny','haha','lol','hilarious','laugh'], q: 'funny cute reaction' },
    { terms: ['proud of you','so proud'], q: 'proud of you' },
    { terms: ['happy','excited','yay','great news'], q: 'happy excited' },
    { terms: ['hug','cuddle','snuggle'], q: 'sending hugs' },
    { terms: ['cute','adorable'], q: 'cute adorable' },
    { terms: ['beautiful','gorgeous','stunning'], q: 'you are beautiful' },
    { terms: ['kiss','kisses','xoxo'], q: 'sending kisses' },
    { terms: ['sweet','sweetie','honey','baby'], q: 'sweet romantic' },
  ];

  for (const { terms, q } of moods) {
    if (terms.some(t => combined.includes(t))) return q;
  }

  const stopWords = new Set(['the','a','an','is','it','to','of','and','in','you','i','me','my','your','was','be','are','this','that','have','for','on','with','he','she','they','we']);
  const words = replyText.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w));
  if (words.length >= 2) return words.slice(0, 2).join(' ') + ' sweet';
  if (words.length === 1) return words[0] + ' sweet';
  return 'sweet romantic';
}

function downloadToTemp(url) {
  return new Promise((resolve, reject) => {
    const tmpPath = path.join(os.tmpdir(), `stuntcock_gif_${Date.now()}.gif`);
    const file = fs.createWriteStream(tmpPath);
    const get = url.startsWith('https') ? https.get : http.get;
    get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlink(tmpPath, () => {});
        return downloadToTemp(res.headers.location).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(tmpPath)));
      file.on('error', (e) => { fs.unlink(tmpPath, () => {}); reject(e); });
    }).on('error', reject);
  });
}

async function fetchGifPath(messageBody, replyText) {
  const key = getGiphyKey();
  if (!key) return null;

  const q = extractSearchTerm(messageBody, replyText);
  const url = `https://api.giphy.com/v1/gifs/search?q=${encodeURIComponent(q)}&api_key=${key}&limit=8&rating=pg-13`;

  try {
    const data = await httpGet(url);
    const results = data?.data;
    if (!results?.length) return null;

    const pick = results[Math.floor(Math.random() * results.length)];
    const gifUrl = pick?.images?.downsized?.url || pick?.images?.original?.url || null;
    if (!gifUrl) return null;

    return await downloadToTemp(gifUrl);
  } catch (e) {
    console.error('[StuntCock] GIF fetch error:', e.message);
    return null;
  }
}

async function searchGiphy(query, limit = 12) {
  const key = getGiphyKey();
  if (!key) throw new Error('GIPHY_API_KEY not set');
  const url = `https://api.giphy.com/v1/gifs/search?q=${encodeURIComponent(query)}&api_key=${key}&limit=${limit}&rating=pg-13`;
  const data = await httpGet(url);
  return (data?.data || []).map(g => ({
    gif_id: g.id,
    gif_url: g.images?.downsized?.url || g.images?.original?.url,
    preview_url: g.images?.fixed_width_small?.url || g.images?.preview_gif?.url,
    title: g.title,
  })).filter(g => g.gif_url);
}

module.exports = { fetchGifPath, searchGiphy };
