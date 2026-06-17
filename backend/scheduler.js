// StuntCock — Time window evaluator for rule schedules
// Determines whether a rule is currently active based on time/day constraints.

function parseTime(timeStr) {
  // timeStr is "HH:MM" in 24h format
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function currentMinutes(timezone) {
  const now = timezone
    ? new Date(new Date().toLocaleString('en-US', { timeZone: timezone }))
    : new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function currentDayOfWeek(timezone) {
  // 0 = Sunday, 6 = Saturday
  const now = timezone
    ? new Date(new Date().toLocaleString('en-US', { timeZone: timezone }))
    : new Date();
  return now.getDay();
}

/**
 * Returns true if the rule's schedule allows firing right now.
 * If no schedule is defined, always returns true.
 *
 * @param {object} rule - rule row from DB
 * @param {string} timezone - IANA timezone string from settings
 */
function isScheduleActive(rule, timezone) {
  const { schedule_start, schedule_end, schedule_days } = rule;

  if (schedule_days) {
    const allowedDays = schedule_days.split(',').map(Number);
    if (!allowedDays.includes(currentDayOfWeek(timezone))) return false;
  }

  if (!schedule_start && !schedule_end) return true;
  if (!schedule_start || !schedule_end) return true;

  const now = currentMinutes(timezone);
  const start = parseTime(schedule_start);
  const end = parseTime(schedule_end);

  if (start <= end) {
    // Same-day window: 09:00–17:00
    return now >= start && now < end;
  } else {
    // Overnight window: 22:00–07:00
    return now >= start || now < end;
  }
}

module.exports = { isScheduleActive };
