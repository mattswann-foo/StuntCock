// Tests for backend/whatsappManager.js and the userIdFromRequest helper
// Runs with Node.js built-in test runner (node:test), available in Node >= 18.

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// ─── whatsappManager unit tests ────────────────────────────────────────────

describe('whatsappManager', () => {
  let manager;

  beforeEach(() => {
    // Clear module cache to get a fresh instance for each test
    delete require.cache[require.resolve('../backend/whatsappManager')];
    manager = require('../backend/whatsappManager');
  });

  it('getStatus returns disconnected for unknown user', () => {
    const s = manager.getStatus('testuser');
    assert.equal(s.connected, false);
    assert.equal(s.qrDataUrl, null);
  });

  it('getStatus rejects path-traversal userId', () => {
    assert.throws(() => manager.getStatus('../etc/passwd'), /Invalid userId/);
  });

  it('getStatus rejects empty userId', () => {
    assert.throws(() => manager.getStatus(''), /userId is required/);
  });

  it('getStatus rejects null userId', () => {
    assert.throws(() => manager.getStatus(null), /userId is required/);
  });

  it('getStatus accepts valid userId characters', () => {
    // Should not throw for alphanumeric, dash, underscore, dot
    manager.getStatus('user-123_abc.xyz');
  });

  it('sessionDir returns correct path per userId', () => {
    const dir = manager.sessionDir('myuser');
    const expected = path.resolve(path.join(__dirname, '..', 'data', 'myuser', 'whatsapp'));
    assert.equal(dir, expected);
  });

  it('sessionDir isolates different users', () => {
    const dir1 = manager.sessionDir('alice');
    const dir2 = manager.sessionDir('bob');
    assert.notEqual(dir1, dir2);
    assert.ok(dir1.includes('alice'));
    assert.ok(dir2.includes('bob'));
  });
});

// ─── userIdFromRequest helper tests ────────────────────────────────────────

describe('userIdFromRequest', () => {
  // Inline the same logic as server.js so we can test it without starting Express
  function userIdFromRequest(req) {
    const header = req.headers['x-stuntcock-token'];
    if (header && header.trim()) return header.trim();
    const auth = req.headers['authorization'];
    if (auth && auth.startsWith('Bearer ')) {
      const tok = auth.slice(7).trim();
      if (tok) return tok;
    }
    return null;
  }

  it('returns userId from X-StuntCock-Token header', () => {
    const userId = userIdFromRequest({ headers: { 'x-stuntcock-token': 'alice' } });
    assert.equal(userId, 'alice');
  });

  it('returns userId from Authorization Bearer header', () => {
    const userId = userIdFromRequest({ headers: { 'authorization': 'Bearer bob' } });
    assert.equal(userId, 'bob');
  });

  it('returns null when no token present', () => {
    const userId = userIdFromRequest({ headers: {} });
    assert.equal(userId, null);
  });

  it('prefers X-StuntCock-Token over Authorization', () => {
    const userId = userIdFromRequest({
      headers: { 'x-stuntcock-token': 'alice', 'authorization': 'Bearer bob' },
    });
    assert.equal(userId, 'alice');
  });

  it('trims whitespace from token', () => {
    const userId = userIdFromRequest({ headers: { 'x-stuntcock-token': '  alice  ' } });
    assert.equal(userId, 'alice');
  });

  it('returns null for empty X-StuntCock-Token', () => {
    const userId = userIdFromRequest({ headers: { 'x-stuntcock-token': '   ' } });
    assert.equal(userId, null);
  });
});
