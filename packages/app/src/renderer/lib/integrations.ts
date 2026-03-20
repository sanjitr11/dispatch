/**
 * MCP integration definitions.
 *
 * Each entry describes:
 *  - which agent types can use it
 *  - what credentials are needed (shown as form fields)
 *  - how to build the MCP server config that goes into .claude/settings.json
 *
 * V1: API-key-based only. OAuth integrations (Reddit, Twitter, LinkedIn)
 * require Composio + Electron protocol.handle — deferred to v2.
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
