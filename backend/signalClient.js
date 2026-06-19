// StuntCock — signal-cli process manager and JSON-RPC interface
// Spawns signal-cli in daemon mode. Incoming messages are read from stdout
// (signal-cli --output json streams each envelope as a JSON line).
// Outgoing messages use the HTTP JSON-RPC endpoint.

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

// --- HTTP JSON-RPC (send only) ---

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

  // --output json causes signal-cli to stream each received envelope as a
  // JSON line to stdout — we parse those directly instead of polling via RPC.
  const args = [
    '--output', 'json',
    'daemon',
    `--http`, `localhost:${SIGNAL_CLI_PORT}`,
  ];
  if (phone) args.unshift('-u', phone);

  console.log(`[StuntCock] Spawning signal-cli: ${cliPath} ${args.join(' ')}`);

  daemonProcess = spawn(cliPath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  // stdout: JSON envelope lines from signal-cli
  let stdoutBuf = '';
  daemonProcess.stdout.on('data', (chunk) => {
    stdoutBuf += chunk.toString();
    const lines = stdoutBuf.split('\n');
    stdoutBuf = lines.pop(); // keep incomplete line in buffer
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed);
        handleEnvelope(parsed);
      } catch (_) {
        // not JSON (e.g. startup banner) — ignore
      }
    }
  });

  // stderr: startup logs
  daemonProcess.stderr.on('data', (d) => {
    const line = d.toString().trim();
    if (!line) return;
    console.log('[signal-cli]', line);
    if (!isRunning && line.includes('Started HTTP server')) {
      isRunning = true;
      restartCount = 0;
      onReadyCallback?.();
    }
  });

  let spawnFailed = false;
  daemonProcess.on('error', (err) => {
    isRunning = false;
    spawnFailed = true;
    if (err.code === 'ENOENT') {
      console.error(`[StuntCock] signal-cli binary not found at: ${cliPath}`);
      onCrashCallback?.('signal-cli binary not found. Check SIGNAL_CLI_PATH in your .env file.');
    } else {
      console.error('[StuntCock] signal-cli spawn error:', err.message);
    }
  });

  daemonProcess.on('exit', (code) => {
    isRunning = false;
    if (spawnFailed) return;
    console.error(`[StuntCock] signal-cli exited with code ${code}`);
    if (restartCount < MAX_RESTARTS) {
      restartCount++;
      console.log(`[StuntCock] Restarting signal-cli (attempt ${restartCount}/${MAX_RESTARTS})...`);
      setTimeout(spawnDaemon, 3000);
    } else {
      console.error('[StuntCock] signal-cli failed to restart after max attempts');
      onCrashCallback?.('signal-cli crashed and could not be restarted.');
    }
  });

  // Fallback: if HTTP server started but we missed the log line
  setTimeout(() => {
    if (daemonProcess && !daemonProcess.killed && !isRunning) {
      isRunning = true;
      restartCount = 0;
      onReadyCallback?.();
    }
  }, 8000);
}

function handleEnvelope(parsed) {
  const env = parsed?.envelope;
  if (!env) return;

  if (!env.dataMessage) return;               // skip receipts, sync, typing, etc.
  const body = env.dataMessage?.message || '';
  if (!body) return;                          // skip attachment-only messages

  const msg = {
    platform:   'signal',
    sender:     env.source || env.sourceNumber || '',
    senderName: env.sourceName || '',
    groupId:    env.dataMessage?.groupInfo?.groupId || null,
    body,
    timestamp:  env.timestamp || Date.now(),
  };

  console.log(`[StuntCock] message from ${msg.sender}: ${msg.body}`);

  for (const handler of messageHandlers) {
    handler(msg).catch(e => console.error('[StuntCock] message handler error', e));
  }
}

function stopDaemon() {
  if (daemonProcess) {
    daemonProcess.kill();
    daemonProcess = null;
  }
  isRunning = false;
}

// --- Send ---

async function sendMessage(recipient, message, groupId) {
  const phone = getPhoneNumber();
  if (!phone) throw new Error('No phone number configured');
  const params = { account: phone };
  if (message) params.message = message;
  if (groupId) params.groupId = groupId;
  else params.recipient = [recipient];
  return rpcRequest('send', params);
}

async function sendAttachment(recipient, filePath, groupId) {
  const phone = getPhoneNumber();
  if (!phone) throw new Error('No phone number configured');
  const params = { account: phone, attachments: [filePath] };
  if (groupId) params.groupId = groupId;
  else params.recipient = [recipient];
  return rpcRequest('send', params);
}

// --- Registration ---

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

// onMessage: no handler needed — messages arrive via stdout stream
function onMessage(handler) {
  messageHandlers.push(handler);
}

module.exports = {
  startDaemon, stopDaemon, onMessage, sendMessage, sendAttachment,
  register, verifyCode, getStatus, rpcRequest,
};
