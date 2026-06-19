// StuntCock — Input validators for rule creation and updates
// Validates rule objects before they are persisted to the database.

const VALID_TRIGGER_TYPES = ['any', 'exact', 'contains', 'starts_with', 'regex'];
const VALID_RESPONSE_TYPES = ['static', 'llm', 'template'];
const SCHEDULE_TIME_RE = /^\d{2}:\d{2}$/; // HH:MM — must be zero-padded

/**
 * Validates a full rule object (for POST /api/rules).
 *
 * @param {object} rule - the rule payload from the request body
 * @returns {{ valid: boolean, error?: string }}
 */
function validateRule(rule) {
  if (!rule || typeof rule !== 'object') {
    return { valid: false, error: 'Rule must be an object' };
  }

  if (!rule.name || typeof rule.name !== 'string' || rule.name.trim() === '') {
    return { valid: false, error: 'name is required' };
  }

  if (!VALID_TRIGGER_TYPES.includes(rule.trigger_type)) {
    return {
      valid: false,
      error: `trigger_type must be one of: ${VALID_TRIGGER_TYPES.join(', ')}`,
    };
  }

  if (!VALID_RESPONSE_TYPES.includes(rule.response_type)) {
    return {
      valid: false,
      error: `response_type must be one of: ${VALID_RESPONSE_TYPES.join(', ')}`,
    };
  }

  if (rule.schedule_start != null) {
    if (!SCHEDULE_TIME_RE.test(rule.schedule_start)) {
      return { valid: false, error: 'schedule_start must be in HH:MM format (zero-padded)' };
    }
  }

  if (rule.schedule_end != null) {
    if (!SCHEDULE_TIME_RE.test(rule.schedule_end)) {
      return { valid: false, error: 'schedule_end must be in HH:MM format (zero-padded)' };
    }
  }

  if (rule.cooldown_minutes != null) {
    const cm = Number(rule.cooldown_minutes);
    if (!Number.isInteger(cm) || cm < 0) {
      return { valid: false, error: 'cooldown_minutes must be a non-negative integer' };
    }
  }

  return { valid: true };
}

/**
 * Validates a partial rule update object (for PUT /api/rules/:id).
 * Only fields present in the update are validated.
 *
 * @param {object} updates - the partial update payload
 * @returns {{ valid: boolean, error?: string }}
 */
function validateRuleUpdate(updates) {
  if (!updates || typeof updates !== 'object') {
    return { valid: false, error: 'Update must be an object' };
  }

  if ('name' in updates) {
    if (typeof updates.name !== 'string' || updates.name.trim() === '') {
      return { valid: false, error: 'name must be a non-empty string' };
    }
  }

  if ('trigger_type' in updates) {
    if (!VALID_TRIGGER_TYPES.includes(updates.trigger_type)) {
      return {
        valid: false,
        error: `trigger_type must be one of: ${VALID_TRIGGER_TYPES.join(', ')}`,
      };
    }
  }

  if ('response_type' in updates) {
    if (!VALID_RESPONSE_TYPES.includes(updates.response_type)) {
      return {
        valid: false,
        error: `response_type must be one of: ${VALID_RESPONSE_TYPES.join(', ')}`,
      };
    }
  }

  if ('schedule_start' in updates && updates.schedule_start != null) {
    if (!SCHEDULE_TIME_RE.test(updates.schedule_start)) {
      return { valid: false, error: 'schedule_start must be in HH:MM format (zero-padded)' };
    }
  }

  if ('schedule_end' in updates && updates.schedule_end != null) {
    if (!SCHEDULE_TIME_RE.test(updates.schedule_end)) {
      return { valid: false, error: 'schedule_end must be in HH:MM format (zero-padded)' };
    }
  }

  if ('cooldown_minutes' in updates && updates.cooldown_minutes != null) {
    const cm = Number(updates.cooldown_minutes);
    if (!Number.isInteger(cm) || cm < 0) {
      return { valid: false, error: 'cooldown_minutes must be a non-negative integer' };
    }
  }

  return { valid: true };
}

module.exports = { validateRule, validateRuleUpdate };
