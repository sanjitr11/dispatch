export type AgentType = 'coding' | 'research' | 'marketing' | 'ops' | 'custom'

export interface Agent {
  id: string
  project_id: string
  user_id: string
  name: string
  type: AgentType
  instructions: string | null
  created_at: string
}

export interface Project {
  id: string
  user_id: string
  startup_name: string
  pitch: string
  stage: 'idea' | 'mvp' | 'early' | 'revenue' | 'scaling'
  stack: string
  icp: string
  priorities: string
  bottleneck: string | null
  version: number
  created_at: string
  updated_at: string
  local_path: string | null
}

export type ProjectFormData = Omit<Project, 'id' | 'user_id' | 'version' | 'created_at' | 'updated_at' | 'local_path'>

export interface Integration {
  id: string
  agent_id: string
  user_id: string
  type: string
  config: Record<string, string>  // API keys / tokens — stored in Supabase behind RLS
  enabled: boolean
  created_at: string
}

export interface McpServerConfig {
  command: string
  args: string[]
  env: Record<string, string>
}
