# agent-env Roadmap

_Last updated: 2026-03-20_

## Completed

- ~~**Fix multi-agent input bug**~~ — pty keyed by `agent.id`; input, output, resize, kill all route correctly.
- ~~**Edit project**~~ — `EditProjectPage` complete, routed at `/projects/:id/edit`, linked from workspace sidebar.
- ~~**"Sync" button in the agent UI**~~ — button in workspace panel header for coding agents.
- ~~**Package the DMG**~~ — `dist/agent-env-0.1.0.dmg` (x64) and `dist/agent-env-0.1.0-arm64.dmg` built. No code signing; recipients must right-click → Open.

---

## Next up

- ~~**Session log viewer**~~ — rendered in `AgentDetailPage` (parsed from CLAUDE.md `## Session Log` section).
- ~~**Agent memory viewer**~~ — collapsible CLAUDE.md viewer on `AgentDetailPage`.
- ~~**Fix `terminal:output` fan-out**~~ — preload already filters by `projectId`; main sends only to `win.webContents` (single window).

- ~~**`agent-env update` CLI command**~~ — interactive multiselect or `agent-env update <field>` for direct field targeting; auto-syncs after save.

8. **In-app onboarding** — new users land on an empty projects list with no guidance.
   Add a welcome state that walks them through creating their first project.

- ~~**`/route` entry point in the app**~~ — "Route a task…" input in workspace sidebar; keyword-scores the task and selects the right agent with a reason shown for 4 seconds.

---

## Lower priority / later

- ~~**Pre-tool-use hook for user projects**~~ — `pre-tool-use.mjs` written on session boot; blocks `rm -rf /`, `curl|bash`, `wget|bash`, fork bombs, and `dd` to raw devices.
- ~~**Auto-sync on app launch**~~ — already handled: every terminal boot calls `writeClaudeMd` from live Supabase state, so context is never stale.
- ~~**Multi-window support**~~ — split view in workspace: hover any non-active agent in the sidebar to reveal ⊞, click to open side by side. Split header shows both agents' status with ✕ to close.
- **Packaging: notarization + auto-update (Squirrel)** — requires Apple Developer certificate. Stub is in place (`scripts/notarize.cjs`). Deferred until production release.

---

## MCP External Tool Integrations

~~**V1 shipped (API-key-based):**~~
- Coding → GitHub (`@modelcontextprotocol/server-github`)
- Research → Brave Search (`@modelcontextprotocol/server-brave-search`), Exa (`exa-mcp-server`)
- Ops → Linear (`linear-mcp-server`), Slack (`@modelcontextprotocol/server-slack`), Notion (`@notionhq/notion-mcp-server`)

**Requires one-time Supabase migration** — run in SQL editor:
```sql
CREATE TABLE agent_integrations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id uuid NOT NULL,
  user_id uuid NOT NULL,
  type text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(agent_id, type)
);
ALTER TABLE agent_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own integrations"
  ON agent_integrations FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

**V2 — Marketing agent integrations (next up):**
- **Reddit** — Composio MCP, free API. Post to subreddits, monitor mentions, community engagement.
- **Resend** — API key MCP. Send outreach/transactional emails directly from the agent.
- **Stripe** — official Anthropic MCP. Pull MRR, churn, customer data for marketing decisions.
- **Fetch** — official Anthropic MCP, zero auth. Pull any webpage for competitor/web research.

**V3 — OAuth-based (deferred):**
- Twitter/X — $100/month API minimum, not worth it for solo founders
- LinkedIn — API too restrictive, post-only, limited value
