You are updating the **Coding Agent** context for agent-env.

**What agent-env does:** Persistent specialized agent environment for solo founders — built on Claude Code with automatic context management, task routing, and reliability primitives from day one.
**Stack:** TypeScript, Node.js 24, tsx, node:sqlite, @clack/prompts, Context-RAII (SQLite session lifecycle)

Your job: analyze the codebase in the current directory and fill in every
`[POPULATED BY SYNC]` section inside `.agent-env/agents/coding/CLAUDE.md`.
Do real work — read actual files, don't summarize from memory.

---

## Step 1 — Map the file structure

Run Glob with pattern `**/*` to get all files. Exclude:
`node_modules/**`, `.git/**`, `dist/**`, `build/**`, `.agent-env/**`

Note the top-level directories and what each one likely contains.

## Step 2 — Read the entry points

Read `package.json`. Note:
- `main`, `bin`, `exports` fields (entry points)
- `scripts` (how to build, test, run)
- Key `dependencies` and `devDependencies`

Read the primary entry point file(s) in full.
If `tsconfig.json` exists, read it — note `strict`, `module`, `target`, `paths`.

## Step 3 — Find the architectural core

Use Grep to search for `from '` across all source files. The internal
modules imported most frequently are the architectural core — read them.

Aim to read at least 5 source files from different parts of the codebase.

## Step 4 — Find the tests

Glob for `**/*.test.*`, `**/*.spec.*`, `**/__tests__/**`.
Read 1-2 test files. Note: framework (jest/vitest/node:test), file naming
convention, what gets mocked vs tested directly, assertion style.

## Step 5 — Write the findings

Open `.agent-env/agents/coding/CLAUDE.md` and replace each
`[POPULATED BY SYNC]` marker with real content:

**Architecture Overview** — 3-5 short paragraphs. What are the main layers?
How does a request/task flow through the system? What are the boundaries
between modules? Name specific files and directories.

**Code Conventions** — Bulleted list, specific not generic. Examples:
- "ESM imports, .js extensions on all local imports"
- "Errors thrown, not returned as values"
- "No default exports — named exports only"
- "Zod for all external input validation"

**Testing Approach** — Framework, file naming pattern, what's unit-tested
vs integration-tested, any mocking patterns used.

**Key Files & Entry Points** — Markdown table: `| path | purpose |`
List the 6-10 files a new developer needs to understand first.

## Step 6 — Append to Session Log

Add this line to the Session Log at the bottom of the coding agent file:
`2026-03-15: /sync completed — architecture, conventions, testing, key files populated.`

$ARGUMENTS
