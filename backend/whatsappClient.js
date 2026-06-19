// StuntCock — WhatsApp client via Baileys (pure Node.js WebSocket, no browser)
// Scan a QR code once; session is saved locally and reused on restart.

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const pino = require('pino');
const { getSetting } = require('./db');

// Ensure ffmpeg (needed by Baileys for GIF→video encoding) is on PATH
if (!process.env.PATH?.includes('/opt/homebrew/bin')) {
  process.env.PATH = '/opt/homebrew/bin:/usr/local/bin:' + (process.env.PATH || '');
}

const SESSION_DIR = path.join(__dirname, '..', 'data', 'baileys-session');

// Resolve a WhatsApp @lid JID to an E.164-style phone number using Baileys' mapping files.
// Returns "+1XXXXXXXXXX" if resolvable, otherwise the original JID.
function resolveWaJid(jid) {
  if (!jid) return jid;
  const lid = jid.replace(/@.*$/, '');
  const mappingFile = path.join(SESSION_DIR, `lid-mapping-${lid}_reverse.json`);
  try {
    const phone = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));
    if (phone) return `+${phone}`;
  } catch (_) {}
  return jid; // no mapping found — keep JID as-is
}
const KEEPALIVE_INTERVAL = 30 * 1000;   // check every 30s
const KEEPALIVE_TIMEOUT  = 90 * 1000;   // reconnect if silent for 90s

let sock = null;
let status = { running: false, authenticated: false, qrDataUrl: null };
let messageHandlers = [];
let onReadyCallback = null;
let onCrashCallback = null;
let lastMessageAt = Date.now();
let keepaliveTimer = null;

function getStatus() { return { ...status }; }
function onMessage(handler) { messageHandlers.push(handler); }
function isEnabled() { return getSetting('whatsapp_enabled', 'false') === 'true'; }

async function _start() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['StuntCock', 'Chrome', '10.0'],
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      try {
        status.qrDataUrl = await QRCode.toDataURL(qr);
        status.authenticated = false;
        console.log('[StuntCock/WA] QR ready — scan in Settings');
        onReadyCallback?.({ qr: true });
      } catch (e) {
        console.error('[StuntCock/WA] QR error:', e.message);
      }
    }

    if (connection === 'open') {
      status.running = true;
      status.authenticated = true;
      status.qrDataUrl = null;
      lastMessageAt = Date.now();
      console.log('[StuntCock/WA] Connected');
      onReadyCallback?.({ qr: false });
      _startKeepalive();
    }

    if (connection === 'close') {
      _stopKeepalive();
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      status.running = false;
      console.log('[StuntCock/WA] Disconnected, code:', code, 'loggedOut:', loggedOut);

      if (loggedOut) {
        status.authenticated = false;
        onCrashCallback?.('WhatsApp logged out — re-scan QR in Settings.');
      } else if (isEnabled()) {
        console.log('[StuntCock/WA] Reconnecting…');
        setTimeout(_start, 5000);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    lastMessageAt = Date.now();
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;

      const body =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption || '';

      if (!body) continue;

      const rawJid = msg.key.remoteJid;
      const isGroup = rawJid?.endsWith('@g.us');
      const rawSender = isGroup ? (msg.key.participant || rawJid) : rawJid;
      // Resolve @lid JIDs to phone numbers so Signal and WhatsApp contacts unify
      const sender = rawSender?.endsWith('@lid') ? resolveWaJid(rawSender) : rawSender;

      const parsed = {
        platform: 'whatsapp',
        sender,
        waJid: rawSender, // keep original JID for sending replies
        senderName: msg.pushName || null,
        groupId: isGroup ? rawJid : null,
        body,
        timestamp: (msg.messageTimestamp || Date.now() / 1000) * 1000,
        _waSock: sock,
        _waKey: msg.key,
      };

      console.log(`[StuntCock/WA] message from ${parsed.sender}: ${parsed.body}`);

      for (const handler of messageHandlers) {
        handler(parsed).catch(e => console.error('[StuntCock/WA] handler error', e));
      }
    }
  });
}

function _startKeepalive() {
  _stopKeepalive();
  keepaliveTimer = setInterval(() => {
    if (!status.running || !isEnabled()) return;
    const silent = Date.now() - lastMessageAt;
    if (silent > KEEPALIVE_TIMEOUT) {
      console.log(`[StuntCock/WA] Silent for ${Math.round(silent/1000)}s — reconnecting`);
      _stopKeepalive();
      shutdown().then(() => {
        if (isEnabled()) _start().catch(e => console.error('[StuntCock/WA] keepalive restart error:', e.message));
      });
    }
  }, KEEPALIVE_INTERVAL);
}

function _stopKeepalive() {
  if (keepaliveTimer) { clearInterval(keepaliveTimer); keepaliveTimer = null; }
}

function initialize(onReady, onCrash) {
  onReadyCallback = onReady;
  onCrashCallback = onCrash;
  if (!isEnabled()) {
    console.log('[StuntCock/WA] WhatsApp disabled — skipping init');
    return;
  }
  _start().catch(e => {
    console.error('[StuntCock/WA] start error:', e.message);
    onCrashCallback?.(`WhatsApp failed to start: ${e.message}`);
  });
}

async function sendMessage(to, text) {
  if (!sock || !status.running) throw new Error('WhatsApp not connected');
  await sock.sendMessage(to, { text });
}

async function sendAttachment(to, filePath) {
  if (!sock || !status.running) throw new Error('WhatsApp not connected');
  const fs = require('fs');
  const os = require('os');
  const { execFile } = require('child_process');
  const mp4Path = filePath.replace(/\.gif$/i, '') + '_wa.mp4';

  // Convert GIF→MP4 so WhatsApp plays it as animated GIF (gifPlayback)
  await new Promise((resolve, reject) => {
    const ffmpeg = '/opt/homebrew/bin/ffmpeg';
    execFile(ffmpeg, ['-y', '-i', filePath, '-movflags', 'faststart', '-pix_fmt', 'yuv420p',
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', mp4Path], (err) => {
      if (err) reject(err); else resolve();
    });
  });

  try {
    const data = fs.readFileSync(mp4Path);
    await sock.sendMessage(to, { video: data, gifPlayback: true, mimetype: 'video/mp4' });
  } finally {
    fs.unlink(mp4Path, () => {});
  }
}

async function shutdown() {
  _stopKeepalive();
  if (sock) {
    try { sock.end(); } catch (_) {}
    sock = null;
  }
  status.running = false;
}

function reinitialize() {
  shutdown().then(() => {
    if (isEnabled()) {
      _start().catch(e => console.error('[StuntCock/WA] reinit error:', e.message));
    }
  });
}

module.exports = { initialize, onMessage, sendMessage, sendAttachment, getStatus, shutdown, reinitialize };
