import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { supabase } from '../lib/supabase'
import { buildClaudeMd, agentCwd } from '../lib/buildClaudeMd'
import type { Project, Agent } from '../lib/types'
import '@xterm/xterm/css/xterm.css'

declare global {
  interface Window {
    electronAPI: {
      platform: string
      openFolder: () => Promise<string | null>
      readFile: (filePath: string) => Promise<string | null>
      checkClaude: () => Promise<boolean>
      writeClaudeMd: (opts: { cwd: string; content: string }) => Promise<void>
      terminalStart: (opts: { projectId: string; cwd: string; cols: number; rows: number }) => Promise<void>
      terminalInput: (projectId: string, data: string) => void
      terminalResize: (opts: { projectId: string; cols: number; rows: number }) => void
      terminalKill: (projectId: string) => void
      onTerminalOutput: (projectId: string, cb: (data: string) => void) => () => void
      onTerminalExit: (projectId: string, cb: () => void) => () => void
      notify: (title: string, body: string) => void
    }
  }
}

export default function TerminalPage() {
  const { id, agentId } = useParams<{ id: string; agentId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const autoCmd = searchParams.get('cmd')
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

      const cwd = agentCwd(proj.local_path!, ag.name)
      setCwd(cwd)
      await bootTerminal(proj, ag, cwd)
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
      term.onData((data) => api.terminalInput(ag.id, data))

      // 6. Subscribe to output
      const unsubOutput = api.onTerminalOutput(ag.id, (data) => term.write(data))
      const unsubExit = api.onTerminalExit(ag.id, () => {
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

      // 8. If an auto-command was requested (e.g. /sync), send it after claude loads
      if (autoCmd) {
        const slashCmd = autoCmd === 'sync' ? '/sync' : `/${autoCmd}`
        setTimeout(() => {
          api.terminalInput(ag.id, `${slashCmd}\r`)
        }, 4000)
      }

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
    navigate(-1)
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
