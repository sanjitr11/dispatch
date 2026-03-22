import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { buildClaudeMd, agentCwd } from '../lib/buildClaudeMd'
import { buildMcpServers } from '../lib/integrations'
import { supabase } from '../lib/supabase'
import type { Project, Agent, Integration } from '../lib/types'
import '@xterm/xterm/css/xterm.css'

export type TerminalStatus = 'starting' | 'running' | 'exited' | 'error'

interface Props {
  project: Project
  agent: Agent
  visible: boolean
  autoCmd?: string
  className?: string
  onStatusChange: (agentId: string, status: TerminalStatus) => void
  onUnreadOutput: (agentId: string) => void
}

export default function TerminalPanel({
  project,
  agent,
  visible,
  autoCmd,
  className,
  onStatusChange,
  onUnreadOutput,
}: Props) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const visibleRef = useRef(visible)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [status, setStatus] = useState<TerminalStatus>('starting')
  const bootedRef = useRef(false)

  // Keep visibleRef in sync for use inside callbacks
  useEffect(() => {
    visibleRef.current = visible
  }, [visible])

  // When becoming visible: fit + focus
  useEffect(() => {
    if (visible && termRef.current && fitAddonRef.current) {
      // Small delay to let CSS show the panel before measuring
      requestAnimationFrame(() => {
        fitAddonRef.current?.fit()
        termRef.current?.focus()
      })
    }
  }, [visible])

  // Boot terminal once on mount
  useEffect(() => {
    if (bootedRef.current) return
    bootedRef.current = true
    bootTerminal()

    return () => {
      if (termRef.current) {
        ;(termRef.current as any).__cleanup?.()
        ;(termRef.current as any).__ro?.disconnect()
        termRef.current.dispose()
        termRef.current = null
      }
      window.electronAPI.terminalKill(agent.id)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function updateStatus(s: TerminalStatus) {
    setStatus(s)
    onStatusChange(agent.id, s)
  }

  async function bootTerminal() {
    try {
      const api = window.electronAPI

      // 1. Check claude is installed
      const hasClaude = await api.checkClaude()
      if (!hasClaude) {
        setErrorMsg('Claude Code not found. Install it at claude.ai/code, then try again.')
        updateStatus('error')
        return
      }

      // 2. Verify local path
      if (!project.local_path) {
        setErrorMsg('No local folder linked.')
        updateStatus('error')
        return
      }

      // 3. Write CLAUDE.md + settings.json (with active MCP servers) to the agent subfolder
      const cwd = agentCwd(project.local_path!, agent.name)
      const claudeMd = buildClaudeMd(project, agent)
      const { data: integrationsData } = await supabase
        .from('agent_integrations')
        .select('*')
        .eq('agent_id', agent.id)
        .eq('enabled', true)
      // Fetch is zero-auth — always available for web research/competitor analysis
      const mcpServers = {
        fetch: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-fetch'],
          env: {},
        },
        ...buildMcpServers((integrationsData ?? []) as Integration[]),
      }
      await api.writeClaudeMd({ cwd, content: claudeMd, mcpServers })

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
      term.onData((data) => api.terminalInput(agent.id, data))

      // 6. Subscribe to output
      const unsubOutput = api.onTerminalOutput(agent.id, (data) => {
        term.write(data)
        if (!visibleRef.current) {
          onUnreadOutput(agent.id)
        }
      })
      const unsubExit = api.onTerminalExit(agent.id, () => {
        updateStatus('exited')
        term.writeln('\r\n\x1b[33m[session ended]\x1b[0m')
      })

      ;(termRef.current as any).__cleanup = () => {
        unsubOutput()
        unsubExit()
      }

      // 7. Start the pty — keyed by agentId
      await api.terminalStart({ projectId: agent.id, cwd, cols, rows })
      updateStatus('running')
      if (visible) term.focus()

      // 8. Auto-command after claude loads
      if (autoCmd) {
        const slashCmd = autoCmd === 'sync' ? '/sync' : `/${autoCmd}`
        setTimeout(() => {
          api.terminalInput(agent.id, `${slashCmd}\r`)
        }, 4000)
      }

      // 9. Handle resize
      const ro = new ResizeObserver(() => {
        fitAddon.fit()
        const { cols: c, rows: r } = term
        api.terminalResize({ projectId: agent.id, cols: c, rows: r })
      })
      ro.observe(terminalRef.current!)
      ;(termRef.current as any).__ro = ro

    } catch (err) {
      setErrorMsg(`Terminal error: ${err instanceof Error ? err.message : String(err)}`)
      updateStatus('error')
    }
  }

  return (
    <div className={`flex flex-col h-full ${className ?? ''}`} style={{ display: visible ? 'flex' : 'none' }}>
      {status === 'error' ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-red-400 text-sm">{errorMsg}</p>
        </div>
      ) : (
        <div
          ref={terminalRef}
          className="flex-1 p-2"
          onClick={() => termRef.current?.focus()}
        />
      )}
    </div>
  )
}
