// StuntCock — Rule input validation module
// Validates rule objects before they are persisted to the database.

const VALID_TRIGGER_TYPES = ['any', 'exact', 'contains', 'starts_with', 'regex'];
const VALID_RESPONSE_TYPES = ['static', 'llm', 'template'];
const HH_MM_REGEX = /^\d{2}:\d{2}$/;

/**
 * Validates a rule data object for required enum fields and optional format constraints.
 * @param {Object} data - The rule data to validate (may be a full or partial rule object).
 * @returns {{ valid: boolean, errors: string[] }} Validation result with any error messages.
 */
function validateRule(data) {
  const errors = [];

  // Validate trigger_type if provided
  if (data.trigger_type !== undefined && data.trigger_type !== null) {
    if (!VALID_TRIGGER_TYPES.includes(data.trigger_type)) {
      errors.push('trigger_type must be one of: any, exact, contains, starts_with, regex');
    }
  }

  // Validate response_type if provided
  if (data.response_type !== undefined && data.response_type !== null) {
    if (!VALID_RESPONSE_TYPES.includes(data.response_type)) {
      errors.push('response_type must be one of: static, llm, template');
    }
  }

  // Validate schedule_start format if provided and non-null
  if (data.schedule_start !== undefined && data.schedule_start !== null) {
    if (!HH_MM_REGEX.test(data.schedule_start)) {
      errors.push('schedule_start must be HH:MM format');
    }
  }

  // Validate schedule_end format if provided and non-null
  if (data.schedule_end !== undefined && data.schedule_end !== null) {
    if (!HH_MM_REGEX.test(data.schedule_end)) {
      errors.push('schedule_end must be HH:MM format');
    }
  }

  // Validate cooldown_minutes if provided: must be a non-negative integer
  if (data.cooldown_minutes !== undefined && data.cooldown_minutes !== null) {
    const val = data.cooldown_minutes;
    const isNonNegativeInteger =
      Number.isInteger(val) && val >= 0;
    if (!isNonNegativeInteger) {
      errors.push('cooldown_minutes must be a non-negative integer');
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validateRule };
