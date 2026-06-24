// StuntCock — Rule matching engine
// Evaluates inbound Signal messages against the user-defined rule library.
// First match wins. Includes cooldown enforcement and loop protection.

const { getRules, getCooldownLastFired, setCooldownLastFired, getSetting } = require('./db');
const { isScheduleActive } = require('./scheduler');
const vm = require('vm');

// Maximum milliseconds allowed for a regex match (ReDoS guard)
const REGEX_TIMEOUT_MS = 150;

/**
 * Returns true if the message sender is the registered StuntCock number.
 * Used to prevent auto-reply loops.
 */
function isSelfMessage(sender) {
  const registered = getSetting('phone_number');
  if (!registered) return false;
  return sender === registered;
}

/**
 * Evaluates whether the rule's trigger matches the message body.
 */
function matchesTrigger(rule, messageBody) {
  const body = messageBody ?? '';
  const value = rule.trigger_value ?? '';

  switch (rule.trigger_type) {
    case 'any':
      return true;
    case 'exact':
      return body.trim().toLowerCase() === value.trim().toLowerCase();
    case 'contains': {
      const terms = value.split('|').map(t => t.trim().toLowerCase());
      const lc = body.toLowerCase();
      return terms.some(t => lc.includes(t));
    }
    case 'starts_with': {
      const terms = value.split('|').map(t => t.trim().toLowerCase());
      const lc = body.toLowerCase();
      return terms.some(t => lc.startsWith(t));
    }
    case 'regex': {
      try {
        // ReDoS guard: run the regex inside a vm context with a hard timeout.
        // If the pattern causes catastrophic backtracking, vm throws and we
        // return false rather than hanging the event loop.
        const re = new RegExp(value, 'i');
        const sandbox = vm.createContext({ re, body, result: false });
        new vm.Script('result = re.test(body);').runInContext(sandbox, { timeout: REGEX_TIMEOUT_MS });
        return sandbox.result;
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}

/**
 * Evaluates the sender filter on the rule.
 * sender_filter is one of: 'all', a phone number, a group ID prefixed 'group:', or 'unknown'
 */
function matchesPlatform(rule, platform) {
  const filter = rule.platform_filter ?? 'any';
  if (filter === 'any') return true;
  return filter === (platform ?? 'signal');
}

function normalizePhone(s) {
  // Strip everything except digits, then strip leading country-code prefix variants
  return (s || '').replace(/\D/g, '');
}

function matchesSender(rule, sender, groupId) {
  const filter = rule.sender_filter ?? 'all';
  if (!filter || filter === 'all') return true;
  if (filter === 'unknown') return true;
  if (filter.startsWith('group:')) {
    return !!(groupId && groupId === filter.slice(6));
  }
  // Exact match first (handles full JIDs and +E.164 numbers)
  if (sender === filter) return true;
  // Phone number fuzzy match: strip non-digits and compare tails
  // Handles +12065551234 vs 12065551234 vs 2065551234 etc.
  const senderDigits = normalizePhone(sender);
  const filterDigits = normalizePhone(filter);
  if (filterDigits.length >= 7 && senderDigits.length >= 7) {
    // Compare by longest common suffix (last 10 digits)
    const tail = Math.min(10, filterDigits.length, senderDigits.length);
    return senderDigits.slice(-tail) === filterDigits.slice(-tail);
  }
  return false;
}

/**
 * Checks if a cooldown is blocking this rule from firing for this sender.
 */
function isCooledDown(rule, sender) {
  if (!rule.cooldown_minutes || rule.cooldown_minutes <= 0) return false;
  const lastFired = getCooldownLastFired(rule.id, sender);
  if (!lastFired) return false;
  const elapsedMinutes = (Date.now() - lastFired.getTime()) / 60000;
  return elapsedMinutes < rule.cooldown_minutes;
}

/**
 * Renders a template response, substituting {sender_name}, {time}, {date}.
 */
function renderTemplate(text, context) {
  const now = new Date();
  return text
    .replace(/{sender_name}/g, context.senderName || context.sender || 'there')
    .replace(/{time}/g, now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }))
    .replace(/{date}/g, now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }));
}

/**
 * Main entry point. Returns the matched rule and rendered response, or null if no match.
 *
 * @param {object} message - { sender, groupId, body, senderName }
 * @returns {{ rule, response } | null}
 */
function matchMessage(message) {
  const { sender, groupId, body, platform } = message;

  if (isSelfMessage(sender)) return null;

  const timezone = getSetting('timezone', 'America/New_York');
  const rules = getRules().filter(r => r.active);

  for (const rule of rules) {
    if (!matchesPlatform(rule, platform)) continue;
    if (!matchesTrigger(rule, body)) continue;
    if (!matchesSender(rule, sender, groupId)) continue;
    if (!isScheduleActive(rule, timezone)) continue;
    if (isCooledDown(rule, sender)) continue;

    // Mark cooldown
    if (rule.cooldown_minutes > 0) {
      setCooldownLastFired(rule.id, sender);
    }

    let response = null;
    if (rule.response_type === 'static') {
      response = rule.response_text;
    } else if (rule.response_type === 'template') {
      response = renderTemplate(rule.response_text, message);
    } else if (rule.response_type === 'llm') {
      response = null; // signal to caller to invoke LLM
    }

    return { rule, response };
  }

  return null;
}

module.exports = { matchMessage, isSelfMessage, matchesTrigger };
