// Tests for the per-user SignalDaemonManager
// Uses Jest's manual mocking to avoid spawning real signal-cli processes.

'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
const EventEmitter = require('events');

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Create a fake child-process that mimics the EventEmitter interface. */
function makeFakeProc() {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.killed = false;
  proc.kill = jest.fn(() => {
    proc.killed = true;
    proc.emit('exit', 0);
  });
  return proc;
}

// ── Module setup (fresh instance per test file) ───────────────────────────────

// We need a fresh module instance for every test so the internal Map is clean.
// Jest module isolation: use jest.resetModules() in beforeEach.

let manager;
let spawnMock;
let tmpDir;

beforeEach(() => {
  // Fresh tmp directory so tests don't collide on disk
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdm-test-'));

  // Override the data root so we don't write to the real /data
  process.env.SIGNAL_DATA_ROOT = tmpDir;
  process.env.SIGNAL_CLI_PATH = 'signal-cli'; // will be intercepted by mock

  jest.resetModules();

  // Re-require child_process so we can spy on spawn
  const cp = require('child_process');
  spawnMock = jest.spyOn(cp, 'spawn').mockImplementation(() => makeFakeProc());

  manager = require('../signalDaemonManager');
});

afterEach(() => {
  // Clean up tmp directory
  fs.rmSync(tmpDir, { recursive: true, force: true });
  jest.restoreAllMocks();
  delete process.env.SIGNAL_DATA_ROOT;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SignalDaemonManager.start(userId)', () => {
  test('spawns signal-cli with --config /data/{userId}/signal for a new userId', () => {
    manager.start('user1');

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [cliPath, args] = spawnMock.mock.calls[0];
    expect(cliPath).toBe('signal-cli');

    const configIdx = args.indexOf('--config');
    expect(configIdx).not.toBe(-1);
    const configArg = args[configIdx + 1];
    expect(configArg).toBe(path.join(tmpDir, 'user1', 'signal'));
  });

  test('creates the /data/{userId}/signal/ directory if it does not exist', () => {
    const expectedDir = path.join(tmpDir, 'user42', 'signal');
    expect(fs.existsSync(expectedDir)).toBe(false);

    manager.start('user42');

    expect(fs.existsSync(expectedDir)).toBe(true);
  });

  test('returns true when a new process is spawned', () => {
    const result = manager.start('user1');
    expect(result).toBe(true);
  });

  test('does NOT spawn a second process for the same userId (returns false)', () => {
    manager.start('userA');
    const secondResult = manager.start('userA');

    expect(spawnMock).toHaveBeenCalledTimes(1); // only one spawn
    expect(secondResult).toBe(false);
  });

  test('daemons for distinct users are independent (two separate spawns)', () => {
    manager.start('userA');
    manager.start('userB');

    expect(spawnMock).toHaveBeenCalledTimes(2);
  });
});

describe('SignalDaemonManager.getStatus(userId)', () => {
  test('returns { running: true } when a daemon is live', () => {
    manager.start('user1');
    expect(manager.getStatus('user1')).toEqual({ running: true });
  });

  test('returns { running: false } when no daemon has been started', () => {
    expect(manager.getStatus('nobody')).toEqual({ running: false });
  });

  test('returns { running: false } after the daemon is stopped', () => {
    manager.start('user1');
    manager.stop('user1');
    expect(manager.getStatus('user1')).toEqual({ running: false });
  });
});

describe('SignalDaemonManager.stop(userId)', () => {
  test('kills the process and removes the entry from the map', () => {
    manager.start('user1');
    const daemons = manager._getDaemonsMap();
    expect(daemons.has('user1')).toBe(true);

    manager.stop('user1');

    expect(daemons.has('user1')).toBe(false);
    expect(manager.getStatus('user1')).toEqual({ running: false });
  });

  test('stopping one user does not affect another user\'s daemon', () => {
    manager.start('userA');
    manager.start('userB');

    manager.stop('userA');

    expect(manager.getStatus('userA')).toEqual({ running: false });
    expect(manager.getStatus('userB')).toEqual({ running: true });
  });

  test('stop on a non-existent userId is a no-op (does not throw)', () => {
    expect(() => manager.stop('ghost')).not.toThrow();
  });
});

describe('Unexpected process exit', () => {
  test('removes the daemon from the map when the process exits unexpectedly', () => {
    // Capture the fake process so we can emit 'exit' manually
    let capturedProc;
    spawnMock.mockImplementation(() => {
      capturedProc = makeFakeProc();
      return capturedProc;
    });

    manager.start('user1');
    expect(manager.getStatus('user1')).toEqual({ running: true });

    // Simulate unexpected exit (without calling stop)
    capturedProc.emit('exit', 1);

    // Should be removed from map so next request can restart
    expect(manager.getStatus('user1')).toEqual({ running: false });
    const daemons = manager._getDaemonsMap();
    expect(daemons.has('user1')).toBe(false);
  });

  test('after unexpected exit, start() can spawn a fresh process', () => {
    let capturedProc;
    spawnMock.mockImplementation(() => {
      capturedProc = makeFakeProc();
      return capturedProc;
    });

    manager.start('user1');
    capturedProc.emit('exit', 1); // unexpected exit

    expect(spawnMock).toHaveBeenCalledTimes(1);

    // Next start() should spawn a new process
    manager.start('user1');
    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect(manager.getStatus('user1')).toEqual({ running: true });
  });
});

describe('_configDir(userId)', () => {
  test('returns correct path and creates directory', () => {
    const dir = manager._configDir('testUser');
    expect(dir).toBe(path.join(tmpDir, 'testUser', 'signal'));
    expect(fs.existsSync(dir)).toBe(true);
  });

  test('is idempotent — calling twice does not throw', () => {
    expect(() => {
      manager._configDir('testUser');
      manager._configDir('testUser');
    }).not.toThrow();
  });

  test('throws on path-traversal userId', () => {
    expect(() => manager._configDir('../../etc')).toThrow(/path escapes data root/);
  });
});
