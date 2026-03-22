import { useEffect, useRef, useState } from 'react'
import { useTheme } from './ThemeProvider'
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
  onReady: (agentId: string) => void
}

const DARK_THEME = {
  background: '#0d1117',
  foreground: '#e6edf3',
  cursor: '#e6edf3',
  selectionBackground: '#264f78',
}

const LIGHT_THEME = {
  background: '#f2f1ef',
  foreground: '#1a1917',
  cursor: '#1a1917',
  selectionBackground: '#d1cfc9',
}

export default function TerminalPanel({
  project,
  agent,
  visible,
  autoCmd,
  className,
  onStatusChange,
  onUnreadOutput,
  onReady,
}: Props) {
  const { theme } = useTheme()
  const terminalRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const visibleRef = useRef(visible)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [status, setStatus] = useState<TerminalStatus>('starting')
  const bootedRef = useRef(false)
  // Notification detection
  const wasWorkingRef = useRef(false)         // true after significant output received
  const sessionActiveRef = useRef(false)      // true after first user input (skip startup noise)
  const activityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep visibleRef in sync for use inside callbacks
  useEffect(() => {
    visibleRef.current = visible
  }, [visible])

  // Update terminal theme when app theme toggles
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = theme === 'dark' ? DARK_THEME : LIGHT_THEME
    }
  }, [theme])

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
      const mcpServers: Record<string, { command: string; args: string[]; env: Record<string, string> }> = {
        fetch: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-fetch'],
          env: {},
        },
        ...buildMcpServers((integrationsData ?? []) as Integration[]),
      }
      // Filesystem + Git auto-injected for coding agents (zero-auth, scoped to project root)
      if (agent.type === 'coding' && project.local_path) {
        mcpServers['filesystem'] = {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', project.local_path],
          env: {},
        }
        mcpServers['git'] = {
          command: 'npx',
          args: ['-y', '@mseep/git-mcp-server'],
          env: {},
        }
      }
      await api.writeClaudeMd({ cwd, content: claudeMd, mcpServers })

      // 4. Mount xterm
      const isDark = document.documentElement.getAttribute('data-theme') !== 'light'
      const term = new Terminal({
        theme: isDark ? DARK_THEME : LIGHT_THEME,
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

      // 5. Forward keystrokes — activate session tracking on first submit
      term.onData((data) => {
        api.terminalInput(agent.id, data)
        if (data === '\r') {
          sessionActiveRef.current = true
          wasWorkingRef.current = false
          if (activityTimerRef.current) {
            clearTimeout(activityTimerRef.current)
            activityTimerRef.current = null
          }
        }
      })

      function maybeMarkReady() {
        if (!visibleRef.current) {
          onReady(agent.id)
        }
      }

      // 6. Subscribe to output
      const unsubOutput = api.onTerminalOutput(agent.id, (data) => {
        term.write(data)
        if (!visibleRef.current) onUnreadOutput(agent.id)

        // Only track after first user input — skip startup noise
        if (!sessionActiveRef.current) return

        // Bell character = Claude explicitly signalling it needs input
        if (data.includes('\x07')) {
          wasWorkingRef.current = false
          if (activityTimerRef.current) {
            clearTimeout(activityTimerRef.current)
            activityTimerRef.current = null
          }
          maybeMarkReady()
          return
        }

        // Track whether Claude is actively producing output
        const stripped = data.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\r/g, '')
        if (stripped.replace(/\s/g, '').length > 5) {
          wasWorkingRef.current = true
        }

        // Silence for 3s after activity = Claude is done / waiting for next message
        if (wasWorkingRef.current) {
          if (activityTimerRef.current) clearTimeout(activityTimerRef.current)
          activityTimerRef.current = setTimeout(() => {
            activityTimerRef.current = null
            if (wasWorkingRef.current) {
              wasWorkingRef.current = false
              maybeMarkReady()
            }
          }, 3000)
        }
      })
      const unsubExit = api.onTerminalExit(agent.id, () => {
        updateStatus('exited')
        term.writeln('\r\n\x1b[33m[session ended]\x1b[0m')
      })

      ;(termRef.current as any).__cleanup = () => {
        unsubOutput()
        unsubExit()
        if (activityTimerRef.current) {
          clearTimeout(activityTimerRef.current)
          activityTimerRef.current = null
        }
      }

      // 7. Start the pty — keyed by agentId
      await api.terminalStart({ projectId: agent.id, cwd, cols, rows })
      updateStatus('running')
      if (visible) term.focus()

      // 8. Auto-command after claude loads
      if (autoCmd) {
        const slashCmd = autoCmd === 'sync' ? '/sync' : `/${autoCmd}`
        setTimeout(() => {
          sessionActiveRef.current = true
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
          className="flex flex-col flex-1"
          style={{ background: theme === 'dark' ? DARK_THEME.background : LIGHT_THEME.background, padding: '8px 12px' }}
          onClick={() => termRef.current?.focus()}
        >
          <div ref={terminalRef} className="flex-1" />
        </div>
      )}
    </div>
  )
}
