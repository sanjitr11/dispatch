# agent-env

Persistent specialized agent environments for solo founders and early-stage startup teams using Claude Code. Eliminates the blank-slate problem — agents never start without context.

## The Problem

Solo founders waste hours manually writing `CLAUDE.md` files, configuring subagents, and re-explaining startup context every session. Claude Code agents are powerful but stateless by default.

## What It Does

`agent-env` gives you:

- **One-time onboarding** — answer 7 questions about your startup, get a complete agent environment generated automatically
- **Specialized agents** — coding, research, marketing, and ops agents with role-specific context
- **Persistent state** — SQLite-backed session tracking so agents remember what they've done
- **Smart task routing** — natural language routing to the right agent via weighted keyword scoring
- **Desktop app** — Electron UI with embedded terminals for managing multiple agent sessions
- **Config regeneration** — `sync` any time your stack or priorities change

## Architecture

```
agent-env/
├── packages/
│   ├── shared/        # Core library: config generation, SQLite state, routing
│   ├── cli/           # agent-env CLI (init, sync, route)
│   └── app/           # Electron desktop app (React + xterm.js + Supabase)
├── supabase/          # Database migrations
└── .agent-env/        # Generated agent contexts and state (per project)
```

Monorepo with `@agent-env/shared` as the core library consumed by both CLI and Electron app.

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript (strict, ESM) |
| Runtime | Node.js 22.5+ |
| State | SQLite (node:sqlite, WAL mode) |
| Desktop | Electron 33 + Vite + React 18 |
| Terminal | xterm.js + node-pty |
| Cloud sync | Supabase (auth + RLS) |
| UI | TailwindCSS + React Router |
| Validation | Zod |
| CLI prompts | @clack/prompts |

## Getting Started

**Prerequisites:** Node.js 22.5.0+

```bash
git clone https://github.com/your-username/agent-env
cd agent-env
npm install
```

### CLI

```bash
# Interactive onboarding — run once per project
npx agent-env init

# Regenerate all agent configs from saved context
npx agent-env sync

# Route a task to the right agent
npx agent-env route "refactor the auth module"
# → coding agent (confidence: 0.91)
```

### Desktop App

```bash
npm run dev:app     # Development (hot reload)
npm run build       # Production build
npm run package:mac # macOS DMG (x64 + arm64)
```

## How It Works

### Onboarding (`agent-env init`)

Asks 7 questions to capture startup context:

1. Startup name
2. One-sentence pitch
3. Stage (idea / mvp / early / revenue / scaling)
4. Tech stack
5. Ideal customer (ICP)
6. Top 1–3 priorities
7. Biggest bottleneck *(optional)*

Generates from your answers:
- Root `CLAUDE.md` with full startup context
- `.claude/settings.json` with runtime config and hooks
- 4 agent-specific `CLAUDE.md` files (coding, research, marketing, ops)
- 8 slash command definitions (`/coding`, `/research`, `/route`, `/sync`, ...)

### Task Routing

Weighted keyword scoring across four agent domains:

```
agent-env route "should we use Postgres or DynamoDB?"
→ research agent (confidence: 0.88)
  reason: matched keywords: should we, compare, tradeoff
```

Scores normalize to `[0, 1]`; tasks below `0.2` confidence fall through to the `ops` agent. Override with `@agent` prefix.

### Slash Commands

| Command | Description |
|---|---|
| `/coding <task>` | Load coding agent context |
| `/research <task>` | Load research agent — investigates, compares, recommends |
| `/marketing <task>` | Load marketing agent |
| `/ops <task>` | Load ops agent (catch-all) |
| `/route <task>` | Auto-route to the right agent |
| `/sync` | Repopulate coding agent context from codebase |
| `/sync-research` | Repopulate research agent via web search |

### State

Agent sessions tracked in SQLite at `.agent-env/state.db`:

```
startup_context  — your startup config (one row)
agent_sessions   — per-agent session history (UUID, status, task)
events           — optional event log per session
```

Electron app syncs projects and agents to Supabase for multi-device access.

## Generated Files

`agent-env` owns these files — do not edit manually:

- `CLAUDE.md` (root)
- `.claude/settings.json`
- `.claude/commands/*.md`
- `.agent-env/agents/{type}/CLAUDE.md`

Personal overrides go in `CLAUDE.local.md` (preserved across syncs).

## Scripts

```bash
npm run dev:cli      # CLI in watch mode
npm run dev:app      # Electron app in watch mode
npm run build        # Build shared + CLI (production)
npm run package:mac  # macOS DMG
npm run package:win  # Windows installer
npm run package:linux # Linux AppImage
```

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for the full backlog. Near-term:

- [ ] Fix multi-agent PTY routing (projectId-keyed IPC)
- [ ] Edit project context post-init
- [ ] Sync button in agent UI
- [ ] macOS DMG release

## Design

See [DESIGN.md](./DESIGN.md) for architecture decisions: onboarding question selection, CLAUDE.md template design, routing algorithm, and key invariants.

## License

MIT
