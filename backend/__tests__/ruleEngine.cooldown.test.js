// Tests for cooldown-recording guard fix in matchMessage()
// Verifies that getEffectiveCooldown() is used when deciding whether to write rule_cooldowns.

'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// ---- Minimal in-memory stubs for db.js dependencies ----

// We stub out the db module so tests don't need a real SQLite file.
const cooldownStore = {}; // key: `${ruleId}:${sender}` => Date
let settingsStore = {};
let rulesStore = [];
let cooldownSetCalls = []; // records every setCooldownLastFired call

function resetStores() {
  for (const k of Object.keys(cooldownStore)) delete cooldownStore[k];
  settingsStore = {};
  rulesStore = [];
  cooldownSetCalls = [];
}

// Patch require so ruleEngine picks up our stubs
const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === './db' || (parent && parent.filename && parent.filename.includes('ruleEngine') && request === './db')) {
    return {
      getRules: () => rulesStore,
      getCooldownLastFired: (ruleId, sender) => {
        const key = `${ruleId}:${sender}`;
        return cooldownStore[key] || null;
      },
      setCooldownLastFired: (ruleId, sender) => {
        const key = `${ruleId}:${sender}`;
        cooldownStore[key] = new Date();
        cooldownSetCalls.push({ ruleId, sender });
      },
      getSetting: (key, defaultValue = null) => {
        return key in settingsStore ? settingsStore[key] : defaultValue;
      },
    };
  }
  if (request === './scheduler' || (parent && parent.filename && parent.filename.includes('ruleEngine') && request === './scheduler')) {
    return {
      isScheduleActive: () => true,
    };
  }
  return originalLoad.apply(this, arguments);
};

// Now require ruleEngine (after the stub is in place)
const { matchMessage } = require('../ruleEngine');

// ---- Helpers ----

function makeRule(overrides = {}) {
  return {
    id: 1,
    name: 'Test Rule',
    active: 1,
    priority: 0,
    trigger_type: 'any',
    trigger_value: null,
    sender_filter: 'all',
    platform_filter: 'any',
    response_type: 'static',
    response_text: 'Hello',
    schedule_start: null,
    schedule_end: null,
    schedule_days: null,
    cooldown_minutes: 0,
    ...overrides,
  };
}

function makeMessage(overrides = {}) {
  return {
    sender: '+15550001234',
    groupId: null,
    body: 'hi',
    platform: 'signal',
    ...overrides,
  };
}

// ---- Tests ----

describe('cooldown recording guard — getEffectiveCooldown', () => {
  beforeEach(() => {
    resetStores();
  });

  test('AC1: rule.cooldown=0, global=5 → writes rule_cooldowns row after firing', () => {
    settingsStore['global_cooldown_minutes'] = '5';
    rulesStore = [makeRule({ cooldown_minutes: 0 })];

    const result = matchMessage(makeMessage());
    assert.ok(result, 'rule should match');
    assert.equal(cooldownSetCalls.length, 1, 'setCooldownLastFired should be called once');
    assert.equal(cooldownSetCalls[0].ruleId, 1);
    assert.equal(cooldownSetCalls[0].sender, '+15550001234');
  });

  test('AC2: rule.cooldown=0, global=0 → no row written to rule_cooldowns', () => {
    settingsStore['global_cooldown_minutes'] = '0';
    rulesStore = [makeRule({ cooldown_minutes: 0 })];

    const result = matchMessage(makeMessage());
    assert.ok(result, 'rule should match');
    assert.equal(cooldownSetCalls.length, 0, 'setCooldownLastFired should NOT be called when both cooldowns are 0');
  });

  test('AC2b: rule.cooldown=0, global setting absent → no row written', () => {
    // No global_cooldown_minutes in settings
    rulesStore = [makeRule({ cooldown_minutes: 0 })];

    const result = matchMessage(makeMessage());
    assert.ok(result, 'rule should match');
    assert.equal(cooldownSetCalls.length, 0, 'setCooldownLastFired should NOT be called when no cooldown configured');
  });

  test('AC3: rule.cooldown=10, global=0 → row written exactly as before', () => {
    settingsStore['global_cooldown_minutes'] = '0';
    rulesStore = [makeRule({ cooldown_minutes: 10 })];

    const result = matchMessage(makeMessage());
    assert.ok(result, 'rule should match');
    assert.equal(cooldownSetCalls.length, 1, 'setCooldownLastFired should be called once');
  });

  test('AC4: second trigger within global cooldown window is blocked AND no new row is written', () => {
    settingsStore['global_cooldown_minutes'] = '5';
    rulesStore = [makeRule({ cooldown_minutes: 0 })];

    // First invocation — fires and writes cooldown
    const firstResult = matchMessage(makeMessage());
    assert.ok(firstResult, 'first invocation should match');
    assert.equal(cooldownSetCalls.length, 1, 'one row written after first fire');

    // Simulate that last_fired is NOW (well within 5-minute window)
    const ruleId = 1;
    const sender = '+15550001234';
    cooldownStore[`${ruleId}:${sender}`] = new Date(); // fresh timestamp

    // Second invocation — should be blocked
    const callsBefore = cooldownSetCalls.length;
    const secondResult = matchMessage(makeMessage());
    assert.equal(secondResult, null, 'second invocation should be blocked by global cooldown');
    assert.equal(cooldownSetCalls.length, callsBefore, 'no new row should be written for blocked invocation');
  });

  test('AC4b: second trigger AFTER global cooldown window is NOT blocked', () => {
    settingsStore['global_cooldown_minutes'] = '5';
    rulesStore = [makeRule({ cooldown_minutes: 0 })];

    // Simulate that last_fired was 10 minutes ago (outside 5-minute window)
    const ruleId = 1;
    const sender = '+15550001234';
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    cooldownStore[`${ruleId}:${sender}`] = tenMinutesAgo;

    const result = matchMessage(makeMessage());
    assert.ok(result, 'should fire after cooldown window has passed');
    assert.equal(cooldownSetCalls.length, 1, 'new row should be written');
  });

  test('AC3b: rule.cooldown=10 both times — second trigger within window is blocked', () => {
    rulesStore = [makeRule({ cooldown_minutes: 10 })];

    // First fire
    const firstResult = matchMessage(makeMessage());
    assert.ok(firstResult, 'first invocation should match');

    // Simulate recent last_fired
    cooldownStore[`1:+15550001234`] = new Date();

    const callsBefore = cooldownSetCalls.length;
    const secondResult = matchMessage(makeMessage());
    assert.equal(secondResult, null, 'should be blocked by rule cooldown');
    assert.equal(cooldownSetCalls.length, callsBefore, 'no new row written when blocked');
  });

  test('effective cooldown uses max of rule and global', () => {
    // rule=3, global=10 → effective should be 10
    settingsStore['global_cooldown_minutes'] = '10';
    rulesStore = [makeRule({ cooldown_minutes: 3 })];

    // Fire once to write cooldown
    matchMessage(makeMessage());
    assert.equal(cooldownSetCalls.length, 1);

    // Simulate last_fired was 5 minutes ago — within global 10-min window but past rule's 3-min
    cooldownStore[`1:+15550001234`] = new Date(Date.now() - 5 * 60 * 1000);

    const secondResult = matchMessage(makeMessage());
    assert.equal(secondResult, null, 'should be blocked because global cooldown (10 min) > rule cooldown (3 min) and only 5 min elapsed');
  });
});
