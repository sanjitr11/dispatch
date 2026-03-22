import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { AGENT_META } from '../lib/agentMeta'
import { agentSlug } from '../lib/buildClaudeMd'
import { routeTask } from '../lib/router'
import type { Project, Agent } from '../lib/types'
import TerminalPanel, { type TerminalStatus } from '../components/TerminalPanel'

const STAGE_LABELS: Record<string, string> = {
  idea: 'Pre-product',
  mvp: 'Building MVP',
  early: 'Early users',
  revenue: 'Revenue',
  scaling: 'Scaling',
}

const STATUS_DOT: Record<TerminalStatus, string> = {
  starting: 'text-warning',
  running:  'text-success',
  exited:   'text-text-muted',
  error:    'text-error',
}

export default function ProjectWorkspacePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [linkingFolder, setLinkingFolder] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)
  const [openedAgentIds, setOpenedAgentIds] = useState<Set<string>>(new Set())
  const [agentStatuses, setAgentStatuses] = useState<Record<string, TerminalStatus>>({})
  const [unreadAgentIds, setUnreadAgentIds] = useState<Set<string>>(new Set())
  const [readyAgentIds, setReadyAgentIds] = useState<Set<string>>(new Set())
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [splitAgentId, setSplitAgentId] = useState<string | null>(null)
  const [taskInput, setTaskInput] = useState('')
  const [routeReason, setRouteReason] = useState<string | null>(null)
  const routeReasonTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const taskInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!id) return
    Promise.all([
      supabase.from('projects').select('*').eq('id', id).single(),
      supabase.from('agents').select('*').eq('project_id', id).order('created_at'),
    ]).then(([projRes, agentsRes]) => {
      if (!projRes.error) setProject(projRes.data)
      setAgents(agentsRes.data ?? [])
      setLoading(false)
    })
  }, [id])

  function selectAgent(agentId: string) {
    setActiveAgentId(agentId)
    setOpenedAgentIds((prev) => new Set([...prev, agentId]))
    setUnreadAgentIds((prev) => { const next = new Set(prev); next.delete(agentId); return next })
    setReadyAgentIds((prev) => { const next = new Set(prev); next.delete(agentId); return next })
  }

  function handleStatusChange(agentId: string, status: TerminalStatus) {
    setAgentStatuses((prev) => ({ ...prev, [agentId]: status }))
  }

  function handleAgentReady(agentId: string) {
    setReadyAgentIds((prev) => new Set([...prev, agentId]))
  }

  function handleUnreadOutput(agentId: string) {
    if (agentId === activeAgentId || agentId === splitAgentId) return
    setUnreadAgentIds((prev) => new Set([...prev, agentId]))
  }

  function toggleSplit(agentId: string) {
    if (splitAgentId === agentId) {
      setSplitAgentId(null)
    } else {
      setSplitAgentId(agentId)
      setOpenedAgentIds((prev) => new Set([...prev, agentId]))
      setUnreadAgentIds((prev) => {
        const next = new Set(prev)
        next.delete(agentId)
        return next
      })
    }
  }

  function handleRouteTask(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = taskInput.trim()
    if (!trimmed) return
    const result = routeTask(trimmed, agents)
    if (!result) return
    selectAgent(result.agent.id)
    setTaskInput('')
    if (routeReasonTimer.current) clearTimeout(routeReasonTimer.current)
    setRouteReason(result.reason)
    routeReasonTimer.current = setTimeout(() => setRouteReason(null), 4000)
  }

  function handleBackToProjects() {
    const hasRunning = Object.values(agentStatuses).some((s) => s === 'running' || s === 'starting')
    if (hasRunning) {
      setConfirmLeave(true)
    } else {
      navigate('/projects')
    }
  }

  async function handleLinkFolder() {
    if (!project) return
    setLinkingFolder(true)
    const picked = await window.electronAPI.openFolder()
    if (!picked) { setLinkingFolder(false); return }
    const { error } = await supabase
      .from('projects')
      .update({ local_path: picked })
      .eq('id', project.id)
    if (!error) setProject({ ...project, local_path: picked })
    setLinkingFolder(false)
  }

  async function handleDelete() {
    if (!project) return
    setDeleting(true)
    await supabase.from('agents').delete().eq('project_id', project.id)
    await supabase.from('projects').delete().eq('id', project.id)
    navigate('/projects')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-bg-base">
        <p className="text-text-muted text-sm">Loading…</p>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-screen bg-bg-base">
        <p className="text-error text-sm">Project not found.</p>
      </div>
    )
  }

  const activeAgent = agents.find((a) => a.id === activeAgentId) ?? null

  return (
    <div className="relative flex h-screen bg-bg-base overflow-hidden">
      {/* ── Sidebar ── */}
      <div className="w-52 flex flex-col bg-bg-base border-r border-border shrink-0">
        {/* Back + project header */}
        <div className="px-3 pt-3 pb-3 border-b border-border space-y-3">
          <button
            onClick={handleBackToProjects}
            className="text-xs text-text-muted hover:text-text-secondary transition-colors block text-left"
          >
            ← Projects
          </button>
          <div className="text-sm font-semibold text-text-primary truncate">
            {project.startup_name}
          </div>
          <div className="flex items-center gap-3">
            <Link
              to={`/projects/${id}/edit`}
              className="text-xs text-text-muted hover:text-text-secondary transition-colors"
            >
              Edit
            </Link>
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted">Sure?</span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-xs text-error hover:opacity-70 transition-opacity disabled:opacity-50"
                >
                  {deleting ? 'Deleting…' : 'Yes'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs text-text-muted hover:text-text-secondary transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-xs text-text-muted hover:text-error transition-colors"
              >
                Delete
              </button>
            )}
          </div>
        </div>

        {/* Agent list */}
        <div className="flex-1 overflow-y-auto py-2">
          <div className="px-3 mb-1">
            <span className="text-[10px] uppercase tracking-widest text-text-muted font-medium">
              Agents
            </span>
          </div>

          {agents.length === 0 ? (
            <p className="text-xs text-text-muted px-3 py-2">No agents yet.</p>
          ) : (
            agents.map((agent) => {
              const isActive = agent.id === activeAgentId
              const isSplit = agent.id === splitAgentId
              const status = agentStatuses[agent.id]
              const hasUnread = unreadAgentIds.has(agent.id)
              const isReady = readyAgentIds.has(agent.id)
              const dotColor = status ? STATUS_DOT[status] : 'text-text-muted'

              return (
                <div
                  key={agent.id}
                  className={`flex items-center gap-1 px-3 py-1.5 group transition-colors ${
                    isActive || isSplit
                      ? 'bg-bg-subtle'
                      : 'hover:bg-bg-subtle'
                  }`}
                >
                  <button
                    onClick={() => selectAgent(agent.id)}
                    className={`flex items-center gap-2 flex-1 min-w-0 text-left ${
                      isActive ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {status ? (
                      <span className={`text-[8px] shrink-0 ${dotColor}`}>●</span>
                    ) : (
                      <span className="w-[10px] shrink-0" />
                    )}
                    <span className="text-xs truncate">{agent.name}</span>
                  </button>
                  {isReady && (
                    <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0 animate-pulse" title="Ready" />
                  )}
                  {!isReady && hasUnread && (
                    <span className="w-2 h-2 rounded-full bg-text-muted/40 shrink-0" title="Unread output" />
                  )}
                  {activeAgentId && !isActive && (
                    <button
                      onClick={() => toggleSplit(agent.id)}
                      className={`text-[9px] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ${
                        isSplit ? 'text-agent-coding opacity-100' : 'text-text-muted'
                      }`}
                      title={isSplit ? 'Close split' : 'Open in split view'}
                    >
                      {isSplit ? '✕' : '⊞'}
                    </button>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Route a task */}
        <div className="px-3 py-3 border-t border-border">
          <form onSubmit={handleRouteTask}>
            <input
              ref={taskInputRef}
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              placeholder="Route a task…"
              className="input text-xs py-1 px-2"
            />
          </form>
          {routeReason && (
            <p className="mt-1.5 text-[10px] text-text-muted leading-snug">{routeReason}</p>
          )}
        </div>

        {/* Add agent */}
        <div className="px-3 py-2 border-t border-border">
          <Link
            to={`/projects/${id}/agents/new`}
            className="text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            + Add agent
          </Link>
        </div>
      </div>

      {/* ── Leave confirmation overlay ── */}
      {confirmLeave && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-bg-subtle border border-border rounded-xl shadow-lg p-6 w-80 space-y-4">
            <h2 className="text-sm font-semibold text-text-primary">Leave workspace?</h2>
            <p className="text-sm text-text-secondary leading-relaxed">
              You have active agent sessions running. Leaving will terminate all of them.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmLeave(false)}
                className="text-sm px-3 py-1.5 rounded border border-border text-text-secondary hover:text-text-primary transition-colors"
              >
                Stay
              </button>
              <button
                onClick={() => navigate('/projects')}
                className="text-sm px-3 py-1.5 rounded bg-error text-white hover:opacity-80 transition-opacity font-medium"
              >
                Leave & terminate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main panel ── */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Panel header */}
        <div className="flex items-center bg-bg-subtle border-b border-border shrink-0 divide-x divide-border">
          {/* Primary agent header */}
          <div className="flex items-center gap-3 px-4 py-2 flex-1 min-w-0">
            {activeAgent ? (
              <>
                <span className="text-sm font-medium text-text-primary truncate">{activeAgent.name}</span>
                {agentStatuses[activeAgent.id] && (
                  <span className={`text-xs shrink-0 ${STATUS_DOT[agentStatuses[activeAgent.id]]}`}>
                    ● {agentStatuses[activeAgent.id]}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-2 shrink-0">
                  {activeAgent.type === 'coding' && (
                    <button
                      onClick={() => window.electronAPI.terminalInput(activeAgent.id, '/sync\r')}
                      className="text-xs text-text-muted hover:text-text-primary border border-border px-2.5 py-1 rounded transition-colors"
                    >
                      Sync
                    </button>
                  )}
                  <Link
                    to={`/projects/${id}/agents/${activeAgent.id}`}
                    className="text-xs text-text-muted hover:text-text-primary border border-border px-2 py-1 rounded transition-colors"
                    title="Agent settings & connected tools"
                  >
                    ⚙
                  </Link>
                  <button
                    onClick={() => navigate(`/projects/${id}/agents/${activeAgent.id}/terminal`)}
                    className="text-xs text-text-muted hover:text-text-primary border border-border px-2 py-1 rounded transition-colors"
                    title="Expand to full screen"
                  >
                    ⛶
                  </button>
                </div>
              </>
            ) : (
              <span className="text-sm text-text-muted">Select an agent to start a session</span>
            )}
          </div>

          {/* Split agent header */}
          {splitAgentId && (() => {
            const splitAgent = agents.find((a) => a.id === splitAgentId)
            if (!splitAgent) return null
            return (
              <div className="flex items-center gap-3 px-4 py-2 flex-1 min-w-0">
                <span className="text-sm font-medium text-text-primary truncate">{splitAgent.name}</span>
                {agentStatuses[splitAgent.id] && (
                  <span className={`text-xs shrink-0 ${STATUS_DOT[agentStatuses[splitAgent.id]]}`}>
                    ● {agentStatuses[splitAgent.id]}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setSplitAgentId(null)}
                    className="text-xs text-text-muted hover:text-text-primary border border-border px-2 py-1 rounded transition-colors"
                    title="Close split"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )
          })()}
        </div>

        {/* Terminal area */}
        <div className="flex-1 flex overflow-hidden">
          {!activeAgentId && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <p className="text-text-muted text-sm mb-1">No agent selected</p>
                <p className="text-text-muted text-xs opacity-60">
                  Pick an agent from the sidebar to start a Claude Code session.
                </p>
              </div>
            </div>
          )}

          {activeAgentId && !project.local_path && (
            <div className="flex-1 flex items-center justify-center bg-bg-base">
              <div className="text-center">
                <p className="text-text-secondary text-sm mb-3">
                  Link a local folder to start a session.
                </p>
                <button
                  onClick={handleLinkFolder}
                  disabled={linkingFolder}
                  className="bg-accent hover:bg-accent-hover text-accent-text text-sm px-4 py-2 rounded font-medium transition-colors disabled:opacity-50"
                >
                  {linkingFolder ? 'Picking…' : '+ Link folder'}
                </button>
              </div>
            </div>
          )}

          {project.local_path &&
            agents
              .filter((a) => openedAgentIds.has(a.id))
              .map((agent) => {
                const isVisible = agent.id === activeAgentId || agent.id === splitAgentId
                const inSplit = isVisible && splitAgentId !== null
                return (
                  <TerminalPanel
                    key={agent.id}
                    project={project}
                    agent={agent}
                    visible={isVisible}
                    className={inSplit ? 'flex-1' : 'w-full'}
                    onStatusChange={handleStatusChange}
                    onUnreadOutput={handleUnreadOutput}
                    onReady={handleAgentReady}
                  />
                )
              })}
        </div>
      </div>
    </div>
  )
}
