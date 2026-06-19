// Tests for backend/validators.js — validateRule function

const { validateRule } = require('../validators');

describe('validateRule', () => {
  // --- trigger_type ---
  describe('trigger_type', () => {
    test('accepts valid trigger_type values', () => {
      for (const val of ['any', 'exact', 'contains', 'starts_with', 'regex']) {
        const result = validateRule({ trigger_type: val });
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      }
    });

    test('rejects invalid trigger_type with correct message', () => {
      const result = validateRule({ trigger_type: 'always' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'trigger_type must be one of: any, exact, contains, starts_with, regex'
      );
    });

    test('allows missing trigger_type (partial update)', () => {
      const result = validateRule({ name: 'My Rule' });
      expect(result.valid).toBe(true);
    });

    test('allows null trigger_type', () => {
      const result = validateRule({ trigger_type: null });
      expect(result.valid).toBe(true);
    });
  });

  // --- response_type ---
  describe('response_type', () => {
    test('accepts valid response_type values', () => {
      for (const val of ['static', 'llm', 'template']) {
        const result = validateRule({ response_type: val });
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      }
    });

    test('rejects invalid response_type with correct message', () => {
      const result = validateRule({ response_type: 'dynamic' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'response_type must be one of: static, llm, template'
      );
    });

    test('allows missing response_type (partial update)', () => {
      const result = validateRule({ name: 'My Rule' });
      expect(result.valid).toBe(true);
    });
  });

  // --- schedule_start ---
  describe('schedule_start', () => {
    test('accepts valid HH:MM format', () => {
      const result = validateRule({ schedule_start: '09:00' });
      expect(result.valid).toBe(true);
    });

    test('accepts valid HH:MM midnight', () => {
      const result = validateRule({ schedule_start: '00:00' });
      expect(result.valid).toBe(true);
    });

    test('rejects "9:00" (missing leading zero)', () => {
      const result = validateRule({ schedule_start: '9:00' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('schedule_start must be HH:MM format');
    });

    test('rejects invalid format "9:00am"', () => {
      const result = validateRule({ schedule_start: '9:00am' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('schedule_start must be HH:MM format');
    });

    test('allows null schedule_start', () => {
      const result = validateRule({ schedule_start: null });
      expect(result.valid).toBe(true);
    });

    test('allows missing schedule_start', () => {
      const result = validateRule({ name: 'My Rule' });
      expect(result.valid).toBe(true);
    });
  });

  // --- schedule_end ---
  describe('schedule_end', () => {
    test('accepts valid HH:MM format', () => {
      const result = validateRule({ schedule_end: '22:30' });
      expect(result.valid).toBe(true);
    });

    test('rejects "9:00" (missing leading zero)', () => {
      const result = validateRule({ schedule_end: '9:00' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('schedule_end must be HH:MM format');
    });

    test('allows null schedule_end', () => {
      const result = validateRule({ schedule_end: null });
      expect(result.valid).toBe(true);
    });
  });

  // --- cooldown_minutes ---
  describe('cooldown_minutes', () => {
    test('accepts zero', () => {
      const result = validateRule({ cooldown_minutes: 0 });
      expect(result.valid).toBe(true);
    });

    test('accepts positive integer', () => {
      const result = validateRule({ cooldown_minutes: 60 });
      expect(result.valid).toBe(true);
    });

    test('rejects negative integer', () => {
      const result = validateRule({ cooldown_minutes: -1 });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('cooldown_minutes must be a non-negative integer');
    });

    test('rejects float', () => {
      const result = validateRule({ cooldown_minutes: 1.5 });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('cooldown_minutes must be a non-negative integer');
    });

    test('rejects string', () => {
      const result = validateRule({ cooldown_minutes: '5' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('cooldown_minutes must be a non-negative integer');
    });

    test('allows null cooldown_minutes', () => {
      const result = validateRule({ cooldown_minutes: null });
      expect(result.valid).toBe(true);
    });

    test('allows missing cooldown_minutes', () => {
      const result = validateRule({ name: 'My Rule' });
      expect(result.valid).toBe(true);
    });
  });

  // --- multiple errors ---
  describe('multiple simultaneous errors', () => {
    test('collects all errors in one pass', () => {
      const result = validateRule({
        trigger_type: 'bad',
        response_type: 'bad',
        schedule_start: '9:00',
        schedule_end: 'noon',
        cooldown_minutes: -5,
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(5);
    });
  });

  // --- fully valid rule ---
  describe('valid rule object', () => {
    test('passes for a complete valid rule', () => {
      const result = validateRule({
        name: 'Test Rule',
        trigger_type: 'contains',
        trigger_value: 'hello',
        response_type: 'static',
        response_text: 'Hi there!',
        schedule_start: '09:00',
        schedule_end: '17:00',
        cooldown_minutes: 5,
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('passes for a partial update with only name', () => {
      const result = validateRule({ name: 'Updated name' });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
