// StuntCock — signal-cli process manager and JSON-RPC interface
// Spawns signal-cli in daemon mode, polls for new messages, sends replies.
// Auto-restarts on crash (up to 3 attempts before surfacing error).

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { spawn } = require('child_process');
const http = require('http');
const { getSetting } = require('./db');

const SIGNAL_CLI_PORT = parseInt(process.env.SIGNAL_CLI_PORT || '8080', 10);
const MAX_RESTARTS = 3;

let daemonProcess = null;
let restartCount = 0;
let isRunning = false;
let onCrashCallback = null;
let onReadyCallback = null;
let messageHandlers = [];

function getSignalCliPath() {
  return process.env.SIGNAL_CLI_PATH || getSetting('signal_cli_path') || 'signal-cli';
}

function getPhoneNumber() {
  return process.env.SIGNAL_PHONE_NUMBER || getSetting('phone_number') || '';
}

// --- JSON-RPC helpers ---

function rpcRequest(method, params = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: '2.0', method, params, id: Date.now() });
    const req = http.request({
      hostname: 'localhost',
      port: SIGNAL_CLI_PORT,
      path: '/api/v1/rpc',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) reject(new Error(json.error.message || 'RPC error'));
          else resolve(json.result);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// --- Daemon lifecycle ---

function startDaemon(onReady, onCrash) {
  onReadyCallback = onReady;
  onCrashCallback = onCrash;
  spawnDaemon();
}

function spawnDaemon() {
  const cliPath = getSignalCliPath();
  const phone = getPhoneNumber();

  const args = [
    '--output', 'json',
    'daemon',
    '--http',
    '--http-port', String(SIGNAL_CLI_PORT),
  ];
  if (phone) args.unshift('-u', phone);

  console.log(`[StuntCock] Spawning signal-cli: ${cliPath} ${args.join(' ')}`);

  daemonProcess = spawn(cliPath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  daemonProcess.stdout.on('data', d => {
    const line = d.toString().trim();
    if (line) console.log('[signal-cli]', line);
    if (line.includes('Listening on') || line.includes('Started')) {
      isRunning = true;
      restartCount = 0;
      onReadyCallback?.();
      startPolling();
    }
  });

  daemonProcess.stderr.on('data', d => {
    console.error('[signal-cli stderr]', d.toString().trim());
  });

  let spawnFailed = false;
  daemonProcess.on('error', (err) => {
    isRunning = false;
    spawnFailed = true;
    if (err.code === 'ENOENT') {
      console.error(`[StuntCock] signal-cli binary not found at: ${getSignalCliPath()}`);
      console.error('[StuntCock] Set SIGNAL_CLI_PATH in your .env file. See README for install instructions.');
      onCrashCallback?.('signal-cli binary not found. Check SIGNAL_CLI_PATH in your .env file. See the README for installation instructions.');
    } else {
      console.error('[StuntCock] signal-cli spawn error:', err.message);
    }
  });

  daemonProcess.on('exit', (code) => {
    isRunning = false;
    if (spawnFailed) return; // ENOENT already handled above — don't retry
    console.error(`[StuntCock] signal-cli exited with code ${code}`);
    if (restartCount < MAX_RESTARTS) {
      restartCount++;
      console.log(`[StuntCock] Restarting signal-cli (attempt ${restartCount}/${MAX_RESTARTS})...`);
      setTimeout(spawnDaemon, 3000);
    } else {
      console.error('[StuntCock] signal-cli failed to restart after max attempts');
      onCrashCallback?.('signal-cli crashed and could not be restarted. Please check your installation.');
    }
  });

  // Give daemon 8 seconds to announce readiness; assume ready if it hasn't exited
  setTimeout(() => {
    if (daemonProcess && !daemonProcess.killed && !isRunning) {
      isRunning = true;
      restartCount = 0;
      onReadyCallback?.();
      startPolling();
    }
  }, 8000);
}

function stopDaemon() {
  if (daemonProcess) {
    daemonProcess.kill();
    daemonProcess = null;
  }
  isRunning = false;
}

// --- Message polling ---

let lastTimestamp = 0;
let pollInterval = null;

function startPolling() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(pollMessages, 2000);
}

async function pollMessages() {
  const phone = getPhoneNumber();
  if (!phone || !isRunning) return;

  try {
    // signal-cli JSON-RPC: receive messages
    const result = await rpcRequest('receive', { account: phone });
    const envelopes = Array.isArray(result) ? result : (result?.envelopes ?? []);

    for (const envelope of envelopes) {
      const env = envelope.envelope ?? envelope;
      // Only process DataMessage envelopes
      if (!env.dataMessage) continue;
      // Filter out older messages already handled
      const ts = env.timestamp || 0;
      if (ts <= lastTimestamp) continue;
      lastTimestamp = ts;

      const msg = {
        sender: env.source || env.sourceNumber || '',
        senderName: env.sourceName || '',
        groupId: env.dataMessage?.groupInfo?.groupId || null,
        body: env.dataMessage?.message || '',
        timestamp: ts,
      };

      if (!msg.body) continue;

      for (const handler of messageHandlers) {
        try { await handler(msg); } catch (e) { console.error('[StuntCock] message handler error', e); }
      }
    }
  } catch (e) {
    // Swallow poll errors — daemon may be starting up
  }
}

function onMessage(handler) {
  messageHandlers.push(handler);
}

// --- Send ---

async function sendMessage(recipient, message, groupId) {
  const phone = getPhoneNumber();
  if (!phone) throw new Error('No phone number configured');

  const params = { account: phone, message };
  if (groupId) {
    params.groupId = groupId;
  } else {
    params.recipient = [recipient];
  }

  return rpcRequest('send', params);
}

// --- Registration flow ---

async function register(phoneNumber, captcha) {
  const params = { account: phoneNumber };
  if (captcha) params.captcha = captcha;
  return rpcRequest('register', params);
}

async function verifyCode(phoneNumber, code) {
  return rpcRequest('verify', { account: phoneNumber, verificationCode: code });
}

function getStatus() {
  return { running: isRunning, restartCount, port: SIGNAL_CLI_PORT };
}

module.exports = {
  startDaemon, stopDaemon, onMessage, sendMessage,
  register, verifyCode, getStatus, rpcRequest,
};
