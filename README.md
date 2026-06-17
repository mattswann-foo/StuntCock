# StuntCock

> **Your messages. Handled.**

StuntCock is a local-first Signal auto-responder. It monitors your incoming Signal messages and fires automated replies — either from a rule library (keyword → prescribed text) or from Claude (Anthropic) when no rule matches. Everything runs on your machine. No cloud dependency beyond Signal's own infrastructure and Anthropic's API when LLM fallback is active.

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | ≥ 18 | [nodejs.org](https://nodejs.org) |
| Java | ≥ 17 | Required to run signal-cli. Install from [Adoptium](https://adoptium.net). |
| signal-cli | latest | The Signal CLI daemon. [Download here](https://github.com/AsamK/signal-cli/releases). |

### Installing signal-cli

**macOS (Homebrew):**
```bash
brew install signal-cli
```

**Linux:**
```bash
# Download the latest release tar.gz from GitHub
curl -sLO https://github.com/AsamK/signal-cli/releases/latest/download/signal-cli-*.tar.gz
tar xzf signal-cli-*.tar.gz
sudo cp signal-cli-*/bin/signal-cli /usr/local/bin/
```

**Windows:**
Download the `.zip` from [GitHub releases](https://github.com/AsamK/signal-cli/releases), extract, and add the `bin/` directory to your `PATH`.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in:

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | For LLM | Your Anthropic API key from [console.anthropic.com](https://console.anthropic.com) |
| `SIGNAL_CLI_PATH` | Yes | Full path to the `signal-cli` binary (e.g. `/usr/local/bin/signal-cli`) |
| `PORT` | No | Backend port (default: `3001`) |
| `SIGNAL_CLI_PORT` | No | signal-cli daemon port (default: `8080`) |
| `SIGNAL_PHONE_NUMBER` | After setup | Your registered Signal number in E.164 format (e.g. `+15550001234`) |

---

## First Launch

```bash
# 1. Install all dependencies
npm run install:all

# 2. Run the environment preflight check
npm run preflight

# 3. (Optional) Seed the 5 default rules
npm run seed

# 4. Start StuntCock
npm run dev
```

Open **http://localhost:5173** in your browser.

On first launch, StuntCock walks you through the Signal registration wizard:

1. Enter your phone number (E.164 format)
2. Signal sends a verification SMS
3. Enter the code — StuntCock is now linked
4. Dashboard opens automatically

---

## Default Rules (from `npm run seed`)

| # | Name | Trigger | Response |
|---|---|---|---|
| 1 | Night owl | Any message, 22:00–07:00 | "I'm asleep right now — I'll reply in the morning." |
| 2 | Call me / phone | Contains "call me" or "phone" | "I'll give you a call when I'm free. What's the best time?" |
| 3 | Where are you / ETA | Contains "where are you" or "eta" | "On my way — I'll update you when I'm close." |
| 4 | Urgent / emergency | Starts with "urgent" or "emergency" | LLM (Claude handles it, no schedule restriction) |
| 5 | Business hours catch-all | Any message, 09:00–17:00, weekdays | "Hey, I'm heads-down right now. I'll reply soon." |

Rules execute in priority order. First match wins.

---

## Architecture

```
StuntCock
├── backend/
│   ├── server.js        Express API + WebSocket broadcaster
│   ├── db.js            SQLite (better-sqlite3) — rules, logs, history
│   ├── ruleEngine.js    Rule matching, cooldown, loop protection
│   ├── llmClient.js     Anthropic SDK wrapper (claude-sonnet-4-6)
│   ├── signalClient.js  signal-cli process manager + JSON-RPC poller
│   └── scheduler.js     Time window evaluator for rule schedules
├── frontend/
│   └── src/
│       ├── App.jsx
│       └── components/
│           ├── SetupWizard.jsx   First-launch Signal registration
│           ├── Sidebar.jsx       Wordmark, nav, Signal status, quick stats
│           ├── MessageFeed.jsx   Live feed via WebSocket
│           ├── RulesEditor.jsx   CRUD + drag-to-reorder
│           ├── Settings.jsx      API key, system prompt, LLM toggle
│           └── Analytics.jsx     7-day bar chart
├── scripts/
│   ├── preflight.js     Environment health check
│   └── seed.js          Populates 5 default rules
└── data/
    └── stuntcock.db     SQLite database (auto-created)
```

**Signal integration:** StuntCock spawns `signal-cli` in JSON-RPC daemon mode (`signal-cli daemon --http --http-port 8080`) and polls it every 2 seconds for new `DataMessage` envelopes. Replies are sent back via the same JSON-RPC interface. If signal-cli crashes, StuntCock auto-restarts it up to 3 times and surfaces a red banner in the UI if it fails.

---

## Privacy

StuntCock is local-first. Your message content is:

- **Never stored in any cloud** — the SQLite database lives entirely on your machine at `data/stuntcock.db`.
- **Sent to Anthropic's API only** when LLM fallback fires (i.e. you have an `ANTHROPIC_API_KEY` set, LLM is enabled, and either no rule matches or the matched rule uses the LLM response type). You can disable LLM in Settings at any time.
- **Sent to Signal's infrastructure** normally, as part of the Signal protocol handled by signal-cli.

No telemetry. No analytics. No third-party tracking of any kind.

---

## Loop Protection

StuntCock will never auto-reply to a message sent from your own registered number. Every inbound envelope's source is checked against `SIGNAL_PHONE_NUMBER` before the rule engine runs.

---

## License

MIT
