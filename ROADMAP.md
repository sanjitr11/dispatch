# agent-env Roadmap

_Last updated: 2026-03-18_

## Next up (ship these before distributing)

1. **Fix multi-agent input bug** — `terminal:input` always routes keystrokes to the last
   pty in the map, not the focused one. Two agents open simultaneously = second agent
   can't type. Fix: pass `projectId` alongside input data so the main process routes
   to the correct pty.

2. **Edit project** — no way to update startup context (stage, priorities, stack) after
   init. Users will hit this immediately when their context shifts. Add an edit form
   on the project detail page.

3. **"Sync" button in the agent UI** — `/sync` currently requires the user to manually
   run the slash command. Surface it as a button on the agent detail page so context
   refresh is one click.

4. **Package the DMG** — the app isn't packaged for distribution yet. Run electron-builder
   for both x64 and arm64 targets. Required before handing it to anyone.

---

## Medium priority (next sprint)

5. **Session log viewer** — the Session Log in CLAUDE.md accumulates per agent, but
   there's no UI to read it. Show it in the agent detail page so founders can see
   what their agents did across sessions.

6. **`agent-env update` CLI command** — update individual startup context fields
   (e.g. priorities, stage) without running full re-init. Useful mid-sprint.

7. **Agent memory viewer** — display the full CLAUDE.md content in the app, especially
   the Session Log section. Founders shouldn't need to open files manually.

8. **In-app onboarding** — new users land on an empty projects list with no guidance.
   Add a welcome state that walks them through creating their first project.

9. **Fix `terminal:output` fan-out** — output events broadcast to all windows; if two
   agents are open in separate pages they'll see each other's output. Route output
   by projectId.

10. **`/route` entry point in the app** — a task input box on the project detail page
    that routes to the right agent automatically, without the user picking manually.

---

## Lower priority / later

- Pre-tool-use hook generated for user projects (not just agent-env itself)
- `agent-env sync` triggered automatically on app launch if context is stale
- Multi-window support (open two agents side by side)
- Packaging: notarization + auto-update (Squirrel)

---

## Future: MCP External Tool Integrations

Let agents connect to external platforms via MCP servers. On session boot,
inject active integrations into the agent's `.claude/settings.json` so Claude
Code sees them as native tools — no copy-paste, agents can actually post/create/query.

**Default integrations by agent type:**
- Marketing → Reddit, Twitter/X, LinkedIn
- Coding → GitHub
- Research → Brave Search, Exa
- Ops → Linear, Notion, Slack

**Implementation sketch:**
- `agent_integrations` table in Supabase (agent_id, type, config JSON)
- "Connect tools" UI on each agent in the workspace sidebar
- OAuth2 flows handled in Electron via `protocol.handle`
- `writeClaudeMd` extended to merge active MCP server configs into `settings.json`
