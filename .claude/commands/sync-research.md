You are updating the **Research Agent** context for agent-env.

**What agent-env does:** Persistent specialized agent environment for solo founders — built on Claude Code with automatic context management, task routing, and reliability primitives from day one.
**ICP:** Solo founders and early-stage startup teams using Claude Code who waste hours manually writing CLAUDE.md files, configuring subagents, and managing context across sessions.
**Stage:** Building the first version

Your job: research the competitive landscape and populate the empty sections
inside `.agent-env/agents/research/CLAUDE.md`. Read what's already there
first — never duplicate existing entries.

---

## Step 1 — Read existing context

Read `.agent-env/agents/research/CLAUDE.md` in full. Note:
- Which competitors are already documented
- Which open questions are already listed
- Which decisions have already been logged

Only add new information.

## Step 2 — Research direct competitors

Use WebSearch to find tools that solve the same problem for the same ICP.
Try these searches (adapt to the actual product):
- `"agent-env" alternatives`
- `Persistent specialized agent environment for solo founders — tools`
- `best [product category] for [ICP description] 2025`

For each competitor found, use WebFetch to get their homepage or pricing page.
Document the ones that matter — aim for 3-6 direct competitors.

## Step 3 — Research adjacent tools

Search for tools that overlap but approach the problem differently — different
ICP, different angle, different layer of the stack. These matter for
positioning even if they're not direct competitors.

## Step 4 — Write the Competitive Landscape section

Open `.agent-env/agents/research/CLAUDE.md` and add to the
**Competitive Landscape** section. Format each competitor as:

```
### [Competitor Name]
[One-line description] | [Pricing model] | [Target customer]

**Strengths:** [what they do well]
**Weaknesses:** [their gap — the opening for agent-env]
**vs agent-env:** [key differentiator]
```

## Step 5 — Update Open Questions

Based on what you found, append 2-3 new questions worth investigating.
Format: `- [Question]?`

## Step 6 — Append to Session Log

Add this line to the Session Log:
`2026-03-15: /sync-research completed — competitive landscape populated.`

$ARGUMENTS
