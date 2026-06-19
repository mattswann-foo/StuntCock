// tests/ruleEngine.test.js
// Unit tests for backend/ruleEngine.js — trigger matching, sender filtering,
// cooldown, loop protection, and template rendering.

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const Module = require('module');

// ---------------------------------------------------------------------------
// Stub setup — intercept require() calls from ruleEngine so we never touch
// the real SQLite database or the real scheduler.
// ---------------------------------------------------------------------------

// Stub state that individual tests can mutate.
let stubRules = [];
let stubPhoneNumber = null;
let stubLastFired = null; // Date | null
let scheduleActiveResult = true;
let setCooldownCalled = false;

const dbStub = {
  getRules: () => stubRules,
  getSetting: (key, defaultValue) => {
    if (key === 'phone_number') return stubPhoneNumber;
    if (key === 'timezone') return 'UTC';
    return defaultValue ?? null;
  },
  getCooldownLastFired: () => stubLastFired,
  setCooldownLastFired: () => { setCooldownCalled = true; },
};

const schedulerStub = {
  isScheduleActive: () => scheduleActiveResult,
};

// Patch Node's module cache before requiring the module under test.
const dbPath = require.resolve('../backend/db');
const schedulerPath = require.resolve('../backend/scheduler');

require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: dbStub };
require.cache[schedulerPath] = { id: schedulerPath, filename: schedulerPath, loaded: true, exports: schedulerStub };

// Now load the real ruleEngine — it will pick up the stubs above.
const { matchMessage, isSelfMessage } = require('../backend/ruleEngine');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRule(overrides = {}) {
  return {
    id: 1,
    name: 'Test Rule',
    active: 1,
    trigger_type: 'any',
    trigger_value: null,
    sender_filter: 'all',
    response_type: 'static',
    response_text: 'Hello!',
    cooldown_minutes: 0,
    ...overrides,
  };
}

function reset() {
  stubRules = [];
  stubPhoneNumber = null;
  stubLastFired = null;
  scheduleActiveResult = true;
  setCooldownCalled = false;
}

// ---------------------------------------------------------------------------
// isSelfMessage
// ---------------------------------------------------------------------------

describe('isSelfMessage', () => {
  test('returns false when no phone_number is registered', () => {
    stubPhoneNumber = null;
    assert.equal(isSelfMessage('+15550001234'), false);
  });

  test('returns true when sender matches the registered phone_number', () => {
    stubPhoneNumber = '+15550001234';
    assert.equal(isSelfMessage('+15550001234'), true);
  });

  test('returns false when sender does not match registered phone_number', () => {
    stubPhoneNumber = '+15550001234';
    assert.equal(isSelfMessage('+19990009999'), false);
  });
});

// ---------------------------------------------------------------------------
// trigger_type: any
// ---------------------------------------------------------------------------

describe('trigger_type: any', () => {
  test('matches any message body', () => {
    reset();
    stubRules = [makeRule({ trigger_type: 'any' })];
    const result = matchMessage({ sender: '+1111', body: 'whatever', groupId: null });
    assert.ok(result, 'expected a match');
    assert.equal(result.rule.trigger_type, 'any');
  });

  test('matches empty body', () => {
    reset();
    stubRules = [makeRule({ trigger_type: 'any' })];
    const result = matchMessage({ sender: '+1111', body: '', groupId: null });
    assert.ok(result);
  });

  test('matches null body', () => {
    reset();
    stubRules = [makeRule({ trigger_type: 'any' })];
    const result = matchMessage({ sender: '+1111', body: null, groupId: null });
    assert.ok(result);
  });
});

// ---------------------------------------------------------------------------
// trigger_type: exact
// ---------------------------------------------------------------------------

describe('trigger_type: exact', () => {
  test('matches case-insensitively', () => {
    reset();
    stubRules = [makeRule({ trigger_type: 'exact', trigger_value: 'Hello' })];
    assert.ok(matchMessage({ sender: '+1111', body: 'hello', groupId: null }));
    assert.ok(matchMessage({ sender: '+1111', body: 'HELLO', groupId: null }));
    assert.ok(matchMessage({ sender: '+1111', body: 'Hello', groupId: null }));
  });

  test('trims whitespace before comparing', () => {
    reset();
    stubRules = [makeRule({ trigger_type: 'exact', trigger_value: 'hi' })];
    assert.ok(matchMessage({ sender: '+1111', body: '  hi  ', groupId: null }));
  });

  test('does not match partial body', () => {
    reset();
    stubRules = [makeRule({ trigger_type: 'exact', trigger_value: 'hi' })];
    assert.equal(matchMessage({ sender: '+1111', body: 'hi there', groupId: null }), null);
  });
});

// ---------------------------------------------------------------------------
// trigger_type: contains
// ---------------------------------------------------------------------------

describe('trigger_type: contains', () => {
  test('matches when body contains the trigger term', () => {
    reset();
    stubRules = [makeRule({ trigger_type: 'contains', trigger_value: 'urgent' })];
    assert.ok(matchMessage({ sender: '+1111', body: 'This is urgent please reply', groupId: null }));
  });

  test('matches case-insensitively', () => {
    reset();
    stubRules = [makeRule({ trigger_type: 'contains', trigger_value: 'urgent' })];
    assert.ok(matchMessage({ sender: '+1111', body: 'URGENT matter', groupId: null }));
  });

  test('matches pipe-separated alternatives — first term', () => {
    reset();
    stubRules = [makeRule({ trigger_type: 'contains', trigger_value: 'hello|bye' })];
    assert.ok(matchMessage({ sender: '+1111', body: 'say hello world', groupId: null }));
  });

  test('matches pipe-separated alternatives — second term', () => {
    reset();
    stubRules = [makeRule({ trigger_type: 'contains', trigger_value: 'hello|bye' })];
    assert.ok(matchMessage({ sender: '+1111', body: 'goodbye', groupId: null }));
  });

  test('does not match when none of the terms appear', () => {
    reset();
    stubRules = [makeRule({ trigger_type: 'contains', trigger_value: 'hello|bye' })];
    assert.equal(matchMessage({ sender: '+1111', body: 'nothing here', groupId: null }), null);
  });
});

// ---------------------------------------------------------------------------
// trigger_type: starts_with
// ---------------------------------------------------------------------------

describe('trigger_type: starts_with', () => {
  test('matches when body starts with the trigger value', () => {
    reset();
    stubRules = [makeRule({ trigger_type: 'starts_with', trigger_value: 'hey' })];
    assert.ok(matchMessage({ sender: '+1111', body: 'hey there', groupId: null }));
  });

  test('matches case-insensitively', () => {
    reset();
    stubRules = [makeRule({ trigger_type: 'starts_with', trigger_value: 'hey' })];
    assert.ok(matchMessage({ sender: '+1111', body: 'HEY there', groupId: null }));
  });

  test('matches pipe-separated alternatives — first term', () => {
    reset();
    stubRules = [makeRule({ trigger_type: 'starts_with', trigger_value: 'hi|hello' })];
    assert.ok(matchMessage({ sender: '+1111', body: 'hi everyone', groupId: null }));
  });

  test('matches pipe-separated alternatives — second term', () => {
    reset();
    stubRules = [makeRule({ trigger_type: 'starts_with', trigger_value: 'hi|hello' })];
    assert.ok(matchMessage({ sender: '+1111', body: 'hello world', groupId: null }));
  });

  test('does not match when body does not start with any term', () => {
    reset();
    stubRules = [makeRule({ trigger_type: 'starts_with', trigger_value: 'hi|hello' })];
    assert.equal(matchMessage({ sender: '+1111', body: 'say hi', groupId: null }), null);
  });
});

// ---------------------------------------------------------------------------
// trigger_type: regex
// ---------------------------------------------------------------------------

describe('trigger_type: regex', () => {
  test('matches a valid pattern', () => {
    reset();
    stubRules = [makeRule({ trigger_type: 'regex', trigger_value: '^call me' })];
    assert.ok(matchMessage({ sender: '+1111', body: 'call me back', groupId: null }));
  });

  test('is case-insensitive', () => {
    reset();
    stubRules = [makeRule({ trigger_type: 'regex', trigger_value: '^call me' })];
    assert.ok(matchMessage({ sender: '+1111', body: 'CALL ME BACK', groupId: null }));
  });

  test('does not match when pattern does not match body', () => {
    reset();
    stubRules = [makeRule({ trigger_type: 'regex', trigger_value: '^call me' })];
    assert.equal(matchMessage({ sender: '+1111', body: 'please call me', groupId: null }), null);
  });

  test('returns false (no throw) for an invalid regex pattern', () => {
    reset();
    stubRules = [makeRule({ trigger_type: 'regex', trigger_value: '[invalid((' })];
    // Should not throw — should return null (no match)
    assert.doesNotThrow(() => {
      const result = matchMessage({ sender: '+1111', body: 'anything', groupId: null });
      assert.equal(result, null);
    });
  });
});

// ---------------------------------------------------------------------------
// sender_filter
// ---------------------------------------------------------------------------

describe('sender_filter', () => {
  test('filter "all" matches any sender', () => {
    reset();
    stubRules = [makeRule({ sender_filter: 'all' })];
    assert.ok(matchMessage({ sender: '+19995554444', body: 'hi', groupId: null }));
  });

  test('specific phone number filter matches that sender', () => {
    reset();
    stubRules = [makeRule({ sender_filter: '+15550001234' })];
    assert.ok(matchMessage({ sender: '+15550001234', body: 'hi', groupId: null }));
  });

  test('specific phone number filter rejects other senders', () => {
    reset();
    stubRules = [makeRule({ sender_filter: '+15550001234' })];
    assert.equal(matchMessage({ sender: '+19990009999', body: 'hi', groupId: null }), null);
  });

  test('group filter matches the specific group', () => {
    reset();
    stubRules = [makeRule({ sender_filter: 'group:abc123' })];
    assert.ok(matchMessage({ sender: '+1111', body: 'hi', groupId: 'abc123' }));
  });

  test('group filter rejects wrong group', () => {
    reset();
    stubRules = [makeRule({ sender_filter: 'group:abc123' })];
    assert.equal(matchMessage({ sender: '+1111', body: 'hi', groupId: 'xyz999' }), null);
  });

  test('group filter rejects direct messages (no groupId)', () => {
    reset();
    stubRules = [makeRule({ sender_filter: 'group:abc123' })];
    assert.equal(matchMessage({ sender: '+1111', body: 'hi', groupId: null }), null);
  });
});

// ---------------------------------------------------------------------------
// Cooldown
// ---------------------------------------------------------------------------

describe('cooldown', () => {
  test('fires when cooldown_minutes is 0', () => {
    reset();
    stubRules = [makeRule({ cooldown_minutes: 0 })];
    assert.ok(matchMessage({ sender: '+1111', body: 'hi', groupId: null }));
  });

  test('fires when no previous fire recorded', () => {
    reset();
    stubRules = [makeRule({ cooldown_minutes: 5 })];
    stubLastFired = null;
    assert.ok(matchMessage({ sender: '+1111', body: 'hi', groupId: null }));
  });

  test('is blocked when within cooldown window', () => {
    reset();
    stubRules = [makeRule({ cooldown_minutes: 60 })];
    stubLastFired = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
    assert.equal(matchMessage({ sender: '+1111', body: 'hi', groupId: null }), null);
  });

  test('fires when cooldown window has elapsed', () => {
    reset();
    stubRules = [makeRule({ cooldown_minutes: 5 })];
    stubLastFired = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago, cooldown=5
    assert.ok(matchMessage({ sender: '+1111', body: 'hi', groupId: null }));
  });

  test('sets cooldown after firing when cooldown_minutes > 0', () => {
    reset();
    setCooldownCalled = false;
    stubRules = [makeRule({ cooldown_minutes: 5 })];
    stubLastFired = null;
    matchMessage({ sender: '+1111', body: 'hi', groupId: null });
    assert.equal(setCooldownCalled, true);
  });

  test('does not set cooldown when cooldown_minutes is 0', () => {
    reset();
    setCooldownCalled = false;
    stubRules = [makeRule({ cooldown_minutes: 0 })];
    matchMessage({ sender: '+1111', body: 'hi', groupId: null });
    assert.equal(setCooldownCalled, false);
  });
});

// ---------------------------------------------------------------------------
// Loop protection
// ---------------------------------------------------------------------------

describe('loop protection', () => {
  test('matchMessage returns null for self-messages', () => {
    reset();
    stubPhoneNumber = '+15550001234';
    stubRules = [makeRule()];
    assert.equal(matchMessage({ sender: '+15550001234', body: 'hi', groupId: null }), null);
  });
});

// ---------------------------------------------------------------------------
// Schedule gating (delegated to scheduler stub)
// ---------------------------------------------------------------------------

describe('schedule gating', () => {
  test('skips rule when schedule is not active', () => {
    reset();
    scheduleActiveResult = false;
    stubRules = [makeRule()];
    assert.equal(matchMessage({ sender: '+1111', body: 'hi', groupId: null }), null);
  });

  test('matches rule when schedule is active', () => {
    reset();
    scheduleActiveResult = true;
    stubRules = [makeRule()];
    assert.ok(matchMessage({ sender: '+1111', body: 'hi', groupId: null }));
  });
});

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

describe('response types', () => {
  test('static response returns response_text unchanged', () => {
    reset();
    stubRules = [makeRule({ response_type: 'static', response_text: 'Auto-reply!' })];
    const result = matchMessage({ sender: '+1111', body: 'hi', groupId: null });
    assert.equal(result.response, 'Auto-reply!');
  });

  test('llm response returns null (signals caller to invoke LLM)', () => {
    reset();
    stubRules = [makeRule({ response_type: 'llm', response_text: null })];
    const result = matchMessage({ sender: '+1111', body: 'hi', groupId: null });
    assert.ok(result, 'expected a match object');
    assert.equal(result.response, null);
  });

  test('template response substitutes {sender_name}', () => {
    reset();
    stubRules = [makeRule({
      response_type: 'template',
      response_text: 'Hi {sender_name}!',
    })];
    const result = matchMessage({ sender: '+1111', body: 'hello', groupId: null, senderName: 'Alice' });
    assert.ok(result.response.includes('Alice'), `expected "Alice" in "${result.response}"`);
  });

  test('template falls back to sender number when senderName is absent', () => {
    reset();
    stubRules = [makeRule({
      response_type: 'template',
      response_text: 'Hi {sender_name}!',
    })];
    const result = matchMessage({ sender: '+1111', body: 'hello', groupId: null });
    assert.ok(result.response.includes('+1111'), `expected "+1111" in "${result.response}"`);
  });
});

// ---------------------------------------------------------------------------
// First-match-wins (priority ordering preserved by stub)
// ---------------------------------------------------------------------------

describe('first-match-wins', () => {
  test('returns the first matching rule when multiple rules match', () => {
    reset();
    stubRules = [
      makeRule({ id: 1, trigger_type: 'any', response_text: 'First' }),
      makeRule({ id: 2, trigger_type: 'any', response_text: 'Second' }),
    ];
    const result = matchMessage({ sender: '+1111', body: 'hi', groupId: null });
    assert.equal(result.response, 'First');
  });

  test('falls through to next rule when first does not match', () => {
    reset();
    stubRules = [
      makeRule({ id: 1, trigger_type: 'exact', trigger_value: 'nomatch', response_text: 'First' }),
      makeRule({ id: 2, trigger_type: 'any', response_text: 'Second' }),
    ];
    const result = matchMessage({ sender: '+1111', body: 'hi', groupId: null });
    assert.equal(result.response, 'Second');
  });
});
