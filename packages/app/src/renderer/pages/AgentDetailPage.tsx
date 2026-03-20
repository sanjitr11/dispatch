import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { AGENT_META } from '../lib/agentMeta'
import { agentCwd } from '../lib/buildClaudeMd'
import { integrationsForAgent, getIntegrationDef } from '../lib/integrations'
import type { Agent, Project, Integration } from '../lib/types'

function parseSessionLog(content: string): string[] {
  const marker = '## Session Log'
  const idx = content.indexOf(marker)
  if (idx === -1) return []
  const section = content.slice(idx + marker.length)
  return section
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^\d{4}-\d{2}-\d{2}:/.test(l))
    .reverse()
}

export default function AgentDetailPage() {
  const { id, agentId } = useParams<{ id: string; agentId: string }>()
  const [agent, setAgent] = useState<Agent | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sessionLog, setSessionLog] = useState<string[]>([])
  const [claudeMd, setClaudeMd] = useState<string | null>(null)
  const [showContext, setShowContext] = useState(false)
  // Integrations
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [connectingType, setConnectingType] = useState<string | null>(null)
  const [connectForm, setConnectForm] = useState<Record<string, string>>({})
  const [connectSaving, setConnectSaving] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)

  useEffect(() => {
    if (!id || !agentId) return
    Promise.all([
      supabase.from('agents').select('*').eq('id', agentId).single(),
      supabase.from('projects').select('*').eq('id', id).single(),
    ]).then(async ([agentRes, projectRes]) => {
      if (agentRes.error) { setError(agentRes.error.message); setLoading(false); return }
      if (projectRes.error) { setError(projectRes.error.message); setLoading(false); return }
      const ag = agentRes.data
      const proj = projectRes.data
      setAgent(ag)
      setProject(proj)
      setLoading(false)

      if (proj.local_path) {
        const claudeMdPath = `${agentCwd(proj.local_path, ag.name)}/CLAUDE.md`
        const content = await window.electronAPI.readFile(claudeMdPath)
        if (content) {
          setSessionLog(parseSessionLog(content))
          setClaudeMd(content)
        }
      }

      const { data: intData } = await supabase
        .from('agent_integrations')
        .select('*')
        .eq('agent_id', agentId)
      setIntegrations((intData ?? []) as Integration[])
    })
  }, [id, agentId])

  async function handleConnect(type: string) {
    if (!agent) return
    setConnectSaving(true)
    setConnectError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setConnectError('Not authenticated'); setConnectSaving(false); return }

    const { data, error } = await supabase
      .from('agent_integrations')
      .upsert({
        agent_id: agent.id,
        user_id: user.id,
        type,
        config: connectForm,
        enabled: true,
      }, { onConflict: 'agent_id,type' })
      .select()
      .single()

    if (error) {
      setConnectError(error.message)
      setConnectSaving(false)
      return
    }
    setIntegrations((prev) => {
      const filtered = prev.filter((i) => i.type !== type)
      return [...filtered, data as Integration]
    })
    setConnectingType(null)
    setConnectForm({})
    setConnectSaving(false)
  }

  async function handleDisconnect(type: string) {
    if (!agent) return
    await supabase
      .from('agent_integrations')
      .delete()
      .eq('agent_id', agent.id)
      .eq('type', type)
    setIntegrations((prev) => prev.filter((i) => i.type !== type))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-surface-base">
        <p className="text-ink-3 text-sm">Loading…</p>
      </div>
    )
  }

  if (error || !agent || !project) {
    return (
      <div className="min-h-screen bg-surface-base flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-sm mb-4">{error ?? 'Not found'}</p>
          <Link to={`/projects/${id}`} className="text-accent hover:text-accent-text text-sm transition-colors">
            ← back to project
          </Link>
        </div>
      </div>
    )
  }

  const meta = AGENT_META[agent.type]

  return (
    <div className="min-h-screen bg-surface-base">
      <header className="bg-surface-raised border-b border-surface-border px-6 py-3 flex items-center gap-3">
        <Link
          to={`/projects/${id}`}
          className="text-sm text-ink-3 hover:text-ink transition-colors"
        >
          ← back
        </Link>
        <h1 className="text-sm font-semibold text-ink">{agent.name}</h1>
        <span className={`text-xs px-2.5 py-1 rounded font-medium ${meta.color}`}>
          {meta.label}
        </span>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10 space-y-6">
        {meta.role && (
          <div>
            <h3 className="text-[10px] uppercase tracking-widest text-ink-3 font-medium mb-1.5">Role</h3>
            <p className="text-sm text-ink-2">{meta.role}</p>
          </div>
        )}
        {agent.instructions && (
          <div>
            <h3 className="text-[10px] uppercase tracking-widest text-ink-3 font-medium mb-1.5">
              Custom instructions
            </h3>
            <p className="text-sm text-ink-2 whitespace-pre-wrap">{agent.instructions}</p>
          </div>
        )}
        {/* ── Connected tools ─────────────────────────────────────────────── */}
        {(() => {
          const availableDefs = integrationsForAgent(agent.type)
          if (availableDefs.length === 0) return null
          return (
            <div>
              <h3 className="text-[10px] uppercase tracking-widest text-ink-3 font-medium mb-3">
                Connected tools
              </h3>
              <div className="space-y-3">
                {availableDefs.map((def) => {
                  const connected = integrations.find((i) => i.type === def.type)
                  const isConnecting = connectingType === def.type

                  return (
                    <div key={def.type} className="border border-surface-border rounded-lg p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-ink">{def.label}</span>
                            {connected && (
                              <span className="text-[10px] text-emerald-400 font-medium">● connected</span>
                            )}
                          </div>
                          <p className="text-xs text-ink-3 mt-0.5">{def.description}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {connected ? (
                            <button
                              onClick={() => handleDisconnect(def.type)}
                              className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                            >
                              Disconnect
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setConnectingType(isConnecting ? null : def.type)
                                setConnectForm({})
                                setConnectError(null)
                              }}
                              className="text-xs text-accent hover:text-accent-text transition-colors"
                            >
                              {isConnecting ? 'Cancel' : 'Connect'}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Inline credential form */}
                      {isConnecting && (
                        <div className="mt-3 space-y-2 border-t border-surface-border pt-3">
                          {def.fields.map((field) => (
                            <div key={field.key}>
                              <label className="block text-[10px] text-ink-3 mb-1">{field.label}</label>
                              <input
                                type={field.secret ? 'password' : 'text'}
                                value={connectForm[field.key] ?? ''}
                                onChange={(e) =>
                                  setConnectForm((prev) => ({ ...prev, [field.key]: e.target.value }))
                                }
                                placeholder={field.placeholder}
                                className="w-full bg-surface-overlay border border-surface-border rounded px-2.5 py-1.5 text-xs text-ink placeholder-ink-3 focus:outline-none focus:border-accent"
                              />
                              {field.hint && (
                                <p className="text-[10px] text-ink-3 mt-1">{field.hint}</p>
                              )}
                            </div>
                          ))}
                          {connectError && (
                            <p className="text-xs text-red-400">{connectError}</p>
                          )}
                          <div className="flex items-center gap-3 pt-1">
                            <button
                              onClick={() => handleConnect(def.type)}
                              disabled={connectSaving || def.fields.some((f) => !connectForm[f.key]?.trim())}
                              className="text-xs bg-accent hover:bg-accent-hover text-white px-3 py-1.5 rounded font-medium disabled:opacity-50 transition-colors"
                            >
                              {connectSaving ? 'Saving…' : 'Save'}
                            </button>
                            <a
                              href={def.docsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-ink-3 hover:text-ink transition-colors"
                            >
                              How to get credentials ↗
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              <p className="text-[10px] text-ink-3 mt-2">
                Credentials are stored in your Supabase project behind row-level security.
                They are injected into the agent's session at boot — never stored locally.
              </p>
            </div>
          )
        })()}

        {sessionLog.length > 0 && (
          <div>
            <h3 className="text-[10px] uppercase tracking-widest text-ink-3 font-medium mb-2">
              Session log
            </h3>
            <ul className="space-y-1">
              {sessionLog.map((entry, i) => {
                const [date, ...rest] = entry.split(': ')
                return (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="text-ink-3 shrink-0 font-mono text-xs pt-px">{date}</span>
                    <span className="text-ink-2">{rest.join(': ')}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {claudeMd && (
          <div>
            <button
              onClick={() => setShowContext((v) => !v)}
              className="text-[10px] uppercase tracking-widest text-ink-3 font-medium hover:text-ink transition-colors"
            >
              {showContext ? '▾' : '▸'} Agent context (CLAUDE.md)
            </button>
            {showContext && (
              <pre className="mt-3 p-4 bg-surface-overlay rounded-lg text-xs text-ink-2 font-mono whitespace-pre-wrap overflow-auto max-h-96 border border-surface-border">
                {claudeMd}
              </pre>
            )}
          </div>
        )}

        <p className="text-xs text-ink-3 pt-2">
          Created {new Date(agent.created_at).toLocaleString()}
        </p>
      </main>
    </div>
  )
}
