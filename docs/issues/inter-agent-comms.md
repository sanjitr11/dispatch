# Feature: Inter-Agent Communication

**Status:** Planned — post first-user feedback
**Priority:** Post-launch (requires 10+ real users to validate demand)
**Area:** Workspace / Agent coordination

---

## The problem in plain English

Today, agent-env runs four agents in parallel but they're isolated from each other.
The founder is the only connection between them. When the coding agent finishes a
technical spike that changes the product direction, the marketing agent doesn't know.
When the research agent finds a competitor doing something important, the ops agent
can't act on it. Every cross-agent handoff is a manual copy-paste step by the founder.

This is fine for v1. It stops scaling the moment founders have more than one thing
happening at once — which is always.

The goal is to let agents coordinate work directly so the founder can assign a goal
once and receive a result, rather than acting as a message relay throughout.

---

## What the community has already built

Claude Code shipped native inter-agent messaging in **v2.1.32 (February 5, 2026)**
as **Agent Teams**, currently behind a feature flag. This is the foundation to build on.

### Official Claude Code Agent Teams

- **Docs:** https://code.claude.com/docs/en/agent-teams
- **Changelog entry:** https://code.claude.com/docs/en/changelog (v2.1.32, Feb 5 2026)
- **Announcement:** https://techcrunch.com/2026/02/05/anthropic-releases-opus-4-6-with-new-agent-teams/

**How the transport works:**
Plain JSON files written to `~/.claude/` on the local machine. No sockets, no message
bus, no broker. Each agent gets an inbox file:

```
~/.claude/
├── teams/{team-name}/
│   ├── config.json                 ← member registry (name, agentId, agentType)
│   └── inboxes/{agent-name}.json   ← per-agent message inbox
└── tasks/{team-name}/
    └── {id}.json                   ← individual task files (status, owner, deps)
```

**From an agent's perspective:**
- Send to one agent: `TeammateTool.write(to: "researcher", message: "...")`
- Send to all: `TeammateTool.broadcast(message: "...")`
- Receive: messages arrive automatically as new conversation turns — no polling
- Task queue: `TaskCreate`, `TaskList`, `TaskGet`, `TaskUpdate` (status: pending →
  in_progress → completed) with file-locking to prevent double-claiming
- Identify teammates: `TeammateTool.discoverTeams()`

**Enable it:**
```json
{ "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }
```
Requires Claude Code v2.1.32+. Not yet available on all plans.

### Community implementations and write-ups

- **TeammateTool system prompt (extracted):**
  https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/tool-description-teammatetool.md
  — Full list of TeammateTool operations with descriptions

- **Swarm orchestration skill by Kieran Klaassen:**
  https://gist.github.com/kieranklaassen/4f2aba89594a4aea4ad64d753984b2ea
  — Practical skill for orchestrating Claude Code agents as a swarm; includes
  heartbeat timeout (5 min), broadcast cost warnings, and team lifecycle

- **Technical breakdown (paddo.dev):**
  https://paddo.dev/blog/claude-code-hidden-swarm/
  — "Claude Code's Hidden Multi-Agent System" — explains the filesystem transport,
  inbox schema, and how messages are injected into conversation turns

- **Agent Teams reference (alexop.dev):**
  https://alexop.dev/posts/from-tasks-to-swarms-agent-teams-in-claude-code/
  — Token cost analysis (~800k tokens for 3-agent team vs ~200k solo), team
  lifecycle, and practical limitations

### Relevant GitHub issues

| Issue | Summary |
|---|---|
| [#4993](https://github.com/anthropics/claude-code/issues/4993) | Original feature request: agent-to-agent messaging (Aug 2025, closed NOT_PLANNED when Agent Teams shipped) |
| [#28048](https://github.com/anthropics/claude-code/issues/28048) | Bug: Agent Teams tools not available in VS Code extension (still open) |
| [#28300](https://github.com/anthropics/claude-code/issues/28300) | Feature request: cross-machine agent communication via MCP (still open, no Anthropic response) |
| [#30140](https://github.com/anthropics/claude-code/issues/30140) | Feature request: persistent shared channel (closed DUPLICATE Mar 2026) |

---

## Known limitations to design around

| Limitation | Impact |
|---|---|
| No session resumption — `/resume`/`/rewind` don't restore teammates | Teams are session-scoped; founder loses team on app restart |
| `broadcast` generates N context injections | Expensive at scale — avoid for routine updates |
| ~800k tokens for 3-agent session vs ~200k solo | Real Anthropic API cost; founders on free/lower plans may hit limits |
| One team per session; teammates can't spawn sub-teams | Can't have nested delegation trees |
| Leadership is fixed for the team's lifetime | Lead agent can't transfer ownership |
| All teammates inherit the lead's permission mode | Can't scope permissions per agent type |
| Cross-machine communication doesn't exist | All agents must run on the same machine |
| Not available in VS Code extension (bug #28048) | Our users are primarily in the Electron app — lower risk, but worth tracking |
| Plan gating (not available on all tiers) | Verify plan requirements before surfacing in UI |

---

## Open questions — user feedback should answer these before building

### 1. Autonomous coordination vs. founder stays in the loop

Do founders want agents to coordinate and delegate autonomously once given a goal,
or do they want to approve every cross-agent handoff?

Two modes are possible:
- **Auto-pilot:** founder assigns a goal, agents coordinate and surface only blockers
  and final results
- **Supervised:** every inter-agent message is visible and requires founder approval
  before the receiving agent acts on it

The right answer probably differs by task risk level (writing copy vs. pushing code vs.
sending emails). Find out which mode founders default to and whether they want
per-task or per-agent-type control.

### 2. Message visibility — real time or summarized?

Should inter-agent messages appear as they happen (like a group chat the founder can
observe) or be summarized after the team completes its work?

Real-time visibility lets founders catch misalignment early but creates cognitive load.
After-the-fact summaries are lower friction but remove the ability to course-correct
mid-execution. The existing split view already shows all terminals — is that enough,
or do founders need a dedicated activity feed?

### 3. What's the right UI surface?

Options to explore with users:
- **Shared feed panel** — a chronological log of all inter-agent messages visible in
  the workspace sidebar
- **Per-pair channels** — separate message history between each agent pair (coding ↔
  research, coding ↔ ops, etc.)
- **Task board overlay** — a kanban-style view of the shared task queue, showing who
  owns what and what's blocked
- **Nothing new** — just show agent activity in the existing terminal split view and
  let founders read the terminals

Don't build a new UI until at least 3 founders describe the same pain point unprompted.

---

## What NOT to do before launch

- Don't build this before getting real users — the routing logic and task queue are
  straightforward once we know what founders actually want
- Don't reinvent the transport — Claude Code's filesystem-based inbox is already
  working; integrate with it rather than building a parallel system
- Don't default to autonomous mode — founders who lose visibility will churn faster
  than founders who have to approve a few extra steps
- Don't expose this in the UI without a token cost warning — an 800k-token 3-agent
  session is a real cost surprise for founders who don't expect it
