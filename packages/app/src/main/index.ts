import { app, BrowserWindow, ipcMain, dialog, Notification, systemPreferences, clipboard } from 'electron'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { writeFile, readFile, mkdir, access, appendFile } from 'fs/promises'
import { tmpdir } from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as pty from 'node-pty'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const execAsync = promisify(exec)

// ── Pre-tool-use hook script (written to .agent-env/hooks/pre-tool-use.mjs) ──────
// Blocks destructive Bash commands before they run. Claude Code calls this hook
// before every Bash tool invocation; returning a non-zero exit code blocks the call.
const PRE_TOOL_USE_HOOK = `#!/usr/bin/env node
// pre-tool-use.mjs — PreToolUse hook for agent-env projects.
// Blocks a short list of high-blast-radius commands before Claude can run them.
import { readFileSync } from 'node:fs'

async function main() {
  let inputData = ''
  for await (const chunk of process.stdin) inputData += chunk

  let hookInput
  try { hookInput = JSON.parse(inputData) } catch { process.exit(0) }

  const { tool_name, tool_input } = hookInput ?? {}
  if (tool_name !== 'Bash') process.exit(0)

  const cmd = String(tool_input?.command ?? '').trim()

  const BLOCKED = [
    /rm\\s+-rf\\s+[\\/~]/,          // rm -rf / or ~/
    /curl[^|]*\\|\\s*bash/,          // curl | bash
    /wget[^|]*\\|\\s*bash/,          // wget | bash
    /:\\s*\\(\\s*\\)\\s*\\{.*\\}\\s*;\\s*:/,  // fork bomb
    /dd\\s+.*of=\\/dev\\/(s|h|nv)d/, // dd to a raw disk device
  ]

  for (const pattern of BLOCKED) {
    if (pattern.test(cmd)) {
      process.stdout.write(JSON.stringify({
        decision: 'block',
        reason: \`Blocked by agent-env pre-tool-use hook: \${pattern.toString()}\`,
      }))
      process.exit(0)
    }
  }

  process.exit(0)
}
main().catch(() => process.exit(0))
`

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

  const entry = today + ': ' + summary
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
    PreToolUse: [
      {
        matcher: 'Bash',
        hooks: [{ type: 'command', command: 'node .agent-env/hooks/pre-tool-use.mjs' }],
      },
    ],
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

  // ── Media permissions (microphone for Claude Code voice mode) ────────────────
  win.webContents.session.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media' || permission === 'microphone') {
      callback(true)
    } else {
      callback(false)
    }
  })

  // ── Clipboard: save image to temp file, return path (or null if no image) ────
  ipcMain.handle('clipboard:readImagePath', async () => {
    const image = clipboard.readImage()
    if (image.isEmpty()) return null
    const tmpPath = join(tmpdir(), `dispatch-paste-${Date.now()}.png`)
    await writeFile(tmpPath, image.toPNG())
    return tmpPath
  })

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
    mcpServers?: Record<string, { command: string; args: string[]; env: Record<string, string> }>
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

    // 2. Write hook scripts
    const hooksDir = join(opts.cwd, '.agent-env', 'hooks')
    await mkdir(hooksDir, { recursive: true })
    await writeFile(join(hooksDir, 'pre-tool-use.mjs'), PRE_TOOL_USE_HOOK, 'utf-8')
    await writeFile(join(hooksDir, 'post-session.mjs'), POST_SESSION_HOOK, 'utf-8')

    // 3. Write .claude/settings.json (merging active MCP server configs if provided)
    const claudeDir = join(opts.cwd, '.claude')
    await mkdir(claudeDir, { recursive: true })
    const settings = opts.mcpServers && Object.keys(opts.mcpServers).length > 0
      ? { ...CLAUDE_SETTINGS, mcpServers: opts.mcpServers }
      : CLAUDE_SETTINGS
    await writeFile(join(claudeDir, 'settings.json'), JSON.stringify(settings, null, 2), 'utf-8')

    // 4. Ensure .agentenv/ is in the project root's .gitignore
    // opts.cwd is <project_root>/.agentenv/<agent-slug>
    const projectRoot = dirname(dirname(opts.cwd))
    const gitignorePath = join(projectRoot, '.gitignore')
    try {
      let existing = ''
      try { existing = await readFile(gitignorePath, 'utf-8') } catch {}
      const lines = existing.split('\n').map((l) => l.trim())
      if (!lines.includes('.agentenv/')) {
        const entry = existing.length > 0 && !existing.endsWith('\n')
          ? '\n.agentenv/\n'
          : '.agentenv/\n'
        await appendFile(gitignorePath, entry, 'utf-8')
      }
    } catch { /* .gitignore write failed — not fatal */ }
  })

  // ── Read a file from disk (for session log viewer) ───────────────────────────
  ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
    try {
      return await readFile(filePath, 'utf-8')
    } catch {
      return null
    }
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
        win.webContents.send('terminal:output', { projectId: opts.projectId, data })
      }
    })

    ptyProcess.onExit(() => {
      ptyMap.delete(opts.projectId)
      if (!win.isDestroyed()) {
        win.webContents.send('terminal:exit', { projectId: opts.projectId })
      }
    })

    // Launch claude immediately
    ptyProcess.write('claude\r')
  })

  // ── Terminal: forward keystrokes ─────────────────────────────────────────────
  ipcMain.on('terminal:input', (_event, opts: { projectId: string; data: string }) => {
    const ptyProcess = ptyMap.get(opts.projectId)
    if (ptyProcess) {
      ptyProcess.write(opts.data)
    }
  })

  // ── Terminal: resize ─────────────────────────────────────────────────────────
  ipcMain.on('terminal:resize', (_event, opts: { projectId: string; cols: number; rows: number }) => {
    const ptyProcess = ptyMap.get(opts.projectId)
    if (ptyProcess) {
      ptyProcess.resize(opts.cols, opts.rows)
    }
  })

  // ── System notification ───────────────────────────────────────────────────────
  ipcMain.on('app:notify', (_event, opts: { title: string; body: string }) => {
    if (Notification.isSupported()) {
      new Notification({ title: opts.title, body: opts.body }).show()
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

app.whenReady().then(async () => {
  // Request microphone access so Claude Code voice mode works in the spawned PTY process
  if (process.platform === 'darwin') {
    await systemPreferences.askForMediaAccess('microphone')
  }
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
