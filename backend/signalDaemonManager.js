// StuntCock — per-user Signal daemon manager
// Each user gets their own signal-cli process keyed by userId.
// Config and key material are stored under /data/{userId}/signal/.

'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Allow tests/callers to override the data root (defaults to <repo_root>/data)
const DATA_ROOT = process.env.SIGNAL_DATA_ROOT || path.join(__dirname, '..', 'data');

function getSignalCliPath() {
  return process.env.SIGNAL_CLI_PATH || 'signal-cli';
}

// One entry per live (or previously-started) userId.
// Shape: { process: ChildProcess|null, running: boolean }
const _daemons = new Map();

/**
 * Return the filesystem path that signal-cli should use as its --config dir
 * for the given userId.  The directory is created (recursively) if it does
 * not already exist.
 *
 * Path-traversal guard: the resolved path must remain inside DATA_ROOT.
 */
function _configDir(userId) {
  const dir = path.join(DATA_ROOT, String(userId), 'signal');
  // Prevent path-traversal: ensure dir stays inside DATA_ROOT
  if (!dir.startsWith(DATA_ROOT + path.sep) && dir !== DATA_ROOT) {
    throw new Error(`Invalid userId — path escapes data root: ${userId}`);
  }
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Start a signal-cli daemon for userId.
 * If a daemon is already running for that userId the call is a no-op.
 * Returns true if a new process was spawned, false if one was already live.
 */
function start(userId) {
  const existing = _daemons.get(userId);
  if (existing && existing.running) {
    return false; // already running — second call is a no-op
  }

  const configDir = _configDir(userId);
  const cliPath = getSignalCliPath();

  // signal-cli --config <dir> --output json daemon
  const args = [
    '--config', configDir,
    '--output', 'json',
    'daemon',
  ];

  const proc = spawn(cliPath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  const state = { process: proc, running: true };
  _daemons.set(userId, state);

  proc.stderr.on('data', (chunk) => {
    const line = chunk.toString().trim();
    if (line) console.log(`[signal-cli:${userId}]`, line);
  });

  proc.stdout.on('data', () => {/* envelope handling out of scope for manager */});

  proc.on('error', (err) => {
    state.running = false;
    state.process = null;
    _daemons.set(userId, state);
    console.error(`[SignalDaemonManager] spawn error for ${userId}:`, err.message);
  });

  proc.on('exit', (code) => {
    // Remove from map so the next request can restart
    _daemons.delete(userId);
    console.log(`[SignalDaemonManager] daemon for ${userId} exited (code ${code})`);
  });

  return true;
}

/**
 * Stop the daemon for userId (if running).
 * Does not affect daemons for other users.
 */
function stop(userId) {
  const state = _daemons.get(userId);
  if (!state) return;
  if (state.process) {
    state.process.kill();
    state.process = null;
  }
  state.running = false;
  _daemons.delete(userId);
}

/**
 * Return { running: boolean } for userId.
 */
function getStatus(userId) {
  const state = _daemons.get(userId);
  return { running: !!(state && state.running) };
}

/**
 * Expose the internal map for testing purposes only.
 * @private
 */
function _getDaemonsMap() {
  return _daemons;
}

module.exports = { start, stop, getStatus, _configDir, _getDaemonsMap };
