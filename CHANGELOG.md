# Changelog

All notable changes to this project will be documented here.

## [0.1.0] - 2026-06-21

0.1.0 — 6 changes

### Added
- Make API key field read-only in Settings UI with configured/not-configured display

### Fixed
- Extract getEffectiveCooldown() helper in ruleEngine.js
- Fix cooldown-recording guard in matchMessage() to use effective cooldown
- Update isCooledDown() to use getEffectiveCooldown()
- Block anthropic_api_key from being persisted to SQLite
- Strip anthropic_api_key from GET /api/settings response
