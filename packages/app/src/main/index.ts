import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { writeFile, readFile, mkdir, access } from 'fs/promises'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as pty from 'node-pty'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const execAsync = promisify(exec)

// ── Post-session Stop hook script (written to .agent-env/hooks/post-session.mjs) ──
const POST_SESSION_HOOK = `#!/usr/bin/env node
// post-session.mjs — Stop hook for accumulating agent session memory.
// Fires after every Claude Code session. Writes a dated one-line summary
// to the ## Session Log section of CLAUDE.md (unless Claude already did).
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

async function main() {
  let inputData = ''
  for await (const chunk of process.stdin) inputData += chunk

  let hookInput
  try { hookInput = JSON.parse(inputData) } catch { process.exit(0) }

  const { cwd, transcript_path } = hookInput ?? {}
  if (!cwd) process.exit(0)

  const claudeMdPath = join(cwd, 'CLAUDE.md')
  let claudeMd
  try { claudeMd = readFileSync(claudeMdPath, 'utf-8') } catch { process.exit(0) }

  const today = new Date().toISOString().slice(0, 10)
  const sessionLogIdx = claudeMd.indexOf('## Session Log')

  // Parse transcript and build summary. Exit silently if no real work was done.
  let summary = null
  if (transcript_path) {
    try {
      const lines = readFileSync(transcript_path, 'utf-8').split('\\n').filter(Boolean)
      const written = new Set()
      const edited = new Set()
      const commands = []
      for (const line of lines) {
        let msg
        try { msg = JSON.parse(line) } catch { continue }
        if (msg.type !== 'assistant') continue
        const content = msg.message?.content
        if (!Array.isArray(content)) continue
        for (const block of content) {
          if (block.type !== 'tool_use') continue
          const { name, input = {} } = block
          if (name === 'Write' && input.file_path) written.add(input.file_path.split('/').pop())
          else if (name === 'Edit' && input.file_path) edited.add(input.file_path.split('/').pop())
          else if (name === 'Bash' && input.command) commands.push(String(input.command).slice(0, 60))
        }
      }
      const parts = []
      if (written.size) parts.push('wrote ' + [...written].join(', '))
      if (edited.size) parts.push('edited ' + [...edited].join(', '))
      if (commands.length) {
        const extra = commands.length - 1
        parts.push('ran: ' + commands[0] + (extra > 0 ? \` (+\${extra} more)\` : ''))
      }
      if (parts.length) summary = parts.join('; ')
    } catch { /* transcript parse failed — skip */ }
  }

  // No real tool-use work detected — exit without writing anything.
  if (!summary) process.exit(0)

  const entry = today + ': ' + (summary as string)
  const hintPattern = '*(append: \`YYYY-MM-DD: [one-line summary of what was done]\`)*'
  let updated
  if (sessionLogIdx !== -1) {
    const hintIdx = claudeMd.indexOf(hintPattern, sessionLogIdx)
    if (hintIdx !== -1) {
      const after = hintIdx + hintPattern.length
      updated = claudeMd.slice(0, after) + '\\n' + entry + claudeMd.slice(after)
    } else {
      const nextSection = claudeMd.indexOf('\\n## ', sessionLogIdx + 1)
      if (nextSection !== -1) {
        updated = claudeMd.slice(0, nextSection) + '\\n' + entry + claudeMd.slice(nextSection)
      } else {
        updated = claudeMd.trimEnd() + '\\n' + entry + '\\n'
      }
    }
  } else {
    updated = claudeMd.trimEnd() + '\\n\\n## Session Log\\n' + entry + '\\n'
  }

  writeFileSync(claudeMdPath, updated, 'utf-8')
}
main().catch(() => process.exit(0))
`

const CLAUDE_SETTINGS = {
  model: 'claude-sonnet-4-6',
  permissions: {
    allow: [
      'Bash(git *)', 'Bash(npm *)', 'Bash(npx *)', 'Bash(node *)',
      'Bash(tsx *)', 'Bash(bun *)', 'Read', 'Write', 'Edit',
      'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Task',
    ],
    deny: ['Bash(rm -rf *)', 'Bash(curl * | bash)', 'Bash(wget * | bash)'],
  },
  hooks: {
    Stop: [{ hooks: [{ type: 'command', command: 'node .agent-env/hooks/post-session.mjs' }] }],
  },
}

// Active pty processes keyed by projectId
const ptyMap = new Map<string, pty.IPty>()

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // ── Dialog: pick a local folder ─────────────────────────────────────────────
  ipcMain.handle('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select project folder',
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // ── Check if `claude` CLI is installed ───────────────────────────────────────
  ipcMain.handle('claude:check', async () => {
    try {
      await execAsync('which claude')
      return true
    } catch {
      return false
    }
  })

  // ── Write CLAUDE.md to the project directory ─────────────────────────────────
  ipcMain.handle('project:writeClaudeMd', async (_event, opts: {
    cwd: string
    content: string
  }) => {
    await mkdir(opts.cwd, { recursive: true })

    // 1. Preserve existing ## Session Log across overwrites
    let newContent = opts.content
    try {
      const existing = await readFile(join(opts.cwd, 'CLAUDE.md'), 'utf-8')
      const SESSION_MARKER = '## Session Log'
      const existingLogIdx = existing.indexOf(SESSION_MARKER)
      if (existingLogIdx !== -1) {
        const preserved = existing.slice(existingLogIdx)
        // Strip the fresh (hint-only) Session Log from incoming content
        const incomingLogIdx = newContent.indexOf(SESSION_MARKER)
        if (incomingLogIdx !== -1) {
          newContent = newContent.slice(0, incomingLogIdx).trimEnd()
        } else {
          newContent = newContent.trimEnd()
        }
        newContent += '\n\n' + preserved
      }
    } catch {
      // File not found on first open — use opts.content as-is
    }

    await writeFile(join(opts.cwd, 'CLAUDE.md'), newContent, 'utf-8')

    // 2. Write Stop hook script
    const hooksDir = join(opts.cwd, '.agent-env', 'hooks')
    await mkdir(hooksDir, { recursive: true })
    await writeFile(join(hooksDir, 'post-session.mjs'), POST_SESSION_HOOK, 'utf-8')

    // 3. Write .claude/settings.json
    const claudeDir = join(opts.cwd, '.claude')
    await mkdir(claudeDir, { recursive: true })
    await writeFile(join(claudeDir, 'settings.json'), JSON.stringify(CLAUDE_SETTINGS, null, 2), 'utf-8')
  })

  // ── Terminal: start a pty running claude ─────────────────────────────────────
  ipcMain.handle('terminal:start', async (_event, opts: {
    projectId: string
    cwd: string
    cols: number
    rows: number
  }) => {
    // Kill any existing pty for this project
    const existing = ptyMap.get(opts.projectId)
    if (existing) {
      try { existing.kill() } catch {}
      ptyMap.delete(opts.projectId)
    }

    // Ensure the cwd exists (agent subfolders may not yet exist)
    await mkdir(opts.cwd, { recursive: true })

    const shell = process.env['SHELL'] || '/bin/zsh'
    const cols = Math.max(opts.cols || 80, 1)
    const rows = Math.max(opts.rows || 24, 1)
    console.log('[terminal:start] shell=%s cwd=%s cols=%d rows=%d', shell, opts.cwd, cols, rows)
    const env = { ...process.env }
    delete env['CLAUDECODE']
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: opts.cwd,
      env,
    })

    ptyMap.set(opts.projectId, ptyProcess)

    ptyProcess.onData((data) => {
      if (!win.isDestroyed()) {
        win.webContents.send('terminal:output', data)
      }
    })

    ptyProcess.onExit(() => {
      ptyMap.delete(opts.projectId)
      if (!win.isDestroyed()) {
        win.webContents.send('terminal:exit')
      }
    })

    // Launch claude immediately
    ptyProcess.write('claude\r')
  })

  // ── Terminal: forward keystrokes ─────────────────────────────────────────────
  ipcMain.on('terminal:input', (_event, data: string) => {
    // Find the most recently started pty
    const entries = [...ptyMap.values()]
    if (entries.length > 0) {
      entries[entries.length - 1].write(data)
    }
  })

  // ── Terminal: resize ─────────────────────────────────────────────────────────
  ipcMain.on('terminal:resize', (_event, opts: { projectId: string; cols: number; rows: number }) => {
    const ptyProcess = ptyMap.get(opts.projectId)
    if (ptyProcess) {
      ptyProcess.resize(opts.cols, opts.rows)
    }
  })

  // ── Terminal: kill ───────────────────────────────────────────────────────────
  ipcMain.on('terminal:kill', (_event, projectId: string) => {
    const ptyProcess = ptyMap.get(projectId)
    if (ptyProcess) {
      try { ptyProcess.kill() } catch {}
      ptyMap.delete(projectId)
    }
  })
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
