// tests/scheduler.test.js
// Unit tests for backend/scheduler.js — same-day window, overnight window,
// no-schedule default, and day-of-week filtering.

'use strict';

const { test, describe, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// We need to control what "now" is. The scheduler uses:
//   new Date(new Date().toLocaleString('en-US', { timeZone: timezone }))
// We mock Date globally using node:test's mock.timers so each test
// can pin the current time precisely.
// ---------------------------------------------------------------------------

const { isScheduleActive } = require('../backend/scheduler');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a rule-like object with only the schedule fields.
 */
function makeRule({ schedule_start = null, schedule_end = null, schedule_days = null } = {}) {
  return { schedule_start, schedule_end, schedule_days };
}

/**
 * Pins the system clock to a specific ISO-8601 datetime string.
 * Uses mock.timers from node:test (Node ≥ 20) if available, otherwise
 * patches Date directly for compatibility with Node 18.
 *
 * Returns a restore function.
 */
let RealDate;
function pinTime(isoString) {
  RealDate = RealDate || global.Date;
  const fixedMs = RealDate.parse(isoString);
  const FixedDate = class extends RealDate {
    constructor(...args) {
      if (args.length === 0) {
        super(fixedMs);
      } else {
        super(...args);
      }
    }
    static now() { return fixedMs; }
    static parse(s) { return RealDate.parse(s); }
    static UTC(...args) { return RealDate.UTC(...args); }
  };
  global.Date = FixedDate;
  return () => { global.Date = RealDate; };
}

// ---------------------------------------------------------------------------
// No schedule set
// ---------------------------------------------------------------------------

describe('no schedule set', () => {
  test('returns true when both schedule_start and schedule_end are null', () => {
    const rule = makeRule();
    assert.equal(isScheduleActive(rule, 'UTC'), true);
  });

  test('returns true when only schedule_start is set (incomplete pair)', () => {
    const rule = makeRule({ schedule_start: '09:00' });
    assert.equal(isScheduleActive(rule, 'UTC'), true);
  });

  test('returns true when only schedule_end is set (incomplete pair)', () => {
    const rule = makeRule({ schedule_end: '17:00' });
    assert.equal(isScheduleActive(rule, 'UTC'), true);
  });
});

// ---------------------------------------------------------------------------
// Same-day window (e.g. 09:00–17:00)
// ---------------------------------------------------------------------------

describe('same-day window', () => {
  test('inside window → true', () => {
    const restore = pinTime('2024-01-15T12:00:00Z'); // 12:00 UTC
    try {
      const rule = makeRule({ schedule_start: '09:00', schedule_end: '17:00' });
      assert.equal(isScheduleActive(rule, 'UTC'), true);
    } finally { restore(); }
  });

  test('at window start → true (inclusive)', () => {
    const restore = pinTime('2024-01-15T09:00:00Z');
    try {
      const rule = makeRule({ schedule_start: '09:00', schedule_end: '17:00' });
      assert.equal(isScheduleActive(rule, 'UTC'), true);
    } finally { restore(); }
  });

  test('at window end → false (exclusive)', () => {
    const restore = pinTime('2024-01-15T17:00:00Z');
    try {
      const rule = makeRule({ schedule_start: '09:00', schedule_end: '17:00' });
      assert.equal(isScheduleActive(rule, 'UTC'), false);
    } finally { restore(); }
  });

  test('before window → false', () => {
    const restore = pinTime('2024-01-15T08:00:00Z'); // 08:00 UTC
    try {
      const rule = makeRule({ schedule_start: '09:00', schedule_end: '17:00' });
      assert.equal(isScheduleActive(rule, 'UTC'), false);
    } finally { restore(); }
  });

  test('after window → false', () => {
    const restore = pinTime('2024-01-15T20:00:00Z'); // 20:00 UTC
    try {
      const rule = makeRule({ schedule_start: '09:00', schedule_end: '17:00' });
      assert.equal(isScheduleActive(rule, 'UTC'), false);
    } finally { restore(); }
  });
});

// ---------------------------------------------------------------------------
// Overnight window (e.g. 23:00–06:00)
// ---------------------------------------------------------------------------

describe('overnight window', () => {
  test('at 01:00 → true (inside overnight window)', () => {
    const restore = pinTime('2024-01-15T01:00:00Z');
    try {
      const rule = makeRule({ schedule_start: '23:00', schedule_end: '06:00' });
      assert.equal(isScheduleActive(rule, 'UTC'), true);
    } finally { restore(); }
  });

  test('at 23:00 → true (at window start)', () => {
    const restore = pinTime('2024-01-15T23:00:00Z');
    try {
      const rule = makeRule({ schedule_start: '23:00', schedule_end: '06:00' });
      assert.equal(isScheduleActive(rule, 'UTC'), true);
    } finally { restore(); }
  });

  test('at 05:59 → true (just before window end)', () => {
    const restore = pinTime('2024-01-15T05:59:00Z');
    try {
      const rule = makeRule({ schedule_start: '23:00', schedule_end: '06:00' });
      assert.equal(isScheduleActive(rule, 'UTC'), true);
    } finally { restore(); }
  });

  test('at 12:00 → false (middle of day, outside overnight window)', () => {
    const restore = pinTime('2024-01-15T12:00:00Z');
    try {
      const rule = makeRule({ schedule_start: '23:00', schedule_end: '06:00' });
      assert.equal(isScheduleActive(rule, 'UTC'), false);
    } finally { restore(); }
  });

  test('at 06:00 → false (at window end, exclusive)', () => {
    const restore = pinTime('2024-01-15T06:00:00Z');
    try {
      const rule = makeRule({ schedule_start: '23:00', schedule_end: '06:00' });
      assert.equal(isScheduleActive(rule, 'UTC'), false);
    } finally { restore(); }
  });
});

// ---------------------------------------------------------------------------
// Day-of-week filter
// ---------------------------------------------------------------------------

describe('day-of-week filter', () => {
  // 2024-01-15 is a Monday (day 1 in JS: 0=Sun, 1=Mon, …, 6=Sat)

  test('allows a rule on an included day', () => {
    const restore = pinTime('2024-01-15T12:00:00Z'); // Monday
    try {
      // Allow Mon–Fri (1,2,3,4,5)
      const rule = makeRule({ schedule_days: '1,2,3,4,5' });
      assert.equal(isScheduleActive(rule, 'UTC'), true);
    } finally { restore(); }
  });

  test('blocks a rule on a disallowed day', () => {
    const restore = pinTime('2024-01-14T12:00:00Z'); // Sunday (day 0)
    try {
      // Only allow Mon–Fri
      const rule = makeRule({ schedule_days: '1,2,3,4,5' });
      assert.equal(isScheduleActive(rule, 'UTC'), false);
    } finally { restore(); }
  });

  test('blocks Saturday when only weekdays are allowed', () => {
    const restore = pinTime('2024-01-20T12:00:00Z'); // Saturday (day 6)
    try {
      const rule = makeRule({ schedule_days: '1,2,3,4,5' });
      assert.equal(isScheduleActive(rule, 'UTC'), false);
    } finally { restore(); }
  });

  test('day-of-week filter AND time window — both must pass', () => {
    // Monday at 08:00 — inside allowed days but outside time window (09:00–17:00)
    const restore = pinTime('2024-01-15T08:00:00Z');
    try {
      const rule = makeRule({
        schedule_start: '09:00',
        schedule_end: '17:00',
        schedule_days: '1,2,3,4,5',
      });
      assert.equal(isScheduleActive(rule, 'UTC'), false);
    } finally { restore(); }
  });

  test('day-of-week filter AND time window — both pass', () => {
    // Monday at 12:00 — inside both allowed days and time window
    const restore = pinTime('2024-01-15T12:00:00Z');
    try {
      const rule = makeRule({
        schedule_start: '09:00',
        schedule_end: '17:00',
        schedule_days: '1,2,3,4,5',
      });
      assert.equal(isScheduleActive(rule, 'UTC'), true);
    } finally { restore(); }
  });
});
