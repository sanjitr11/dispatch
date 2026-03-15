/**
 * Config generator — writes all Claude Code and agent-env files to disk.
 *
 * Generates:
 *   {projectRoot}/CLAUDE.md                          Root context (auto-loaded by Claude Code)
 *   {projectRoot}/.claude/settings.json              Claude Code runtime settings
 *   {projectRoot}/.claude/commands/coding.md         /coding slash command
 *   {projectRoot}/.claude/commands/research.md       /research slash command
 *   {projectRoot}/.claude/commands/marketing.md      /marketing slash command
 *   {projectRoot}/.claude/commands/ops.md            /ops slash command
 *   {projectRoot}/.claude/commands/route.md          /route auto-router
 *   {projectRoot}/.claude/commands/sync.md           /sync  — populates coding agent via codebase analysis
 *   {projectRoot}/.claude/commands/sync-research.md  /sync-research — populates research agent via web search
 *   {projectRoot}/.agent-env/agents/coding/CLAUDE.md  Coding agent context
 *   {projectRoot}/.agent-env/agents/research/CLAUDE.md Research agent context
 *   {projectRoot}/.agent-env/agents/marketing/CLAUDE.md Marketing agent context
 *   {projectRoot}/.agent-env/agents/ops/CLAUDE.md    Ops agent context
 *
 * Invariant: Never overwrites CLAUDE.local.md — that's the user's escape hatch.
 */

import { mkdir, writeFile, readFile, access } from 'fs/promises'
import { join } from 'path'
import { StartupContext } from './schema.js'
import {
  rootClaudeMd,
  codingAgentClaudeMd,
  researchAgentClaudeMd,
  marketingAgentClaudeMd,
  opsAgentClaudeMd,
  codingCommand,
  researchCommand,
  syncCommand,
  syncResearchCommand,
  marketingCommand,
  opsCommand,
  routeCommand,
} from './templates.js'

export interface GeneratorOptions {
  projectRoot: string
  /** If true, regenerate all files even if they exist */
  force?: boolean
  /** Dry run — compute what would be written but don't touch disk */
  dryRun?: boolean
}

export interface GeneratorResult {
  written: string[]
  skipped: string[]
  errors: Array<{ path: string; error: string }>
}

const CLAUDE_CODE_SETTINGS = {
  model: 'claude-sonnet-4-6',
  cleanupPeriodDays: 30,
  permissions: {
    allow: [
      'Bash(git *)',
      'Bash(npm *)',
      'Bash(npx *)',
      'Bash(node *)',
      'Bash(tsx *)',
      'Bash(bun *)',
      'Read',
      'Write',
      'Edit',
      'Glob',
      'Grep',
      'WebFetch',
      'WebSearch',
      'Task',
    ],
    deny: [
      'Bash(rm -rf *)',
      'Bash(curl * | bash)',
      'Bash(wget * | bash)',
    ],
  },
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function safeWrite(
  path: string,
  content: string,
  options: { force?: boolean; dryRun?: boolean },
  result: GeneratorResult,
): Promise<void> {
  const exists = await fileExists(path)

  if (exists && !options.force) {
    result.skipped.push(path)
    return
  }

  if (options.dryRun) {
    result.written.push(`[dry-run] ${path}`)
    return
  }

  try {
    await writeFile(path, content, 'utf-8')
    result.written.push(path)
  } catch (err) {
    result.errors.push({ path, error: String(err) })
  }
}

export async function generate(
  ctx: StartupContext,
  options: GeneratorOptions,
): Promise<GeneratorResult> {
  const { projectRoot, force = false, dryRun = false } = options
  const result: GeneratorResult = { written: [], skipped: [], errors: [] }
  const writeOpts = { force, dryRun }

  // Create directory structure
  const dirs = [
    join(projectRoot, '.claude', 'commands'),
    join(projectRoot, '.agent-env', 'agents', 'coding'),
    join(projectRoot, '.agent-env', 'agents', 'research'),
    join(projectRoot, '.agent-env', 'agents', 'marketing'),
    join(projectRoot, '.agent-env', 'agents', 'ops'),
  ]

  if (!dryRun) {
    await Promise.all(dirs.map((d) => mkdir(d, { recursive: true })))
  }

  // ── Root CLAUDE.md ──────────────────────────────────────────────────────────
  // Always regenerate root CLAUDE.md on sync (it's fully derived from context)
  const rootMdPath = join(projectRoot, 'CLAUDE.md')
  if (!dryRun) {
    await writeFile(rootMdPath, rootClaudeMd(ctx), 'utf-8')
    result.written.push(rootMdPath)
  } else {
    result.written.push(`[dry-run] ${rootMdPath}`)
  }

  // ── .claude/settings.json ───────────────────────────────────────────────────
  await safeWrite(
    join(projectRoot, '.claude', 'settings.json'),
    JSON.stringify(CLAUDE_CODE_SETTINGS, null, 2) + '\n',
    writeOpts,
    result,
  )

  // ── Custom commands ─────────────────────────────────────────────────────────
  const commands: Array<[string, string]> = [
    ['coding.md', codingCommand(ctx)],
    ['research.md', researchCommand(ctx)],
    ['marketing.md', marketingCommand(ctx)],
    ['ops.md', opsCommand(ctx)],
    ['route.md', routeCommand(ctx)],
    ['sync.md', syncCommand(ctx)],
    ['sync-research.md', syncResearchCommand(ctx)],
  ]

  for (const [filename, content] of commands) {
    await safeWrite(
      join(projectRoot, '.claude', 'commands', filename),
      content,
      writeOpts,
      result,
    )
  }

  // ── Agent CLAUDE.md files (only write once — agents own them after that) ───
  const agentFiles: Array<[string, string]> = [
    [join('.agent-env', 'agents', 'coding', 'CLAUDE.md'), codingAgentClaudeMd(ctx)],
    [join('.agent-env', 'agents', 'research', 'CLAUDE.md'), researchAgentClaudeMd(ctx)],
    [join('.agent-env', 'agents', 'marketing', 'CLAUDE.md'), marketingAgentClaudeMd(ctx)],
    [join('.agent-env', 'agents', 'ops', 'CLAUDE.md'), opsAgentClaudeMd(ctx)],
  ]

  for (const [relPath, content] of agentFiles) {
    await safeWrite(
      join(projectRoot, relPath),
      content,
      writeOpts,
      result,
    )
  }

  return result
}

/** Regenerates only root CLAUDE.md and slash commands (not agent files). */
export async function sync(
  ctx: StartupContext,
  options: GeneratorOptions,
): Promise<GeneratorResult> {
  return generate(ctx, { ...options, force: true })
}

/** Formats generator result for display in the CLI. */
export function formatResult(result: GeneratorResult): string {
  const lines: string[] = []

  if (result.written.length > 0) {
    lines.push(`  Written (${result.written.length}):`)
    result.written.forEach((f) => lines.push(`    + ${f}`))
  }

  if (result.skipped.length > 0) {
    lines.push(`  Skipped (${result.skipped.length}) — already exist:`)
    result.skipped.forEach((f) => lines.push(`    ~ ${f}`))
  }

  if (result.errors.length > 0) {
    lines.push(`  Errors (${result.errors.length}):`)
    result.errors.forEach(({ path, error }) => lines.push(`    ✗ ${path}: ${error}`))
  }

  return lines.join('\n')
}
