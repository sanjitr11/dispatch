/**
 * Update command — update individual startup context fields without re-running init.
 *
 * Usage:
 *   agent-env update              # interactive — pick which fields to change
 *   agent-env update stage        # jump straight to stage prompt
 *   agent-env update priorities   # jump straight to priorities prompt
 *
 * After updating, runs sync automatically so all generated files reflect the new context.
 */

import * as p from '@clack/prompts'
import pc from 'picocolors'
import { join } from 'path'

import {
  Stage,
  STAGE_LABELS,
  generate,
  formatResult,
  openDb,
  closeDb,
  loadStartupContext,
  updateStartupContext,
} from '@agent-env/shared'
import type { StartupContext } from '@agent-env/shared'

const UPDATABLE_FIELDS = [
  { value: 'stage',      label: 'Stage',       hint: 'Current startup stage' },
  { value: 'priorities', label: 'Priorities',   hint: 'Top 1–3 priorities right now' },
  { value: 'stack',      label: 'Tech stack',   hint: 'Primary technologies' },
  { value: 'pitch',      label: 'Pitch',        hint: 'One-sentence description' },
  { value: 'icp',        label: 'ICP',          hint: 'Ideal customer and their core pain' },
  { value: 'bottleneck', label: 'Bottleneck',   hint: 'What\'s slowing you down most (optional)' },
] as const

type UpdatableField = typeof UPDATABLE_FIELDS[number]['value']

export async function runUpdate(projectRoot: string, targetField?: string): Promise<void> {
  const agentEnvDir = join(projectRoot, '.agent-env')

  console.log('')
  p.intro(pc.bgCyan(pc.black(' agent-env update ')))

  const store = openDb(agentEnvDir)
  const ctx = loadStartupContext(store)

  if (!ctx) {
    p.cancel('No startup context found. Run `agent-env init` first.')
    closeDb(store)
    process.exit(1)
  }

  p.log.info(`Updating context for ${pc.bold(ctx.startupName)} (v${ctx.version})`)

  // ── Determine which fields to update ─────────────────────────────────────────
  let fieldsToUpdate: UpdatableField[]

  if (targetField) {
    const valid = UPDATABLE_FIELDS.find((f) => f.value === targetField)
    if (!valid) {
      p.cancel(`Unknown field "${targetField}". Valid fields: ${UPDATABLE_FIELDS.map((f) => f.value).join(', ')}`)
      closeDb(store)
      process.exit(1)
    }
    fieldsToUpdate = [targetField as UpdatableField]
  } else {
    const selected = await p.multiselect<UpdatableField>({
      message: 'Which fields do you want to update?',
      options: UPDATABLE_FIELDS.map((f) => ({
        value: f.value,
        label: f.label,
        hint: f.hint,
      })),
      required: true,
    })
    if (p.isCancel(selected)) {
      p.cancel('Update cancelled.')
      closeDb(store)
      process.exit(0)
    }
    fieldsToUpdate = selected as UpdatableField[]
  }

  // ── Prompt for each selected field ────────────────────────────────────────────
  const updates: Partial<Omit<StartupContext, 'createdAt' | 'version'>> = {}

  for (const field of fieldsToUpdate) {
    if (field === 'stage') {
      const value = await p.select<Stage>({
        message: 'What stage are you at now?',
        options: [
          { value: 'idea',    label: 'Pre-product',   hint: 'Exploring the problem space' },
          { value: 'mvp',     label: 'Building MVP',  hint: 'Actively building the first version' },
          { value: 'early',   label: 'Early users',   hint: 'Have users, iterating toward PMF' },
          { value: 'revenue', label: 'Revenue',       hint: 'Revenue exists, scaling what works' },
          { value: 'scaling', label: 'Scaling',       hint: 'Scaling teams, infra, and GTM' },
        ],
        initialValue: ctx.stage,
      })
      if (p.isCancel(value)) { p.cancel('Update cancelled.'); closeDb(store); process.exit(0) }
      updates.stage = value as Stage

    } else if (field === 'priorities') {
      const value = await p.text({
        message: 'What are your top 1–3 priorities right now?',
        placeholder: 'e.g. Ship MVP, get 5 pilot users, close first paying customer',
        initialValue: ctx.priorities,
        validate: (v) => (v.trim().length < 5 ? 'Enter at least one priority' : undefined),
      })
      if (p.isCancel(value)) { p.cancel('Update cancelled.'); closeDb(store); process.exit(0) }
      updates.priorities = (value as string).trim()

    } else if (field === 'stack') {
      const value = await p.text({
        message: 'What\'s your primary tech stack?',
        placeholder: 'e.g. TypeScript, Next.js, PostgreSQL, Vercel',
        initialValue: ctx.stack,
        validate: (v) => (v.trim().length < 2 ? 'Enter at least one technology' : undefined),
      })
      if (p.isCancel(value)) { p.cancel('Update cancelled.'); closeDb(store); process.exit(0) }
      updates.stack = (value as string).trim()

    } else if (field === 'pitch') {
      const value = await p.text({
        message: 'Describe what you\'re building in one sentence.',
        placeholder: 'e.g. Persistent specialized agents for solo founders built on Claude Code',
        initialValue: ctx.pitch,
        validate: (v) => (v.trim().length < 10 ? 'Give a bit more detail (10 chars min)' : undefined),
      })
      if (p.isCancel(value)) { p.cancel('Update cancelled.'); closeDb(store); process.exit(0) }
      updates.pitch = (value as string).trim()

    } else if (field === 'icp') {
      const value = await p.text({
        message: 'Who is your ideal customer and what\'s their core pain?',
        placeholder: 'e.g. Solo founders who waste hours managing Claude Code context manually',
        initialValue: ctx.icp,
        validate: (v) => (v.trim().length < 10 ? 'Describe the customer and their pain (10 chars min)' : undefined),
      })
      if (p.isCancel(value)) { p.cancel('Update cancelled.'); closeDb(store); process.exit(0) }
      updates.icp = (value as string).trim()

    } else if (field === 'bottleneck') {
      const value = await p.text({
        message: 'What\'s the one thing slowing you down most? (press Enter to clear)',
        placeholder: 'e.g. Context management — agents start blank every session',
        initialValue: ctx.bottleneck ?? '',
      })
      if (p.isCancel(value)) { p.cancel('Update cancelled.'); closeDb(store); process.exit(0) }
      updates.bottleneck = (value as string).trim() || undefined
    }
  }

  // ── Persist ───────────────────────────────────────────────────────────────────
  const spinner = p.spinner()
  spinner.start('Saving and regenerating configuration...')

  const updated = updateStartupContext(store, updates)
  const result = await generate(updated, { projectRoot, force: false })

  spinner.stop('Done.')

  // ── Summary ───────────────────────────────────────────────────────────────────
  const changed = fieldsToUpdate.map((f) => {
    const label = UPDATABLE_FIELDS.find((x) => x.value === f)!.label
    const newVal = f === 'stage'
      ? STAGE_LABELS[updated.stage]
      : String((updated as Record<string, unknown>)[f] ?? '(cleared)')
    return `${label}: ${pc.green(newVal)}`
  })

  p.note(
    [
      ...changed,
      '',
      'Files regenerated:',
      formatResult(result),
    ].join('\n'),
    `Updated to v${updated.version}`,
  )

  p.outro(pc.green('Context updated. All agents will load the new context on next session.'))

  closeDb(store)
}
