#!/usr/bin/env node
// StuntCock — Seed script for default rules
// Run with: npm run seed
// Populates the 5 out-of-the-box StuntCock auto-responder rules.

const path = require('path');
// Ensure DB is initialized before seeding
const { getRules, createRule, db } = require(path.join(__dirname, '..', 'backend', 'db'));

console.log('\n🐓 StuntCock — Seeding default rules\n');

const existing = getRules();
if (existing.length > 0) {
  console.log(`Found ${existing.length} existing rule(s). Skipping seed to avoid duplicates.`);
  console.log('To re-seed, delete the database at data/stuntcock.db and run again.\n');
  process.exit(0);
}

const defaultRules = [
  {
    name: 'Night owl — sleeping hours',
    active: 1,
    priority: 0,
    trigger_type: 'any',
    trigger_value: null,
    sender_filter: 'all',
    response_type: 'static',
    response_text: "I'm asleep right now — I'll reply in the morning.",
    schedule_start: '22:00',
    schedule_end: '07:00',
    cooldown_minutes: 60,
  },
  {
    name: 'Call me / phone',
    active: 1,
    priority: 1,
    trigger_type: 'contains',
    trigger_value: 'call me|phone',
    sender_filter: 'all',
    response_type: 'static',
    response_text: "I'll give you a call when I'm free. What's the best time?",
    schedule_start: null,
    schedule_end: null,
    cooldown_minutes: 30,
  },
  {
    name: 'Where are you / ETA',
    active: 1,
    priority: 2,
    trigger_type: 'contains',
    trigger_value: 'where are you|eta',
    sender_filter: 'all',
    response_type: 'static',
    response_text: "On my way — I'll update you when I'm close.",
    schedule_start: null,
    schedule_end: null,
    cooldown_minutes: 15,
  },
  {
    name: 'Urgent / emergency — LLM escalation',
    active: 1,
    priority: 3,
    trigger_type: 'starts_with',
    trigger_value: 'urgent|emergency',
    sender_filter: 'all',
    response_type: 'llm',
    response_text: null,
    schedule_start: null,
    schedule_end: null,
    cooldown_minutes: 0,
  },
  {
    name: 'Business hours catch-all',
    active: 1,
    priority: 99,
    trigger_type: 'any',
    trigger_value: null,
    sender_filter: 'all',
    response_type: 'static',
    response_text: "Hey, I'm heads-down right now. I'll reply soon.",
    schedule_start: '09:00',
    schedule_end: '17:00',
    schedule_days: '1,2,3,4,5', // Mon–Fri
    cooldown_minutes: 120,
  },
];

for (const rule of defaultRules) {
  const created = createRule(rule);
  console.log(`  ✅  Created rule: "${created.name}" (id=${created.id})`);
}

console.log('\n🐓 Seed complete. 5 default rules added.\n');
process.exit(0);
