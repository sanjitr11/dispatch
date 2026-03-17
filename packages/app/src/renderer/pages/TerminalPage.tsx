import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { supabase } from '../lib/supabase'
import { AGENT_META } from '../lib/agentMeta'
import type { Project, Agent } from '../lib/types'
import '@xterm/xterm/css/xterm.css'

declare global {
  interface Window {
    electronAPI: {
      platform: string
      openFolder: () => Promise<string | null>
      checkClaude: () => Promise<boolean>
      writeClaudeMd: (opts: { cwd: string; content: string }) => Promise<void>
      terminalStart: (opts: { projectId: string; cwd: string; cols: number; rows: number }) => Promise<void>
      terminalInput: (data: string) => void
      terminalResize: (opts: { projectId: string; cols: number; rows: number }) => void
      terminalKill: (projectId: string) => void
      onTerminalOutput: (cb: (data: string) => void) => () => void
      onTerminalExit: (cb: () => void) => () => void
    }
  }
}

function agentSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

export default function TerminalPage() {
  const { id, agentId } = useParams<{ id: string; agentId: string }>()
  const navigate = useNavigate()
  const terminalRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [agent, setAgent] = useState<Agent | null>(null)
  const [cwd, setCwd] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'starting' | 'running' | 'exited' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Load project + agent and boot terminal
  useEffect(() => {
    if (!id || !agentId) return

    Promise.all([
      supabase.from('projects').select('*').eq('id', id).single(),
      supabase.from('agents').select('*').eq('id', agentId).single(),
    ]).then(async ([projRes, agentRes]) => {
      if (projRes.error || !projRes.data) {
        setErrorMsg(projRes.error?.message ?? 'Project not found')
        setStatus('error')
        return
      }
      if (agentRes.error || !agentRes.data) {
        setErrorMsg(agentRes.error?.message ?? 'Agent not found')
        setStatus('error')
        return
      }

      const proj = projRes.data
      const ag = agentRes.data
      setProject(proj)
      setAgent(ag)

      const agentCwd = `${proj.local_path}/${agentSlug(ag.name)}`
      setCwd(agentCwd)
      await bootTerminal(proj, ag, agentCwd)
    })
  }, [id, agentId])

  async function bootTerminal(proj: Project, ag: Agent, agentCwd: string) {
    if (termRef.current) return  // already booted
    setStatus('starting')

    try {
      const api = window.electronAPI

      // 1. Check claude is installed
      const hasClaude = await api.checkClaude()
      if (!hasClaude) {
        setErrorMsg('Claude Code not found. Install it at claude.ai/code, then try again.')
        setStatus('error')
        return
      }

      // 2. Make sure we have a local path
      if (!proj.local_path) {
        setErrorMsg('No local folder linked. Go back and click "Open in Claude Code" from the agent page.')
        setStatus('error')
        return
      }

      // 3. Write CLAUDE.md to the agent subfolder
      const claudeMd = buildClaudeMd(proj, ag)
      await api.writeClaudeMd({ cwd: agentCwd, content: claudeMd })

      // 4. Mount xterm
      const term = new Terminal({
        theme: {
          background: '#0d1117',
          foreground: '#e6edf3',
          cursor: '#e6edf3',
          selectionBackground: '#264f78',
        },
        fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", monospace',
        fontSize: 13,
        lineHeight: 1.4,
        cursorBlink: true,
      })
      const fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.open(terminalRef.current!)
      fitAddon.fit()
      termRef.current = term
      fitAddonRef.current = fitAddon

      const { cols, rows } = term

      // 5. Forward keystrokes
      term.onData((data) => api.terminalInput(data))

      // 6. Subscribe to output
      const unsubOutput = api.onTerminalOutput((data) => term.write(data))
      const unsubExit = api.onTerminalExit(() => {
        setStatus('exited')
        term.writeln('\r\n\x1b[33m[session ended]\x1b[0m')
      })

      // Store cleanup refs
      ;(termRef.current as any).__cleanup = () => {
        unsubOutput()
        unsubExit()
      }

      // 7. Start the pty — keyed by agentId so multiple agents can run in parallel
      await api.terminalStart({ projectId: ag.id, cwd: agentCwd, cols, rows })
      setStatus('running')
      term.focus()

      // 8. Handle resize
      const ro = new ResizeObserver(() => {
        fitAddon.fit()
        const { cols, rows } = term
        api.terminalResize({ projectId: ag.id, cols, rows })
      })
      ro.observe(terminalRef.current!)
      ;(termRef.current as any).__ro = ro

    } catch (err) {
      setErrorMsg(`Terminal error: ${err instanceof Error ? err.message : String(err)}`)
      setStatus('error')
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (termRef.current) {
        ;(termRef.current as any).__cleanup?.()
        ;(termRef.current as any).__ro?.disconnect()
        termRef.current.dispose()
        termRef.current = null
      }
      if (agentId) window.electronAPI.terminalKill(agentId)
    }
  }, [agentId])

  function handleBack() {
    if (agentId) window.electronAPI.terminalKill(agentId)
    navigate(`/projects/${id}/agents/${agentId}`)
  }

  return (
    <div className="flex flex-col h-screen bg-[#0d1117]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 bg-[#161b22] border-b border-[#30363d] shrink-0">
        <button
          onClick={handleBack}
          className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
        >
          ← back
        </button>
        <span className="text-xs text-gray-500">
          {agent?.name ?? '…'}{cwd ? ` · ${cwd}` : ''}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {status === 'starting' && (
            <span className="text-xs text-yellow-400">starting…</span>
          )}
          {status === 'running' && (
            <span className="text-xs text-green-400">● running</span>
          )}
          {status === 'exited' && (
            <span className="text-xs text-gray-500">exited</span>
          )}
        </div>
      </div>

      {/* Error state */}
      {status === 'error' && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm">
            <p className="text-red-400 text-sm mb-4">{errorMsg}</p>
            <button
              onClick={handleBack}
              className="text-xs text-gray-400 hover:text-gray-200"
            >
              ← go back
            </button>
          </div>
        </div>
      )}

      {/* Terminal */}
      <div
        ref={terminalRef}
        className="flex-1 p-2"
        style={{ display: status === 'error' ? 'none' : 'block' }}
        onClick={() => termRef.current?.focus()}
      />
    </div>
  )
}

// ── Build CLAUDE.md from project + agent data ───────────────────────────────

function buildClaudeMd(p: Project, ag: Agent): string {
  const stageLabels: Record<string, string> = {
    idea: 'Pre-product / exploring the problem space',
    mvp: 'Building the first version',
    early: 'Have users, iterating toward PMF',
    revenue: 'Revenue exists, scaling what works',
    scaling: 'Scaling teams, infra, and GTM',
  }
  const stageTone: Record<string, string> = {
    idea: 'Validate before building. Speed of learning > speed of shipping.',
    mvp: 'Ship to learn. Speed > polish. Every decision is reversible.',
    early: 'Listen to users. Fix what breaks PMF. Ignore everything else.',
    revenue: "Double down on what works. Kill what doesn't.",
    scaling: "Systematize. Hire for leverage. Protect what's working.",
  }

  const priorityItems = p.priorities
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)

  const priorities = priorityItems.map((s, i) => `${i + 1}. ${s}`).join('\n')
  const prioritiesInline = priorityItems.join(', ')

  const agentRole = AGENT_META[ag.type].role
  const instructionsSection = ag.instructions ? `\n${ag.instructions}` : ''

  return `# ${p.startup_name} — ${ag.name}

## Role
${agentRole}${instructionsSection}

**Session start protocol:** When you begin a new conversation, before
the user types anything, introduce yourself with:
"${ag.name} ready. Working on ${p.startup_name} — ${p.pitch.split('\n')[0]}. Current priorities: ${prioritiesInline}. What are we building today?"

This makes it immediately clear to the founder that their startup
context loaded correctly.

**Before ending your session, always append a one-line summary to the
Session Log at the bottom of this file using the Write tool.**

## Startup Context

### What We're Building
${p.pitch}

### Stage
${stageLabels[p.stage]} — ${stageTone[p.stage]}

### Tech Stack
${p.stack}

### Ideal Customer
${p.icp}

### Current Priorities
${priorities}
${p.bottleneck ? `\n### Biggest Bottleneck\n${p.bottleneck}` : ''}

## Session Log
*(append: \`YYYY-MM-DD: [one-line summary of what was done]\`)*
*(A post-session hook also writes here automatically as a fallback.)*

---
*Synced from agent-env on ${new Date().toISOString().slice(0, 10)}.*
`
}
