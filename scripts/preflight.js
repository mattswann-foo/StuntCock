#!/usr/bin/env node
// StuntCock — Preflight environment checker
// Run with: npm run preflight
// Verifies Java 17+, signal-cli binary, and required env vars before startup.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { execSync } = require('child_process');
const fs = require('fs');

let passed = true;

function ok(msg) { console.log(`  ✅  ${msg}`); }
function fail(msg) { console.log(`  ❌  ${msg}`); passed = false; }
function warn(msg) { console.log(`  ⚠️   ${msg}`); }

console.log('\n🐓 StuntCock — Preflight Check\n');

// --- Java 17+ ---
console.log('Checking Java...');
try {
  const out = execSync('java -version 2>&1').toString();
  const match = out.match(/version "(\d+)/);
  if (match) {
    const major = parseInt(match[1], 10);
    if (major >= 17) {
      ok(`Java ${major} found`);
    } else {
      fail(`Java ${major} found, but Java 17+ is required. Install from https://adoptium.net`);
    }
  } else {
    warn('Could not parse Java version from: ' + out.trim());
  }
} catch {
  fail('Java not found. Install Java 17+ from https://adoptium.net');
}

// --- signal-cli binary ---
console.log('\nChecking signal-cli...');
const signalCliPath = process.env.SIGNAL_CLI_PATH || 'signal-cli';
try {
  if (signalCliPath !== 'signal-cli' && !fs.existsSync(signalCliPath)) {
    fail(`SIGNAL_CLI_PATH points to ${signalCliPath} but file does not exist`);
  } else {
    const out = execSync(`"${signalCliPath}" --version 2>&1`).toString();
    ok(`signal-cli found: ${out.trim()}`);
  }
} catch {
  fail(
    `signal-cli not found at path: ${signalCliPath}\n` +
    `     Download from: https://github.com/AsamK/signal-cli/releases\n` +
    `     Then set SIGNAL_CLI_PATH in your .env file`
  );
}

// --- Environment variables ---
console.log('\nChecking environment variables...');

if (process.env.ANTHROPIC_API_KEY) {
  ok('ANTHROPIC_API_KEY is set');
} else {
  warn('ANTHROPIC_API_KEY is not set — LLM fallback will be unavailable');
}

if (process.env.SIGNAL_CLI_PATH) {
  ok(`SIGNAL_CLI_PATH = ${process.env.SIGNAL_CLI_PATH}`);
} else {
  warn('SIGNAL_CLI_PATH not set — will try "signal-cli" from PATH');
}

if (process.env.SIGNAL_PHONE_NUMBER) {
  ok(`SIGNAL_PHONE_NUMBER = ${process.env.SIGNAL_PHONE_NUMBER}`);
} else {
  warn('SIGNAL_PHONE_NUMBER not set — complete the setup wizard on first launch');
}

// --- Node version ---
console.log('\nChecking Node.js...');
const nodeVersion = parseInt(process.versions.node.split('.')[0], 10);
if (nodeVersion >= 18) {
  ok(`Node.js ${process.versions.node}`);
} else {
  fail(`Node.js ${process.versions.node} found, but v18+ is required`);
}

// --- Summary ---
console.log('\n' + '─'.repeat(40));
if (passed) {
  console.log('🐓 All checks passed. StuntCock is ready to launch.\n');
  process.exit(0);
} else {
  console.log('🐓 Some checks failed. Fix the issues above before starting StuntCock.\n');
  process.exit(1);
}
