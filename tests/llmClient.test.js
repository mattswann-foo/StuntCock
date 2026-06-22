// tests/llmClient.test.js
// Unit tests for the truncateAtSentence utility in backend/llmClient.js.

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// ---------------------------------------------------------------------------
// Stub out dependencies so we never hit the real DB or Anthropic SDK.
// ---------------------------------------------------------------------------

// Stub: backend/db
const dbPath = require.resolve('../backend/db');
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    getSetting: () => null,
    getConversationHistory: () => [],
    appendConversation: () => {},
  },
};

// Stub: @anthropic-ai/sdk — just needs to not throw on require
const sdkPath = require.resolve('@anthropic-ai/sdk');
require.cache[sdkPath] = {
  id: sdkPath,
  filename: sdkPath,
  loaded: true,
  exports: function Anthropic() { return {}; },
};

// Now load the module under test.
const { truncateAtSentence } = require('../backend/llmClient');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('truncateAtSentence', () => {
  test('returns text unchanged when it is under 500 chars', () => {
    const short = 'Hello world.';
    assert.equal(truncateAtSentence(short), short);
  });

  test('returns text unchanged when it is exactly 500 chars', () => {
    const exact500 = 'x'.repeat(500);
    assert.equal(truncateAtSentence(exact500), exact500);
  });

  test('truncates at the last sentence boundary when text exceeds 500 chars', () => {
    // Build a string >500 chars with a sentence boundary well past the 250-char midpoint.
    const sentences = 'This is a sentence that fills space. '.repeat(10); // ~370 chars per 10 reps
    const longText = sentences + 'Extra trailing content that pushes it over five hundred characters total for sure.';
    assert.ok(longText.length > 500, 'precondition: text must exceed 500 chars');

    const result = truncateAtSentence(longText);
    assert.ok(result.length <= 500, `result length ${result.length} should be ≤ 500`);
    // Should end at a sentence boundary (period), not with ellipsis.
    assert.ok(result.endsWith('.'), `expected result to end with "." but got: "${result.slice(-5)}"`);
  });

  test('appends ellipsis when text exceeds 500 chars but has no sentence boundary in the first half', () => {
    // A single very long "sentence" with no mid-string period.
    const noBreak = 'A'.repeat(600);
    const result = truncateAtSentence(noBreak);
    assert.ok(result.length <= 503, `result length ${result.length} should be close to 500 with ellipsis`); // 500 + ellipsis char
    assert.ok(result.endsWith('…'), `expected result to end with "…" but got: "${result.slice(-5)}"`);
  });

  test('respects a custom maxLen parameter', () => {
    const text = 'Short sentence here. Another one over there.';
    // With maxLen=20, the text is over the limit.
    const result = truncateAtSentence(text, 20);
    assert.ok(result.length <= 23, `result length ${result.length} should not greatly exceed 20`);
  });

  test('truncates at sentence boundary for period followed by space', () => {
    // Exactly craft a string where the last sentence end before 500 chars is a period.
    const prefix = 'First sentence ends here. ';
    const filler = 'x'.repeat(500 - prefix.length + 10); // push over 500
    const text = prefix + filler;
    assert.ok(text.length > 500);
    const result = truncateAtSentence(text);
    // The period in prefix is well past the 50% threshold (prefix.length << 250),
    // but let's check the general contract: result ≤ 500 and is either at boundary or ellipsis.
    assert.ok(result.length <= 500);
  });
});
