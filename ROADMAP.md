# agent-env Roadmap

_Last updated: 2026-03-21_

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

---

## Inter-Agent Communication

**Status: Planned — post first-user feedback**
**Dependency: validate demand with 10+ real users before building**

Right now the founder is the communication bus between agents. When the coding agent
discovers a constraint that changes the marketing message, the founder manually copies
that context over. When the research agent finishes a competitor analysis, the ops agent
doesn't know about it. Every cross-agent handoff is a manual step.

Claude Code shipped native inter-agent messaging in February 2026 as **Agent Teams**
(v2.1.32+, behind `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`). The mechanism is plain
JSON files on local disk — each agent gets an inbox at
`~/.claude/teams/{team}/inboxes/{name}.json`. Agents send messages via `TeammateTool`
(`write` for direct, `broadcast` for all teammates); received messages arrive
automatically as new conversation turns — no polling. A shared task queue at
`~/.claude/tasks/{team}/` handles work coordination with file-locking to prevent
double-claiming.

For agent-env specifically, this changes the product from "four parallel isolated
sessions the founder manually connects" to "a functioning team the founder assigns work
to." The founder describes a goal once; the router assigns the lead agent; that agent
delegates and coordinates the others; the founder reviews a result. The "Route a task…"
input already exists — this is the layer that makes routing actually dispatch work
rather than just suggest it.

**What a founder would see:**
- A task enters via "Route a task…" and the app selects a lead agent
- The lead agent's terminal shows it delegating sub-tasks to other agents
- A shared activity feed (or the existing split view) shows all agents' status in real time
- Agents surface blockers and questions to the founder without requiring full attention

**Implementation approach:**
Build on top of Claude Code's Agent Teams — don't reinvent the transport. The key
work is in agent-env: routing logic that creates a team instead of just switching the
active terminal, a UI that surfaces cross-agent activity, and guardrails that keep
the founder in control of high-stakes decisions (anything touching production,
outbound communication, or irreversible actions).

**Known limitations of Agent Teams to design around:**
- No session resumption — `/resume`/`/rewind` don't restore teammates; teams are
  session-scoped
- `broadcast` is expensive — generates N context injections for N teammates
- ~800k tokens for a 3-agent session vs ~200k solo — real cost consideration for founders
- Not available in VS Code extension (bug #28048, still open)
- One team per session; teammates cannot spawn their own teams
- Cross-machine communication doesn't exist yet (GitHub issue #28300, open)

See `docs/issues/inter-agent-comms.md` for open questions and community links.
