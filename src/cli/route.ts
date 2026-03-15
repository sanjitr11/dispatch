/**
 * Task routing — decides which agent should handle a given task description.
 *
 * Algorithm: weighted keyword scoring per agent, normalized to a confidence
 * score. Falls back to ops when no agent scores above MIN_CONFIDENCE.
 *
 * Design decisions documented in DESIGN.md § Q6.
 */

import { AgentType, AGENT_LABELS, AGENT_DESCRIPTIONS, AGENT_COMMANDS } from '../agents/base.js'

export interface RoutingDecision {
  agent: AgentType
  confidence: number
  scores: Record<AgentType, number>
  reason: string
  /** True if the user used an explicit @agent prefix to bypass scoring */
  override: boolean
}

// ─── Keyword maps ─────────────────────────────────────────────────────────────

const PATTERNS: Record<Exclude<AgentType, 'ops'>, ReadonlyArray<[string, number]>> = {
  coding: [
    // Strong signals (weight 3)
    ['implement', 3], ['refactor', 3], ['debug', 3], ['fix bug', 3], ['fix the bug', 3],
    ['write code', 3], ['write a test', 3], ['write tests', 3], ['unit test', 3],
    ['deploy', 3], ['migration', 3], ['database schema', 3],
    // Medium signals (weight 2)
    ['fix ', 2], ['fix the', 2],
    ['code', 2], ['bug', 2], ['test', 2], ['build', 2], ['function', 2], ['class', 2],
    ['api', 2], ['endpoint', 2], ['schema', 2], ['query', 2], ['performance', 2],
    ['error', 2], ['crash', 2], ['feature', 2], ['component', 2], ['module', 2],
    ['library', 2], ['package', 2], ['typescript', 2], ['javascript', 2], ['python', 2],
    ['react', 2], ['next.js', 2], ['node', 2], ['sql', 2], ['git', 2], ['pull request', 2],
    ['pr ', 2], ['review', 2], ['lint', 2], ['type error', 2], ['interface', 2],
    ['compile', 2], ['import', 2], ['export', 2], ['hook', 2], ['route', 2],
    ['middleware', 2], ['auth', 2], ['cache', 2], ['queue', 2], ['cron', 2],
    // Weak signals (weight 1)
    ['coding', 1], ['development', 1], ['dev', 1], ['repo', 1], ['commit', 1],
    ['branch', 1], ['merge', 1], ['test coverage', 1], ['integration', 1],
  ],

  research: [
    // Strong signals (weight 3)
    ['research', 3], ['investigate', 3], ['should we use', 3], ['which library', 3],
    ['compare', 3], ['tradeoff', 3], ['trade-off', 3], ['decision', 3],
    ['competitor', 3], ['competitive analysis', 3], ['benchmark', 3],
    ['dismissed', 3], ['pros and cons', 3], ['vs ', 3], ['versus', 3],
    // Medium signals (weight 2)
    ['evaluate', 2], ['alternative', 2], ['should we', 2], ['which', 2],
    ['architecture', 2], ['approach', 2], ['strategy', 2], ['best practice', 2],
    ['how does', 2], ['why does', 2], ['learn about', 2], ['understand', 2],
    ['analyze', 2], ['market', 2], ['design pattern', 2], ['recommend', 2],
    ['options', 2], ['survey', 2], ['pick', 2], ['choose', 2],
    // Weak signals (weight 1)
    ['what is', 1], ['how to', 1], ['deep dive', 1], ['landscape', 1],
    ['ecosystem', 1], ['tooling', 1], ['stack decision', 1],
  ],

  marketing: [
    // Strong signals (weight 3)
    ['marketing', 3], ['copy', 3], ['positioning', 3], ['messaging', 3],
    ['landing page', 3], ['launch', 3], ['announcement', 3], ['pitch deck', 3],
    ['icp', 3], ['ideal customer', 3], ['brand voice', 3], ['tagline', 3],
    // Medium signals (weight 2)
    ['content', 2], ['blog post', 2], ['blog', 2], ['tweet', 2], ['thread', 2],
    ['email', 2], ['newsletter', 2], ['website', 2], ['headline', 2],
    ['cta', 2], ['call to action', 2], ['persona', 2], ['customer', 2],
    ['growth', 2], ['acquisition', 2], ['retention', 2], ['churn', 2],
    ['sales', 2], ['tone', 2], ['voice', 2], ['brand', 2],
    ['seo', 2], ['ads', 2], ['campaign', 2], ['channel', 2],
    // Weak signals (weight 1)
    ['user', 1], ['audience', 1], ['viral', 1], ['social', 1], ['press', 1],
    ['pr ', 1], ['outreach', 1], ['cold', 1], ['funnel', 1],
  ],
}

const MIN_CONFIDENCE = 0.2

function scoreTask(task: string): Record<AgentType, number> {
  const lower = task.toLowerCase()
  const scores: Record<AgentType, number> = { coding: 0, research: 0, marketing: 0, ops: 0 }

  for (const [agent, patterns] of Object.entries(PATTERNS) as Array<[Exclude<AgentType, 'ops'>, ReadonlyArray<[string, number]>]>) {
    for (const [keyword, weight] of patterns) {
      if (lower.includes(keyword)) {
        scores[agent] += weight
      }
    }
  }

  return scores
}

function buildReason(agent: AgentType, scores: Record<AgentType, number>, confidence: number): string {
  if (agent === 'ops' && confidence === 0) {
    return 'No strong keyword signals found — defaulting to the Ops Agent.'
  }

  const topScore = scores[agent]
  const dominant = Object.entries(scores)
    .filter(([a]) => a !== 'ops')
    .sort(([, a], [, b]) => b - a)

  const [first] = dominant
  if (!first) return `Routed to ${AGENT_LABELS[agent]} (confidence: ${(confidence * 100).toFixed(0)}%)`

  return `${AGENT_LABELS[agent]} scored highest (${topScore} pts, ${(confidence * 100).toFixed(0)}% confidence)`
}

// ─── Main routing function ────────────────────────────────────────────────────

export function route(task: string): RoutingDecision {
  const trimmed = task.trim()

  // Explicit @agent override — bypasses scoring entirely
  const overrideMatch = trimmed.match(/^@(coding|research|marketing|ops)\s+/i)
  if (overrideMatch) {
    const agent = overrideMatch[1].toLowerCase() as AgentType
    return {
      agent,
      confidence: 1.0,
      scores: { coding: 0, research: 0, marketing: 0, ops: 0 },
      reason: `Explicit @${agent} prefix used — routing directly.`,
      override: true,
    }
  }

  const scores = scoreTask(trimmed)
  const maxScore = Math.max(...Object.values(scores))

  if (maxScore === 0) {
    return {
      agent: 'ops',
      confidence: 0,
      scores,
      reason: 'No keyword signals found — defaulting to Ops Agent.',
      override: false,
    }
  }

  // Compute confidence as proportion of max possible score dominance
  const sortedAgents = (Object.keys(scores) as AgentType[]).sort((a, b) => scores[b] - scores[a])
  const topAgent = sortedAgents[0]
  const secondScore = scores[sortedAgents[1]] ?? 0

  // Confidence: how dominant is the top agent over the second?
  // If tied, confidence is lower. If clear winner, confidence is higher.
  const totalTop = scores[topAgent]
  const confidence = totalTop > 0
    ? Math.min(1, (totalTop - secondScore * 0.5) / totalTop)
    : 0

  const chosenAgent: AgentType = confidence >= MIN_CONFIDENCE ? topAgent : 'ops'

  return {
    agent: chosenAgent,
    confidence,
    scores,
    reason: buildReason(chosenAgent, scores, confidence),
    override: false,
  }
}

// ─── CLI display helpers ──────────────────────────────────────────────────────

export function formatRoutingDecision(decision: RoutingDecision): string {
  const { agent, confidence, scores, reason } = decision
  const command = AGENT_COMMANDS[agent as AgentType]
  const description = AGENT_DESCRIPTIONS[agent as AgentType]

  const lines = [
    `→ ${AGENT_LABELS[agent]} ${command}`,
    `  ${description}`,
    `  ${reason}`,
  ]

  if (!decision.override && confidence < 0.6) {
    lines.push('')
    lines.push('  Score breakdown:')
    const sorted = (Object.entries(scores) as Array<[AgentType, number]>).sort(([, a], [, b]) => b - a)
    for (const [a, score] of sorted) {
      if (score > 0) {
        lines.push(`    ${AGENT_LABELS[a]}: ${score}`)
      }
    }
    lines.push('')
    lines.push(`  To override: prefix your task with @coding, @research, @marketing, or @ops`)
  }

  return lines.join('\n')
}
