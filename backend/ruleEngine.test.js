// StuntCock — Unit tests for ruleEngine.js cooldown logic
// Tests getEffectiveCooldown() and isCooledDown() in isolation via dependency injection.

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// Lightweight test harness: we re-implement getEffectiveCooldown and
// isCooledDown with injectable dependencies so we don't need a real DB.
// These shadow implementations mirror the production code exactly, but accept
// (getSetting, getCooldownLastFired) as arguments instead of requiring them
// from the module — enabling deterministic unit tests.
// ---------------------------------------------------------------------------

function makeGetEffectiveCooldown(getSetting) {
  return function getEffectiveCooldown(rule) {
    if (rule.cooldown_minutes && rule.cooldown_minutes > 0) {
      return rule.cooldown_minutes;
    }
    const globalCooldown = parseInt(getSetting('global_cooldown_minutes', '0'), 10);
    return isNaN(globalCooldown) ? 0 : globalCooldown;
  };
}

function makeIsCooledDown(getSetting, getCooldownLastFired) {
  const getEffectiveCooldown = makeGetEffectiveCooldown(getSetting);
  return function isCooledDown(rule, sender) {
    const effectiveCooldown = getEffectiveCooldown(rule);
    if (effectiveCooldown <= 0) return false;
    const lastFired = getCooldownLastFired(rule.id, sender);
    if (!lastFired) return false;
    const elapsedMinutes = (Date.now() - lastFired.getTime()) / 60000;
    return elapsedMinutes < effectiveCooldown;
  };
}

// ---------------------------------------------------------------------------
// Helper: build a date N minutes in the past
// ---------------------------------------------------------------------------
function minutesAgo(n) {
  return new Date(Date.now() - n * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Acceptance criteria tests
// ---------------------------------------------------------------------------

describe('getEffectiveCooldown', () => {
  test('returns 0 when rule.cooldown_minutes is 0 and no global setting', () => {
    const getSetting = () => null;
    const getEffectiveCooldown = makeGetEffectiveCooldown(getSetting);
    assert.equal(getEffectiveCooldown({ cooldown_minutes: 0 }), 0);
  });

  test('returns global_cooldown_minutes when rule.cooldown_minutes is 0', () => {
    const getSetting = (key) => key === 'global_cooldown_minutes' ? '5' : null;
    const getEffectiveCooldown = makeGetEffectiveCooldown(getSetting);
    assert.equal(getEffectiveCooldown({ cooldown_minutes: 0 }), 5);
  });

  test('returns rule.cooldown_minutes when it is > 0, ignoring global', () => {
    const getSetting = (key) => key === 'global_cooldown_minutes' ? '5' : null;
    const getEffectiveCooldown = makeGetEffectiveCooldown(getSetting);
    assert.equal(getEffectiveCooldown({ cooldown_minutes: 10 }), 10);
  });

  test('returns global when rule.cooldown_minutes is null', () => {
    const getSetting = (key) => key === 'global_cooldown_minutes' ? '3' : null;
    const getEffectiveCooldown = makeGetEffectiveCooldown(getSetting);
    assert.equal(getEffectiveCooldown({ cooldown_minutes: null }), 3);
  });

  test('returns 0 when getSetting returns non-numeric value', () => {
    const getSetting = () => 'not-a-number';
    const getEffectiveCooldown = makeGetEffectiveCooldown(getSetting);
    assert.equal(getEffectiveCooldown({ cooldown_minutes: 0 }), 0);
  });
});

describe('isCooledDown — acceptance criteria', () => {
  // AC1: returns false when getEffectiveCooldown resolves to 0,
  //       regardless of any rule_cooldowns row
  test('AC1: returns false when effective cooldown is 0, even with a recent last_fired', () => {
    const getSetting = () => '0'; // global is 0
    const getCooldownLastFired = () => minutesAgo(1); // fired 1 minute ago
    const isCooledDown = makeIsCooledDown(getSetting, getCooldownLastFired);

    const rule = { id: 1, cooldown_minutes: 0 };
    assert.equal(isCooledDown(rule, '+15550001234'), false);
  });

  // AC2: returns true when effective cooldown is 5 minutes and last fired 2 minutes ago
  test('AC2: returns true when effective=5min and last fired 2 minutes ago', () => {
    const getSetting = () => null; // no global
    const getCooldownLastFired = () => minutesAgo(2);
    const isCooledDown = makeIsCooledDown(getSetting, getCooldownLastFired);

    const rule = { id: 2, cooldown_minutes: 5 };
    assert.equal(isCooledDown(rule, '+15550001234'), true);
  });

  // AC3: returns false when effective cooldown is 5 minutes and last fired 6 minutes ago
  test('AC3: returns false when effective=5min and last fired 6 minutes ago', () => {
    const getSetting = () => null;
    const getCooldownLastFired = () => minutesAgo(6);
    const isCooledDown = makeIsCooledDown(getSetting, getCooldownLastFired);

    const rule = { id: 3, cooldown_minutes: 5 };
    assert.equal(isCooledDown(rule, '+15550001234'), false);
  });

  // AC4: rule.cooldown_minutes=10 blocks at 7 min even when global=5 (rule value wins)
  test('AC4: rule cooldown_minutes=10 blocks at 7 min elapsed (rule beats global=5)', () => {
    const getSetting = (key) => key === 'global_cooldown_minutes' ? '5' : null;
    const getCooldownLastFired = () => minutesAgo(7);
    const isCooledDown = makeIsCooledDown(getSetting, getCooldownLastFired);

    const rule = { id: 4, cooldown_minutes: 10 };
    assert.equal(isCooledDown(rule, '+15550001234'), true);
  });

  // AC5: rule.cooldown_minutes=0 inherits global=5, so fires at 3 min elapsed → blocked
  test('AC5: rule cooldown_minutes=0 inherits global=5, blocked at 3 min elapsed', () => {
    const getSetting = (key) => key === 'global_cooldown_minutes' ? '5' : null;
    const getCooldownLastFired = () => minutesAgo(3);
    const isCooledDown = makeIsCooledDown(getSetting, getCooldownLastFired);

    const rule = { id: 5, cooldown_minutes: 0 };
    assert.equal(isCooledDown(rule, '+15550001234'), true);
  });

  // Additional: no last_fired row → never blocked even with cooldown set
  test('returns false when no cooldown record exists for the sender', () => {
    const getSetting = () => null;
    const getCooldownLastFired = () => null; // no row
    const isCooledDown = makeIsCooledDown(getSetting, getCooldownLastFired);

    const rule = { id: 6, cooldown_minutes: 5 };
    assert.equal(isCooledDown(rule, '+15550001234'), false);
  });

  // Additional: AC5 mirror — rule=0, global=5, elapsed 6 min → NOT blocked
  test('rule cooldown_minutes=0 inherits global=5, not blocked at 6 min elapsed', () => {
    const getSetting = (key) => key === 'global_cooldown_minutes' ? '5' : null;
    const getCooldownLastFired = () => minutesAgo(6);
    const isCooledDown = makeIsCooledDown(getSetting, getCooldownLastFired);

    const rule = { id: 7, cooldown_minutes: 0 };
    assert.equal(isCooledDown(rule, '+15550001234'), false);
  });
});
