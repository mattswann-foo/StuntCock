// backend/middleware/observability.test.js
// Unit tests for observability middleware — specifically PII redaction.
// Uses Node.js built-in test runner (node:test), no external test framework required.

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

// Import the module under test (no GCP credentials needed — all client creation is lazy)
process.env.GCLOUD_PROJECT = ''; // ensure GCP clients are not created during tests
const { redact, PII_KEYS, requestLogger, errorReporter, extractTraceContext, extractUserId, withTraceSpan } = require('./observability');

// ---------------------------------------------------------------------------
// redact() — PII removal
// ---------------------------------------------------------------------------

test('redact: removes email address from string values', () => {
  const result = redact('Contact us at a@b.com for help');
  assert.ok(!result.includes('a@b.com'), `Expected email to be redacted, got: ${result}`);
  assert.ok(result.includes('[REDACTED]'), 'Expected [REDACTED] marker');
});

test('redact: entry with { email: "a@b.com", status: 200 } does not contain a@b.com', () => {
  // Acceptance criterion: given a log entry with { email: 'a@b.com', status: 200 },
  // the emitted log output does not contain 'a@b.com'
  const entry = { email: 'a@b.com', status: 200 };
  const output = JSON.stringify(redact(entry));
  assert.ok(!output.includes('a@b.com'), `Expected a@b.com to be redacted. Got: ${output}`);
  assert.ok(output.includes('[REDACTED]'), `Expected [REDACTED] marker. Got: ${output}`);
  assert.ok(output.includes('200'), 'Expected non-PII field (status) to be preserved');
});

test('redact: removes phone_number field', () => {
  const entry = { phone_number: '+15550001234', name: 'Alice' };
  const result = redact(entry);
  assert.strictEqual(result.phone_number, '[REDACTED]');
  assert.strictEqual(result.name, 'Alice');
});

test('redact: removes anthropic_api_key field', () => {
  const entry = { anthropic_api_key: 'sk-ant-abc123', model: 'claude' };
  const result = redact(entry);
  assert.strictEqual(result.anthropic_api_key, '[REDACTED]');
  assert.strictEqual(result.model, 'claude');
});

test('redact: removes receipt field', () => {
  const entry = { receipt: 'rec_xyz789abc', amount: 100 };
  const result = redact(entry);
  assert.strictEqual(result.receipt, '[REDACTED]');
  assert.strictEqual(result.amount, 100);
});

test('redact: removes payment_token field', () => {
  const entry = { payment_token: 'tok_1234567890abcde', userId: 'u1' };
  const result = redact(entry);
  assert.strictEqual(result.payment_token, '[REDACTED]');
  assert.strictEqual(result.userId, 'u1');
});

test('redact: redacts Anthropic API key pattern in string values', () => {
  const s = 'My key is sk-ant-abcdefghij1234567890 thanks';
  const result = redact(s);
  assert.ok(!result.includes('sk-ant-'), `Expected API key pattern to be redacted. Got: ${result}`);
});

test('redact: redacts Stripe-style token patterns in string values', () => {
  const s = 'Payment token: tok_1Abc2Def3Ghi4Jkl done';
  const result = redact(s);
  assert.ok(!result.includes('tok_1Abc2Def3Ghi4Jkl'), `Expected token pattern to be redacted. Got: ${result}`);
});

test('redact: preserves non-PII fields untouched', () => {
  const entry = { status: 200, durationMs: 42, method: 'GET', path: '/api/health' };
  const result = redact(entry);
  assert.deepStrictEqual(result, entry);
});

test('redact: handles nested objects', () => {
  const entry = { user: { email: 'x@y.com', id: 'u1' }, status: 200 };
  const result = redact(entry);
  assert.ok(!JSON.stringify(result).includes('x@y.com'), 'Nested email must be redacted');
  assert.strictEqual(result.user.id, 'u1');
});

test('redact: handles arrays', () => {
  const entry = [{ email: 'a@b.com' }, { status: 200 }];
  const result = redact(entry);
  assert.ok(!JSON.stringify(result).includes('a@b.com'), 'Email in array must be redacted');
});

test('redact: handles null and undefined gracefully', () => {
  assert.strictEqual(redact(null), null);
  assert.strictEqual(redact(undefined), undefined);
});

test('redact: handles numbers and booleans untouched', () => {
  assert.strictEqual(redact(42), 42);
  assert.strictEqual(redact(true), true);
  assert.strictEqual(redact(false), false);
});

test('redact: case-insensitive key matching for PII_KEYS', () => {
  // PII_KEYS.has() uses .toLowerCase() on the key
  const entry = { Email: 'a@b.com', STATUS: 200 };
  const result = redact(entry);
  assert.strictEqual(result.Email, '[REDACTED]');
  assert.strictEqual(result.STATUS, 200);
});

test('redact: does not modify original object', () => {
  const original = { email: 'a@b.com', status: 200 };
  const result = redact(original);
  // Original should be unchanged
  assert.strictEqual(original.email, 'a@b.com');
  // Result should be redacted
  assert.strictEqual(result.email, '[REDACTED]');
});

// ---------------------------------------------------------------------------
// extractTraceContext
// ---------------------------------------------------------------------------

test('extractTraceContext: parses X-Cloud-Trace-Context header', () => {
  const req = { headers: { 'x-cloud-trace-context': 'abc123/456;o=1' } };
  const { traceId, spanId } = extractTraceContext(req);
  assert.strictEqual(traceId, 'abc123');
  assert.strictEqual(spanId, '456');
});

test('extractTraceContext: generates fallback traceId when header absent', () => {
  const req = { headers: {} };
  const { traceId } = extractTraceContext(req);
  assert.ok(traceId.startsWith('local-'), `Expected local- prefix, got: ${traceId}`);
});

// ---------------------------------------------------------------------------
// requestLogger middleware
// ---------------------------------------------------------------------------

test('requestLogger: attaches traceId to req and calls next', (t, done) => {
  const req = {
    headers: { 'x-cloud-trace-context': 'trace999/span1;o=1' },
    method: 'GET',
    path: '/api/health',
    user: null,
  };
  const res = {
    statusCode: 200,
    on: (event, cb) => {
      // immediately fire finish event so we can check side-effects
      if (event === 'finish') cb();
    },
  };
  requestLogger(req, res, () => {
    assert.strictEqual(req.traceId, 'trace999');
    done();
  });
});

// ---------------------------------------------------------------------------
// PII_KEYS set
// ---------------------------------------------------------------------------

test('PII_KEYS includes all required sensitive field names', () => {
  const required = ['email', 'phone_number', 'anthropic_api_key', 'receipt', 'payment_token'];
  for (const key of required) {
    assert.ok(PII_KEYS.has(key), `PII_KEYS must include '${key}'`);
  }
});

// ---------------------------------------------------------------------------
// extractUserId
// ---------------------------------------------------------------------------

test('extractUserId: returns uid from req.user.uid', () => {
  const req = { headers: {}, user: { uid: 'user-abc-123' } };
  assert.strictEqual(extractUserId(req), 'user-abc-123');
});

test('extractUserId: falls back to x-forwarded-user header', () => {
  const req = { headers: { 'x-forwarded-user': 'hdr-user-456' }, user: null };
  assert.strictEqual(extractUserId(req), 'hdr-user-456');
});

test('extractUserId: returns anonymous when no user context', () => {
  const req = { headers: {}, user: null };
  assert.strictEqual(extractUserId(req), 'anonymous');
});

// ---------------------------------------------------------------------------
// errorReporter middleware
// ---------------------------------------------------------------------------

test('errorReporter: calls next with the error', (t, done) => {
  const err = new Error('test error');
  const req = {
    headers: {},
    method: 'GET',
    path: '/api/test',
    traceId: 'trace-err-test',
    user: null,
  };
  const res = {};
  errorReporter(err, req, res, (passedErr) => {
    assert.strictEqual(passedErr, err, 'errorReporter must call next(err)');
    done();
  });
});

test('errorReporter: works when req has no traceId (extracts from headers)', (t, done) => {
  const err = new Error('no-trace error');
  const req = {
    headers: { 'x-cloud-trace-context': 'trace-xyz/span1;o=1' },
    method: 'POST',
    path: '/api/rules',
    user: null,
  };
  const res = {};
  errorReporter(err, req, res, (passedErr) => {
    assert.strictEqual(passedErr, err);
    done();
  });
});

// ---------------------------------------------------------------------------
// withTraceSpan
// ---------------------------------------------------------------------------

test('withTraceSpan: returns result of wrapped fn', async () => {
  const result = await withTraceSpan('test.span', 'trace-001', async () => 42);
  assert.strictEqual(result, 42);
});

test('withTraceSpan: re-throws error from wrapped fn', async () => {
  await assert.rejects(
    () => withTraceSpan('test.error.span', 'trace-002', async () => { throw new Error('span failed'); }),
    { message: 'span failed' }
  );
});
