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
  starting: 'text-yellow-400',
  running:  'text-emerald-400',
  exited:   'text-gray-500',
  error:    'text-red-400',
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

  // Which agent's terminal is currently shown
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)
  // Which terminals have been booted (never unmounted once in)
  const [openedAgentIds, setOpenedAgentIds] = useState<Set<string>>(new Set())
  // Status per agent
  const [agentStatuses, setAgentStatuses] = useState<Record<string, TerminalStatus>>({})
  // Agents with unread output
  const [unreadAgentIds, setUnreadAgentIds] = useState<Set<string>>(new Set())
  // Split view — second agent pinned alongside active
  const [splitAgentId, setSplitAgentId] = useState<string | null>(null)
  // Task router
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
    setUnreadAgentIds((prev) => {
      const next = new Set(prev)
      next.delete(agentId)
      return next
    })
  }

  function handleStatusChange(agentId: string, status: TerminalStatus) {
    setAgentStatuses((prev) => ({ ...prev, [agentId]: status }))
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
      <div className="flex items-center justify-center h-screen bg-[#0d1117]">
        <p className="text-gray-500 text-sm">Loading…</p>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0d1117]">
        <p className="text-red-400 text-sm">Project not found.</p>
      </div>
    )
  }

  const activeAgent = agents.find((a) => a.id === activeAgentId) ?? null

  return (
    <div className="flex h-screen bg-[#0d1117] overflow-hidden">
      {/* ── Sidebar ── */}
      <div className="w-52 flex flex-col bg-[#0d1117] border-r border-[#21262d] shrink-0">
        {/* Back + project header */}
        <div className="px-3 pt-3 pb-2 border-b border-[#21262d]">
          <Link
            to="/projects"
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors block mb-2"
          >
            ← Projects
          </Link>
          <div className="text-sm font-semibold text-gray-200 truncate">
            {project.startup_name}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {STAGE_LABELS[project.stage] ?? project.stage}
          </div>
          <div className="mt-2">
            {project.local_path ? (
              <span className="text-[10px] text-gray-600 truncate block" title={project.local_path}>
                {project.local_path.split('/').pop()}
              </span>
            ) : (
              <button
                onClick={handleLinkFolder}
                disabled={linkingFolder}
                className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-50"
              >
                {linkingFolder ? 'Picking…' : '+ Link folder'}
              </button>
            )}
          </div>

          <div className="mt-2">
            <Link
              to={`/projects/${id}/edit`}
              className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
            >
              Edit project
            </Link>
          </div>

          <div className="mt-2">
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500">Sure?</span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-[10px] text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                >
                  {deleting ? 'Deleting…' : 'Yes, delete'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-[10px] text-gray-700 hover:text-red-400 transition-colors"
              >
                Delete project
              </button>
            )}
          </div>
        </div>

        {/* Agent list */}
        <div className="flex-1 overflow-y-auto py-2">
          <div className="px-3 mb-1">
            <span className="text-[10px] uppercase tracking-widest text-gray-600 font-medium">
              Agents
            </span>
          </div>

          {agents.length === 0 ? (
            <p className="text-xs text-gray-600 px-3 py-2">No agents yet.</p>
          ) : (
            agents.map((agent) => {
              const isActive = agent.id === activeAgentId
              const isSplit = agent.id === splitAgentId
              const status = agentStatuses[agent.id]
              const hasUnread = unreadAgentIds.has(agent.id)
              const dotColor = status ? STATUS_DOT[status] : 'text-gray-600'

              return (
                <div
                  key={agent.id}
                  className={`flex items-center gap-1 px-3 py-1.5 group transition-colors ${
                    isActive || isSplit
                      ? 'bg-[#161b22]'
                      : 'hover:bg-[#161b22]'
                  }`}
                >
                  {/* Select agent */}
                  <button
                    onClick={() => selectAgent(agent.id)}
                    className={`flex items-center gap-2 flex-1 min-w-0 text-left ${
                      isActive ? 'text-gray-100' : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {status ? (
                      <span className={`text-[8px] shrink-0 ${dotColor}`}>●</span>
                    ) : (
                      <span className="w-[10px] shrink-0" />
                    )}
                    <span className="text-xs truncate">{agent.name}</span>
                  </button>
                  {hasUnread && (
                    <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" title="Unread output" />
                  )}
                  {/* Split toggle — only show when there's an active agent and this isn't it */}
                  {activeAgentId && !isActive && (
                    <button
                      onClick={() => toggleSplit(agent.id)}
                      className={`text-[9px] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ${
                        isSplit ? 'text-blue-400 opacity-100' : 'text-gray-600'
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
        <div className="px-3 py-3 border-t border-[#21262d]">
          <form onSubmit={handleRouteTask}>
            <input
              ref={taskInputRef}
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              placeholder="Route a task…"
              className="w-full bg-[#161b22] border border-[#30363d] rounded px-2 py-1 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-gray-500"
            />
          </form>
          {routeReason && (
            <p className="mt-1.5 text-[10px] text-gray-500 leading-snug">{routeReason}</p>
          )}
        </div>

        {/* Add agent */}
        <div className="px-3 py-2 border-t border-[#21262d]">
          <Link
            to={`/projects/${id}/agents/new`}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            + Add agent
          </Link>
        </div>
      </div>

      {/* ── Main panel ── */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Panel header */}
        <div className="flex items-center bg-[#161b22] border-b border-[#21262d] shrink-0 divide-x divide-[#21262d]">
          {/* Primary agent header */}
          <div className="flex items-center gap-3 px-4 py-2 flex-1 min-w-0">
            {activeAgent ? (
              <>
                <span className="text-sm font-medium text-gray-200 truncate">{activeAgent.name}</span>
                {agentStatuses[activeAgent.id] && (
                  <span className={`text-xs shrink-0 ${STATUS_DOT[agentStatuses[activeAgent.id]]}`}>
                    ● {agentStatuses[activeAgent.id]}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-2 shrink-0">
                  {activeAgent.type === 'coding' && (
                    <button
                      onClick={() => window.electronAPI.terminalInput(activeAgent.id, '/sync\r')}
                      className="text-xs text-gray-500 hover:text-gray-300 border border-[#30363d] px-2.5 py-1 rounded transition-colors"
                    >
                      Sync
                    </button>
                  )}
                  <Link
                    to={`/projects/${id}/agents/${activeAgent.id}`}
                    className="text-xs text-gray-500 hover:text-gray-300 border border-[#30363d] px-2 py-1 rounded transition-colors"
                    title="Agent settings & connected tools"
                  >
                    ⚙
                  </Link>
                  <button
                    onClick={() => navigate(`/projects/${id}/agents/${activeAgent.id}/terminal`)}
                    className="text-xs text-gray-500 hover:text-gray-300 border border-[#30363d] px-2 py-1 rounded transition-colors"
                    title="Expand to full screen"
                  >
                    ⛶
                  </button>
                </div>
              </>
            ) : (
              <span className="text-sm text-gray-600">Select an agent to start a session</span>
            )}
          </div>

          {/* Split agent header — only shown when split is active */}
          {splitAgentId && (() => {
            const splitAgent = agents.find((a) => a.id === splitAgentId)
            if (!splitAgent) return null
            return (
              <div className="flex items-center gap-3 px-4 py-2 flex-1 min-w-0">
                <span className="text-sm font-medium text-gray-200 truncate">{splitAgent.name}</span>
                {agentStatuses[splitAgent.id] && (
                  <span className={`text-xs shrink-0 ${STATUS_DOT[agentStatuses[splitAgent.id]]}`}>
                    ● {agentStatuses[splitAgent.id]}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setSplitAgentId(null)}
                    className="text-xs text-gray-500 hover:text-gray-300 border border-[#30363d] px-2 py-1 rounded transition-colors"
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
          {/* No-selection placeholder */}
          {!activeAgentId && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <p className="text-gray-600 text-sm mb-1">No agent selected</p>
                <p className="text-gray-700 text-xs">
                  Pick an agent from the sidebar to start a Claude Code session.
                </p>
              </div>
            </div>
          )}

          {/* Missing folder prompt — show if no local_path and an agent is selected */}
          {activeAgentId && !project.local_path && (
            <div className="flex-1 flex items-center justify-center bg-[#0d1117]">
              <div className="text-center">
                <p className="text-gray-400 text-sm mb-3">
                  Link a local folder to start a session.
                </p>
                <button
                  onClick={handleLinkFolder}
                  disabled={linkingFolder}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded font-medium transition-colors disabled:opacity-50"
                >
                  {linkingFolder ? 'Picking…' : '+ Link folder'}
                </button>
              </div>
            </div>
          )}

          {/* Render a TerminalPanel for each opened agent — CSS hide/show, never unmount.
              In split mode both active + split panels are visible side by side. */}
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
                  />
                )
              })}
        </div>
      </div>
    </div>
  )
}
