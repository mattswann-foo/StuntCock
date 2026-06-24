// StuntCock — Per-user WhatsApp session manager (whatsapp-web.js + Puppeteer)
// Each user gets an isolated Puppeteer/Chromium session and LocalAuth data
// stored under /data/{userId}/whatsapp/.
//
// Usage:
//   const manager = require('./whatsappManager');
//   const result  = await manager.startSession(userId);
//   // result: { qrDataUrl, connected }
//   const status  = manager.getStatus(userId);
//   // status: { connected: true/false, qrDataUrl: <string|null> }

'use strict';

const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode  = require('qrcode');
const path    = require('path');
const fs      = require('fs');

// Root data directory — /data at repo root
const DATA_ROOT = path.join(__dirname, '..', 'data');

// In-memory registry: userId -> { client, status, promise }
// status shape: { connected: boolean, qrDataUrl: string|null, error: string|null }
const sessions = new Map();

// Return the session directory for a userId
function sessionDir(userId) {
  return path.join(DATA_ROOT, userId, 'whatsapp');
}

// Sanitise userId so it is safe to use as a path component.
// Allows alphanumeric, dash, underscore, and dot.  Rejects anything else.
function assertSafeUserId(userId) {
  if (!userId || typeof userId !== 'string') {
    throw new Error('userId is required');
  }
  if (!/^[\w.\-]+$/.test(userId)) {
    throw new Error('Invalid userId — only alphanumeric characters, underscores, dots and hyphens are allowed');
  }
}

// Build puppeteer launch options, honouring PUPPETEER_EXECUTABLE_PATH.
function puppeteerArgs() {
  const opts = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    opts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  return opts;
}

/**
 * Start (or return the already-running) WhatsApp session for a userId.
 *
 * Returns a promise that resolves once the first QR code is ready OR the
 * client connects (whichever happens first).  Subsequent calls for the same
 * userId while the session is still alive return immediately.
 *
 * Resolved value: { connected: boolean, qrDataUrl: string|null }
 */
function startSession(userId) {
  assertSafeUserId(userId);

  // If a session already exists (or is initialising), return its promise
  if (sessions.has(userId)) {
    const session = sessions.get(userId);
    // If already connected or waiting for QR, resolve with current status
    return Promise.resolve({ connected: session.status.connected, qrDataUrl: session.status.qrDataUrl });
  }

  // Create the session directory
  const dir = sessionDir(userId);
  fs.mkdirSync(dir, { recursive: true });

  const status = { connected: false, qrDataUrl: null, error: null };

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: userId,
      dataPath: dir,
    }),
    puppeteer: puppeteerArgs(),
  });

  // Promise that resolves once QR or connection is ready
  const readyPromise = new Promise((resolve, reject) => {
    let resolved = false;

    function done(value) {
      if (!resolved) {
        resolved = true;
        resolve(value);
      }
    }

    client.on('qr', async (qr) => {
      try {
        status.qrDataUrl = await QRCode.toDataURL(qr);
        status.connected  = false;
        console.log(`[StuntCock/WA] QR ready for user ${userId}`);
        done({ connected: false, qrDataUrl: status.qrDataUrl });
      } catch (e) {
        console.error(`[StuntCock/WA] QR generation error for ${userId}:`, e.message);
      }
    });

    client.on('ready', () => {
      status.connected  = true;
      status.qrDataUrl  = null;
      status.error      = null;
      console.log(`[StuntCock/WA] Connected for user ${userId}`);
      done({ connected: true, qrDataUrl: null });
    });

    client.on('authenticated', () => {
      console.log(`[StuntCock/WA] Authenticated for user ${userId}`);
    });

    client.on('auth_failure', (msg) => {
      status.connected = false;
      status.error     = msg;
      console.error(`[StuntCock/WA] Auth failure for ${userId}:`, msg);
      done({ connected: false, qrDataUrl: null, error: msg });
    });

    client.on('disconnected', (reason) => {
      status.connected = false;
      status.error     = reason;
      console.log(`[StuntCock/WA] Disconnected for ${userId}:`, reason);
      // Remove the session so a subsequent /start will recreate it
      sessions.delete(userId);
    });

    // Safety: reject if initialisation takes > 60s with no QR or connection
    const timeout = setTimeout(() => {
      if (!resolved) {
        sessions.delete(userId);
        reject(new Error(`WhatsApp session initialisation timed out for user ${userId}`));
      }
    }, 60_000);
    // Don't let this timeout keep the process alive
    timeout.unref?.();
  });

  sessions.set(userId, { client, status, promise: readyPromise });

  // Kick off the Puppeteer/Chromium initialisation
  client.initialize().catch((e) => {
    console.error(`[StuntCock/WA] initialize() error for ${userId}:`, e.message);
    sessions.delete(userId);
  });

  return readyPromise;
}

/**
 * Return the current status for a userId.
 * Always returns an object — { connected: false, qrDataUrl: null } if no session exists.
 */
function getStatus(userId) {
  assertSafeUserId(userId);
  if (!sessions.has(userId)) {
    return { connected: false, qrDataUrl: null };
  }
  const { status } = sessions.get(userId);
  return { connected: status.connected, qrDataUrl: status.qrDataUrl };
}

/**
 * Destroy the session for a userId (logout + kill browser).
 */
async function destroySession(userId) {
  assertSafeUserId(userId);
  if (!sessions.has(userId)) return;
  const { client } = sessions.get(userId);
  sessions.delete(userId);
  try {
    await client.destroy();
  } catch (e) {
    // best-effort
  }
}

module.exports = { startSession, getStatus, destroySession, sessionDir };
