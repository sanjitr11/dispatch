/**
 * agent-env CLI entry point
 *
 * Usage:
 *   agent-env init                    Initialize a new agent environment
 *   agent-env sync                    Regenerate configs from stored context
 *   agent-env update [field]          Update startup context fields without re-init
 *   agent-env route <task>            Route a task to the correct agent
 *   agent-env status                  Show current startup context
 */

// Suppress node:sqlite ExperimentalWarning before any imports touch sqlite.
// Static imports are hoisted in ESM, so we use dynamic imports below to ensure
// this patch runs first.
const _emitWarning = process.emitWarning.bind(process)
;(process as any).emitWarning = (warning: string | Error, ...args: unknown[]) => {
  const msg = typeof warning === 'string' ? warning : (warning as Error).message
  if (msg.includes('SQLite')) return
  if (typeof warning === 'string') {
    _emitWarning(warning, ...(args as [string?, string?, Function?]))
  } else {
    _emitWarning(warning, ...(args as [string?, string?, Function?]))
  }
}

// Dynamic imports so the warning patch above runs first (static imports are hoisted).
const { join, resolve } = await import('path')
const { default: pc } = await import('picocolors')
const { runInit } = await import('../src/cli/init.js')
const { runSync } = await import('../src/cli/sync.js')
const { runUpdate } = await import('../src/cli/update.js')
const { route, formatRoutingDecision } = await import('../src/cli/route.js')
const { openDb, closeDb, loadStartupContext, STAGE_LABELS } = await import('@agent-env/shared')

const [, , command, ...cliArgs] = process.argv
const projectRoot = resolve(process.cwd())

async function main(): Promise<void> {
  switch (command) {
    case 'init': {
      await runInit(projectRoot)
      break
    }

    case 'sync': {
      await runSync(projectRoot)
      break
    }

    case 'update': {
      const field = cliArgs[0] ?? undefined
      await runUpdate(projectRoot, field)
      break
    }

    case 'route': {
      const task = cliArgs.join(' ').trim()
      if (!task) {
        console.error(pc.red('Usage: agent-env route <task description>'))
        process.exit(1)
      }
      const decision = route(task)
      console.log('')
      console.log(formatRoutingDecision(decision))
      console.log('')
      break
    }

    case 'status': {
      const agentEnvDir = join(projectRoot, '.agent-env')
      const store = openDb(agentEnvDir)
      const ctx = loadStartupContext(store)
      closeDb(store)

      if (!ctx) {
        console.log(pc.yellow('No agent environment found in this directory.'))
        console.log(pc.dim('Run `agent-env init` to set one up.'))
        process.exit(1)
      }

      console.log('')
      console.log(pc.bold(ctx.startupName))
      console.log(pc.dim(ctx.pitch))
      console.log('')
      console.log(`Stage:      ${STAGE_LABELS[ctx.stage]}`)
      console.log(`Stack:      ${ctx.stack}`)
      console.log(`ICP:        ${ctx.icp}`)
      console.log(`Priorities: ${ctx.priorities}`)
      if (ctx.bottleneck) console.log(`Bottleneck: ${ctx.bottleneck}`)
      console.log('')
      console.log(pc.dim(`Last updated: ${ctx.updatedAt} (v${ctx.version})`))
      console.log('')
      break
    }

    default: {
      console.log('')
      console.log(pc.bold('agent-env') + pc.dim(' — persistent agent environment for startups'))
      console.log('')
      console.log('Commands:')
      console.log(`  ${pc.cyan('init')}                 Initialize a new agent environment in the current directory`)
      console.log(`  ${pc.cyan('sync')}                 Regenerate configs from stored startup context`)
      console.log(`  ${pc.cyan('update')} [field]       Update startup context fields without re-init`)
      console.log(`  ${pc.cyan('route')} <task>         Route a task to the correct agent`)
      console.log(`  ${pc.cyan('status')}               Show current startup context`)
      console.log('')
      console.log('Examples:')
      console.log(`  agent-env init`)
      console.log(`  agent-env route "fix the auth bug in the login flow"`)
      console.log(`  agent-env route "@research which database should we use for time-series data?"`)
      console.log('')
      if (command && command !== '--help' && command !== '-h') {
        console.error(pc.red(`Unknown command: ${command}`))
        process.exit(1)
      }
      break
    }
  }
}

main().catch((err) => {
  console.error(pc.red('Error:'), err instanceof Error ? err.message : String(err))
  process.exit(1)
})
