/**
 * Dogfood script — initializes an agent-env environment for agent-env itself.
 *
 * Bypasses the interactive @clack/prompts flow and calls the underlying
 * functions directly. This is the canonical way to test init in CI or
 * non-TTY environments. Run from the project root:
 *
 *   npx tsx scripts/dogfood.ts
 */

import { join } from 'path'
import { makeStartupContext } from '../src/config/schema.js'
import { generate, formatResult } from '../src/config/generator.js'
import { openDb, closeDb } from '../src/state/db.js'
import { saveStartupContext } from '../src/state/startup.js'

const projectRoot = join(import.meta.dirname, '..')
const agentEnvDir = join(projectRoot, '.agent-env')

const ctx = makeStartupContext({
  startupName: 'agent-env',
  pitch:
    'Persistent specialized agent environment for solo founders — built on Claude Code with automatic context management, task routing, and reliability primitives from day one.',
  stage: 'mvp',
  stack: 'TypeScript, Node.js 24, tsx, node:sqlite, @clack/prompts, Context-RAII (SQLite session lifecycle)',
  icp:
    'Solo founders and early-stage startup teams using Claude Code who waste hours manually writing CLAUDE.md files, configuring subagents, and managing context across sessions.',
  priorities:
    'Ship Sprint 1 MVP end-to-end, run init on 5 pilot projects from the AI founder network, collect feedback that changes the product',
  bottleneck:
    'Agents start blank every session — no persistent memory of decisions, codebase conventions, or what\'s been investigated.',
})

console.log('Initializing agent-env environment for agent-env...\n')

const store = openDb(agentEnvDir)
saveStartupContext(store, ctx)
closeDb(store)

console.log('Startup context saved to .agent-env/state.db')

const result = await generate(ctx, { projectRoot, force: true })

console.log('\nGenerated files:')
console.log(formatResult(result))

console.log('\nDone. Agent environment is live.')
console.log('\nTest the router:')
console.log('  npx tsx bin/agent-env.ts route "fix the routing confidence calculation"')
console.log('  npx tsx bin/agent-env.ts route "research competing agent frameworks"')
console.log('  npx tsx bin/agent-env.ts route "write launch tweet"')
console.log('  npx tsx bin/agent-env.ts status')
