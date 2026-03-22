/**
 * MCP integration definitions.
 *
 * Each entry describes:
 *  - which agent types can use it
 *  - what credentials are needed (shown as form fields)
 *  - how to build the MCP server config that goes into .claude/settings.json
 *
 * Fetch is zero-auth and always injected automatically — not listed here.
 * V1: API-key-based. Reddit uses Composio (user connects account externally).
 */

import type { AgentType, McpServerConfig } from './types'

export interface IntegrationField {
  key: string        // key in the config JSON stored in Supabase
  label: string
  placeholder: string
  hint?: string
  secret?: boolean   // mask in the UI
}

export interface IntegrationDef {
  type: string
  label: string
  description: string
  docsUrl: string
  agentTypes: AgentType[]
  fields: IntegrationField[]
  toMcpServer: (config: Record<string, string>) => McpServerConfig
}

export const INTEGRATION_DEFS: IntegrationDef[] = [
  // ── Coding ────────────────────────────────────────────────────────────────
  {
    type: 'github',
    label: 'GitHub',
    description: 'Create issues, open PRs, read repos, and search code directly from Claude.',
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/github',
    agentTypes: ['coding'],
    fields: [
      {
        key: 'GITHUB_PERSONAL_ACCESS_TOKEN',
        label: 'Personal Access Token',
        placeholder: 'ghp_…',
        hint: 'github.com → Settings → Developer settings → Personal access tokens',
        secret: true,
      },
    ],
    toMcpServer: (config) => ({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: config['GITHUB_PERSONAL_ACCESS_TOKEN'] ?? '' },
    }),
  },

  {
    type: 'supabase',
    label: 'Supabase',
    description: 'Query databases, run migrations, manage tables and RLS policies directly from Claude.',
    docsUrl: 'https://supabase.com/docs/guides/getting-started/mcp',
    agentTypes: ['coding'],
    fields: [
      {
        key: 'SUPABASE_ACCESS_TOKEN',
        label: 'Personal Access Token',
        placeholder: 'sbp_…',
        hint: 'supabase.com/dashboard/account/tokens → Generate new token',
        secret: true,
      },
      {
        key: 'project_ref',
        label: 'Project Ref (optional)',
        placeholder: 'abcdefghijklmnop',
        hint: 'Scopes the MCP to one project. Found in your project URL: supabase.co/dashboard/project/<ref>',
      },
    ],
    toMcpServer: (config) => {
      const args = ['-y', '@supabase/mcp-server-supabase']
      if (config['project_ref']?.trim()) args.push('--project-ref', config['project_ref'].trim())
      return {
        command: 'npx',
        args,
        env: { SUPABASE_ACCESS_TOKEN: config['SUPABASE_ACCESS_TOKEN'] ?? '' },
      }
    },
  },

  // ── Research ──────────────────────────────────────────────────────────────
  {
    type: 'brave-search',
    label: 'Brave Search',
    description: 'Web and local search via the Brave Search API — no tracking, high quality results.',
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search',
    agentTypes: ['research'],
    fields: [
      {
        key: 'BRAVE_API_KEY',
        label: 'Brave Search API Key',
        placeholder: 'BSA…',
        hint: 'api.search.brave.com → Sign up → API Keys',
        secret: true,
      },
    ],
    toMcpServer: (config) => ({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-brave-search'],
      env: { BRAVE_API_KEY: config['BRAVE_API_KEY'] ?? '' },
    }),
  },
  {
    type: 'exa',
    label: 'Exa',
    description: 'Semantic search engine built for AI — great for deep research and finding recent content.',
    docsUrl: 'https://docs.exa.ai/reference/mcp-server',
    agentTypes: ['research'],
    fields: [
      {
        key: 'EXA_API_KEY',
        label: 'Exa API Key',
        placeholder: 'exa-…',
        hint: 'dashboard.exa.ai → API Keys',
        secret: true,
      },
    ],
    toMcpServer: (config) => ({
      command: 'npx',
      args: ['-y', 'exa-mcp-server'],
      env: { EXA_API_KEY: config['EXA_API_KEY'] ?? '' },
    }),
  },

  // ── Marketing ─────────────────────────────────────────────────────────────
  {
    type: 'reddit',
    label: 'Reddit',
    description: 'Post to subreddits, monitor mentions, and engage in threads via Composio.',
    docsUrl: 'https://composio.dev/tools/reddit',
    agentTypes: ['marketing'],
    fields: [
      {
        key: 'COMPOSIO_API_KEY',
        label: 'Composio API Key',
        placeholder: 'comp_…',
        hint: 'app.composio.dev → API Keys. Then run: composio add reddit — to connect your Reddit account.',
        secret: true,
      },
    ],
    toMcpServer: (config) => ({
      command: 'npx',
      args: ['-y', '@composio-dev/mcp@latest', '--toolset', 'reddit'],
      env: { COMPOSIO_API_KEY: config['COMPOSIO_API_KEY'] ?? '' },
    }),
  },
  {
    type: 'resend',
    label: 'Resend',
    description: 'Send outreach and transactional emails directly from the agent.',
    docsUrl: 'https://resend.com/docs',
    agentTypes: ['marketing'],
    fields: [
      {
        key: 'RESEND_API_KEY',
        label: 'Resend API Key',
        placeholder: 're_…',
        hint: 'resend.com → API Keys → Create API Key',
        secret: true,
      },
    ],
    toMcpServer: (config) => ({
      command: 'npx',
      args: ['-y', 'resend-mcp'],
      env: { RESEND_API_KEY: config['RESEND_API_KEY'] ?? '' },
    }),
  },
  {
    type: 'stripe',
    label: 'Stripe',
    description: 'Pull MRR, churn, and customer data to ground marketing decisions in revenue reality.',
    docsUrl: 'https://github.com/stripe/agent-toolkit',
    agentTypes: ['marketing', 'ops'],
    fields: [
      {
        key: 'STRIPE_SECRET_KEY',
        label: 'Secret Key',
        placeholder: 'sk_live_… or sk_test_…',
        hint: 'dashboard.stripe.com → Developers → API Keys → Secret key',
        secret: true,
      },
    ],
    toMcpServer: (config) => ({
      command: 'npx',
      args: ['-y', '@stripe/mcp', '--tools=all'],
      env: { STRIPE_SECRET_KEY: config['STRIPE_SECRET_KEY'] ?? '' },
    }),
  },

  // ── Ops ───────────────────────────────────────────────────────────────────
  {
    type: 'linear',
    label: 'Linear',
    description: 'Create and update issues, manage projects, and query your Linear workspace.',
    docsUrl: 'https://linear.app/docs/mcp',
    agentTypes: ['ops'],
    fields: [
      {
        key: 'LINEAR_API_KEY',
        label: 'Linear API Key',
        placeholder: 'lin_api_…',
        hint: 'linear.app → Settings → API → Personal API keys',
        secret: true,
      },
    ],
    toMcpServer: (config) => ({
      command: 'npx',
      args: ['-y', 'linear-mcp-server'],
      env: { LINEAR_API_KEY: config['LINEAR_API_KEY'] ?? '' },
    }),
  },
  {
    type: 'slack',
    label: 'Slack',
    description: 'Send messages, read channels, and manage your Slack workspace.',
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/slack',
    agentTypes: ['ops'],
    fields: [
      {
        key: 'SLACK_BOT_TOKEN',
        label: 'Bot Token',
        placeholder: 'xoxb-…',
        hint: 'api.slack.com → Your App → OAuth & Permissions → Bot User OAuth Token',
        secret: true,
      },
      {
        key: 'SLACK_TEAM_ID',
        label: 'Team ID',
        placeholder: 'T01234ABC',
        hint: 'api.slack.com → Your workspace URL contains the Team ID',
      },
    ],
    toMcpServer: (config) => ({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-slack'],
      env: {
        SLACK_BOT_TOKEN: config['SLACK_BOT_TOKEN'] ?? '',
        SLACK_TEAM_ID: config['SLACK_TEAM_ID'] ?? '',
      },
    }),
  },
  {
    type: 'notion',
    label: 'Notion',
    description: 'Read and write Notion pages, databases, and blocks.',
    docsUrl: 'https://developers.notion.com/docs/mcp',
    agentTypes: ['ops'],
    fields: [
      {
        key: 'NOTION_API_KEY',
        label: 'Integration Token',
        placeholder: 'ntn_…',
        hint: 'notion.so/my-integrations → New integration → Internal Integration Secret',
        secret: true,
      },
    ],
    toMcpServer: (config) => ({
      command: 'npx',
      args: ['-y', '@notionhq/notion-mcp-server'],
      env: { NOTION_API_KEY: config['NOTION_API_KEY'] ?? '' },
    }),
  },
]

/** Look up a definition by type string. */
export function getIntegrationDef(type: string): IntegrationDef | undefined {
  return INTEGRATION_DEFS.find((d) => d.type === type)
}

/** Get all integration defs available for a given agent type. */
export function integrationsForAgent(agentType: AgentType): IntegrationDef[] {
  return INTEGRATION_DEFS.filter((d) => d.agentTypes.includes(agentType))
}

/** Build the mcpServers object for settings.json from a list of active integrations. */
export function buildMcpServers(
  integrations: { type: string; config: Record<string, string>; enabled: boolean }[],
): Record<string, McpServerConfig> {
  const servers: Record<string, McpServerConfig> = {}
  for (const integration of integrations) {
    if (!integration.enabled) continue
    const def = getIntegrationDef(integration.type)
    if (!def) continue
    servers[integration.type] = def.toMcpServer(integration.config)
  }
  return servers
}
