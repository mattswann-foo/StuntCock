// tests/validators.test.js
// Unit tests for backend/validators.js — full rule validation and partial update validation.

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { validateRule, validateRuleUpdate } = require('../backend/validators');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validRuleBase(overrides = {}) {
  return {
    name: 'My Rule',
    trigger_type: 'any',
    response_type: 'static',
    response_text: 'Hello!',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// validateRule — full rule validation
// ---------------------------------------------------------------------------

describe('validateRule — valid cases', () => {
  test('a complete valid rule passes', () => {
    const result = validateRule(validRuleBase());
    assert.equal(result.valid, true);
    assert.equal(result.error, undefined);
  });

  test('cooldown_minutes: 0 passes', () => {
    const result = validateRule(validRuleBase({ cooldown_minutes: 0 }));
    assert.equal(result.valid, true);
  });

  test('all valid trigger_type values pass', () => {
    for (const tt of ['any', 'exact', 'contains', 'starts_with', 'regex']) {
      const result = validateRule(validRuleBase({ trigger_type: tt }));
      assert.equal(result.valid, true, `expected valid for trigger_type="${tt}"`);
    }
  });

  test('all valid response_type values pass', () => {
    for (const rt of ['static', 'llm', 'template']) {
      const result = validateRule(validRuleBase({ response_type: rt }));
      assert.equal(result.valid, true, `expected valid for response_type="${rt}"`);
    }
  });

  test('zero-padded schedule times pass', () => {
    const result = validateRule(validRuleBase({ schedule_start: '09:00', schedule_end: '17:00' }));
    assert.equal(result.valid, true);
  });

  test('null schedule fields pass', () => {
    const result = validateRule(validRuleBase({ schedule_start: null, schedule_end: null }));
    assert.equal(result.valid, true);
  });
});

describe('validateRule — invalid trigger_type', () => {
  test('invalid trigger_type fails with correct message', () => {
    const result = validateRule(validRuleBase({ trigger_type: 'unknown' }));
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('trigger_type'), `error should mention trigger_type, got: "${result.error}"`);
    assert.ok(
      result.error.includes('any') && result.error.includes('exact'),
      `error should list valid options, got: "${result.error}"`
    );
  });

  test('empty string trigger_type fails', () => {
    const result = validateRule(validRuleBase({ trigger_type: '' }));
    assert.equal(result.valid, false);
  });

  test('missing trigger_type fails', () => {
    const rule = { name: 'Test', response_type: 'static' };
    const result = validateRule(rule);
    assert.equal(result.valid, false);
  });
});

describe('validateRule — invalid response_type', () => {
  test('invalid response_type fails', () => {
    const result = validateRule(validRuleBase({ response_type: 'ai' }));
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('response_type'), `error should mention response_type, got: "${result.error}"`);
  });

  test('missing response_type fails', () => {
    const rule = { name: 'Test', trigger_type: 'any' };
    const result = validateRule(rule);
    assert.equal(result.valid, false);
  });
});

describe('validateRule — schedule_start format', () => {
  test('"9:00" fails — not zero-padded', () => {
    const result = validateRule(validRuleBase({ schedule_start: '9:00' }));
    assert.equal(result.valid, false);
    assert.ok(result.error.toLowerCase().includes('schedule_start'), `error should mention schedule_start, got: "${result.error}"`);
  });

  test('"09:00" passes — zero-padded', () => {
    const result = validateRule(validRuleBase({ schedule_start: '09:00' }));
    assert.equal(result.valid, true);
  });

  test('"9:00" fails for schedule_end as well', () => {
    const result = validateRule(validRuleBase({ schedule_end: '9:00' }));
    assert.equal(result.valid, false);
  });

  test('"00:00" passes', () => {
    const result = validateRule(validRuleBase({ schedule_start: '00:00', schedule_end: '23:59' }));
    assert.equal(result.valid, true);
  });
});

describe('validateRule — cooldown_minutes', () => {
  test('cooldown_minutes: -1 fails', () => {
    const result = validateRule(validRuleBase({ cooldown_minutes: -1 }));
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('cooldown_minutes'), `error should mention cooldown_minutes, got: "${result.error}"`);
  });

  test('cooldown_minutes: 0 passes', () => {
    const result = validateRule(validRuleBase({ cooldown_minutes: 0 }));
    assert.equal(result.valid, true);
  });

  test('cooldown_minutes: 60 passes', () => {
    const result = validateRule(validRuleBase({ cooldown_minutes: 60 }));
    assert.equal(result.valid, true);
  });

  test('cooldown_minutes: null/undefined is treated as absent (passes)', () => {
    const result = validateRule(validRuleBase({ cooldown_minutes: null }));
    assert.equal(result.valid, true);
  });
});

describe('validateRule — name validation', () => {
  test('missing name fails', () => {
    const result = validateRule({ trigger_type: 'any', response_type: 'static' });
    assert.equal(result.valid, false);
  });

  test('empty name fails', () => {
    const result = validateRule(validRuleBase({ name: '' }));
    assert.equal(result.valid, false);
  });

  test('whitespace-only name fails', () => {
    const result = validateRule(validRuleBase({ name: '   ' }));
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// validateRuleUpdate — partial update validation
// ---------------------------------------------------------------------------

describe('validateRuleUpdate — valid partial updates', () => {
  test('partial update with only name passes', () => {
    const result = validateRuleUpdate({ name: 'New Name' });
    assert.equal(result.valid, true);
  });

  test('partial update with only trigger_type passes when valid', () => {
    const result = validateRuleUpdate({ trigger_type: 'regex' });
    assert.equal(result.valid, true);
  });

  test('partial update with only cooldown_minutes: 0 passes', () => {
    const result = validateRuleUpdate({ cooldown_minutes: 0 });
    assert.equal(result.valid, true);
  });

  test('partial update with only schedule_start: "09:00" passes', () => {
    const result = validateRuleUpdate({ schedule_start: '09:00' });
    assert.equal(result.valid, true);
  });

  test('empty update object passes', () => {
    const result = validateRuleUpdate({});
    assert.equal(result.valid, true);
  });
});

describe('validateRuleUpdate — invalid partial updates', () => {
  test('invalid trigger_type in partial update fails', () => {
    const result = validateRuleUpdate({ trigger_type: 'bad' });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('trigger_type'));
  });

  test('invalid response_type in partial update fails', () => {
    const result = validateRuleUpdate({ response_type: 'webhook' });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('response_type'));
  });

  test('schedule_start "9:00" in partial update fails', () => {
    const result = validateRuleUpdate({ schedule_start: '9:00' });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('schedule_start'));
  });

  test('cooldown_minutes: -1 in partial update fails', () => {
    const result = validateRuleUpdate({ cooldown_minutes: -1 });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('cooldown_minutes'));
  });

  test('non-object update fails', () => {
    const result = validateRuleUpdate(null);
    assert.equal(result.valid, false);
  });
});
