import type { Agent, AgentType } from './types'

const KEYWORDS: Record<Exclude<AgentType, 'ops' | 'custom'>, string[]> = {
  coding: [
    'code', 'bug', 'fix', 'implement', 'build', 'test', 'deploy', 'refactor',
    'debug', 'function', 'class', 'api', 'endpoint', 'database', 'schema',
    'migration', 'query', 'performance', 'error', 'crash', 'feature', 'component',
    'module', 'library', 'package', 'typescript', 'javascript', 'python', 'react',
    'next', 'node', 'sql', 'git', 'pr', 'review', 'lint', 'type', 'interface',
    'compile', 'import', 'export', 'hook', 'route', 'middleware', 'auth',
    'encryption', 'cron', 'job', 'queue', 'cache',
  ],
  research: [
    'research', 'investigate', 'compare', 'evaluate', 'competitor', 'alternative',
    'should we', 'which', 'tradeoff', 'decision', 'architecture', 'approach',
    'strategy', 'best practice', 'how does', 'why does', 'what is', 'learn',
    'understand', 'analyze', 'market', 'technical', 'design', 'pattern',
    'recommend', 'pros and cons', 'options', 'survey', 'benchmark', 'pick',
    'choose', 'versus', 'vs',
  ],
  marketing: [
    'marketing', 'copy', 'content', 'blog', 'tweet', 'post', 'thread',
    'messaging', 'positioning', 'customer', 'user', 'persona', 'icp', 'brand',
    'email', 'newsletter', 'landing page', 'website', 'announcement', 'launch',
    'growth', 'acquisition', 'retention', 'churn', 'pitch', 'deck', 'sales',
    'headline', 'tagline', 'cta', 'campaign', 'channel', 'seo', 'ads', 'press',
    'tone', 'voice',
  ],
}

const MIN_CONFIDENCE = 0.2

export interface RoutingResult {
  agent: Agent
  agentType: AgentType
  confidence: number
  scores: Record<string, number>
  reason: string
  override: boolean
}

export function routeTask(task: string, agents: Agent[]): RoutingResult | null {
  if (agents.length === 0) return null

  const lower = task.toLowerCase()

  // Direct prefix override: @coding, @research, @marketing, @ops
  for (const type of ['coding', 'research', 'marketing', 'ops'] as AgentType[]) {
    if (lower.startsWith(`@${type}`)) {
      const agent = agents.find((a) => a.type === type)
      if (agent) {
        return {
          agent,
          agentType: type,
          confidence: 1,
          scores: { [type]: 1 },
          reason: `Routed directly to ${type} agent via @${type} prefix.`,
          override: true,
        }
      }
    }
  }

  // Keyword scoring
  const scores: Record<string, number> = { coding: 0, research: 0, marketing: 0, ops: 0 }
  for (const [type, keywords] of Object.entries(KEYWORDS) as [keyof typeof KEYWORDS, string[]][]) {
    for (const kw of keywords) {
      if (lower.includes(kw)) scores[type] += 1
    }
  }

  const maxScore = Math.max(...Object.values(scores))
  const winner = (Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0]) as AgentType
  const confidence = maxScore === 0 ? 0 : scores[winner] / (Object.values(scores).reduce((a, b) => a + b, 0) || 1)

  const targetType: AgentType = maxScore === 0 || confidence < MIN_CONFIDENCE ? 'ops' : winner

  // Find a matching agent — fall back to first available
  const agent = agents.find((a) => a.type === targetType) ?? agents[0]

  let reason: string
  if (maxScore === 0 || confidence < MIN_CONFIDENCE) {
    reason = `Low confidence across all agents — defaulting to ${agent.type} agent.`
  } else {
    const matched = (KEYWORDS[targetType as keyof typeof KEYWORDS] ?? [])
      .filter((kw) => lower.includes(kw))
      .slice(0, 3)
    reason = `Matched ${agent.type} agent (${matched.join(', ')}).`
  }

  return { agent, agentType: agent.type, confidence, scores, reason, override: false }
}
