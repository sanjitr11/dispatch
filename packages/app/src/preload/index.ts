import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  // Open a native folder picker, returns the selected path or null
  openFolder: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:openFolder'),

  // Read a file from disk, returns content string or null if not found
  readFile: (filePath: string): Promise<string | null> =>
    ipcRenderer.invoke('fs:readFile', filePath),

  // Check if `claude` CLI is installed
  checkClaude: (): Promise<boolean> =>
    ipcRenderer.invoke('claude:check'),

  // Write CLAUDE.md to the project directory (optionally injecting MCP server configs)
  writeClaudeMd: (opts: {
    cwd: string
    content: string
    mcpServers?: Record<string, { command: string; args: string[]; env: Record<string, string> }>
  }): Promise<void> =>
    ipcRenderer.invoke('project:writeClaudeMd', opts),

  // Start a pty session running claude in the given directory
  terminalStart: (opts: {
    projectId: string
    cwd: string
    cols: number
    rows: number
  }): Promise<void> => ipcRenderer.invoke('terminal:start', opts),

  // Send a keystroke to the specified pty
  terminalInput: (projectId: string, data: string): void =>
    ipcRenderer.send('terminal:input', { projectId, data }),

  // Resize the pty
  terminalResize: (opts: { projectId: string; cols: number; rows: number }): void =>
    ipcRenderer.send('terminal:resize', opts),

  // Kill the pty for a project
  terminalKill: (projectId: string): void =>
    ipcRenderer.send('terminal:kill', projectId),

  // Subscribe to terminal output for a specific agent — returns an unsubscribe function
  onTerminalOutput: (projectId: string, callback: (data: string) => void): (() => void) => {
    const handler = (_: unknown, payload: { projectId: string; data: string }) => {
      if (payload.projectId === projectId) callback(payload.data)
    }
    ipcRenderer.on('terminal:output', handler)
    return () => ipcRenderer.removeListener('terminal:output', handler)
  },

  // Subscribe to terminal exit for a specific agent — returns an unsubscribe function
  onTerminalExit: (projectId: string, callback: () => void): (() => void) => {
    const handler = (_: unknown, payload: { projectId: string }) => {
      if (payload.projectId === projectId) callback()
    }
    ipcRenderer.on('terminal:exit', handler)
    return () => ipcRenderer.removeListener('terminal:exit', handler)
  },

  // Send a system notification (only shown when the window is not focused)
  notify: (title: string, body: string): void =>
    ipcRenderer.send('app:notify', { title, body }),

  // Read clipboard image; saves to a temp file and returns the path, or null if no image
  clipboardReadImagePath: (): Promise<string | null> =>
    ipcRenderer.invoke('clipboard:readImagePath'),

  // Open a URL in the system browser (used for OAuth deep-link flows)
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke('shell:openExternal', url),

  // Subscribe to OAuth callback deep-link URLs -- returns an unsubscribe function
  onAuthCallback: (callback: (url: string) => void): (() => void) => {
    const handler = (_: unknown, url: string) => callback(url)
    ipcRenderer.on('auth:callback', handler)
    return () => ipcRenderer.removeListener('auth:callback', handler)
  },
})
