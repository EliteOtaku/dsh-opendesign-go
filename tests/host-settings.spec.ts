import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { fieldWriterOf } from '../src/host-settings.ts'
import { PROFILE_ENTRY_ID } from '../src/config-contract.ts'

/**
 * Fake host settings service.
 *
 * The real service locks the profile directory and rewrites the whole
 * composition document on every `update`, which recomposes the plugin tree. That
 * cost is the reason these tests exist, so the fake counts calls rather than
 * modelling the document.
 */
interface FakeHost {
  readonly ctx: Context
  readonly updates: { ns: string, patch: Record<string, unknown>, revision?: number }[]
  readonly warnings: string[]
  /** Count of `describe` calls, to prove nothing is cached across attempts. */
  describes: number
}

interface FakeOptions {
  /** Field values the host reports, mutated by successful writes. */
  values?: Record<string, string>
  /** Revision the row reports; bumped by every successful write. */
  revision?: number
  /** Failures to raise before a write succeeds, consumed in order. */
  failures?: unknown[]
  /** Whether the entry appears in `describe()` at all. */
  present?: boolean
  /** Number of leading `describe` calls that report no row yet. */
  absentFirst?: number
}

/** Build a context whose settings service behaves like the host's. */
function fakeHost(options: FakeOptions = {}): FakeHost {
  const values: Record<string, string> = { ...options.values }
  const updates: FakeHost['updates'] = []
  const warnings: string[] = []
  const failures = [...(options.failures ?? [])]
  let revision = options.revision ?? 7
  let absent = options.absentFirst ?? 0
  const state = { describes: 0 }

  const settings = {
    writable: true,
    configure: () => () => undefined,
    describe: (): { ns: string, revision: number, value?: Record<string, unknown> }[] => {
      state.describes += 1
      if (options.present === false) return []
      if (absent > 0) {
        absent -= 1
        return []
      }
      return [{ ns: PROFILE_ENTRY_ID, revision, value: { ...values } }]
    },
    update: async (ns: string, patch: Record<string, unknown>, expected?: number): Promise<void> => {
      updates.push({ ns, patch, ...(expected === undefined ? {} : { revision: expected }) })
      const failure = failures.shift()
      if (failure !== undefined) throw failure
      for (const [key, value] of Object.entries(patch)) {
        if (typeof value === 'string') values[key] = value
      }
      revision += 1
    },
  }

  const ctx = {
    get: (name: string) => (name === 'settings' ? settings : undefined),
    logger: {
      info: () => undefined,
      warn: (message: string) => { warnings.push(message) },
      error: () => undefined,
    },
  }
  return {
    ctx: ctx as unknown as Context,
    updates,
    warnings,
    get describes() { return state.describes },
  }
}

/** A settings conflict shaped like the host's own error. */
function conflict(): Error {
  const error = new Error(`settings conflict for "${PROFILE_ENTRY_ID}"`)
  Object.assign(error, { name: 'SettingsConflictError', code: 'SETTINGS_CONFLICT', expected: 7, actual: 8 })
  return error
}

describe('fieldWriterOf', () => {
  it('does not write a value the entry already carries', async () => {
    const host = fakeHost({ values: { usageJson: '{"a":1}' } })
    const write = fieldWriterOf(host.ctx)!
    await write('usageJson', '{"a":1}')
    expect(host.updates).toHaveLength(0)
  })

  it('writes a changed value exactly once, fenced on the revision it read', async () => {
    const host = fakeHost({ values: { usageJson: '{"a":1}' }, revision: 7 })
    const write = fieldWriterOf(host.ctx)!
    await write('usageJson', '{"a":2}')
    expect(host.updates).toHaveLength(1)
    expect(host.updates[0]).toEqual({ ns: PROFILE_ENTRY_ID, patch: { usageJson: '{"a":2}' }, revision: 7 })
  })

  it('writes one snapshot only once, even while the document still reports the old value', async () => {
    // The host republishes the fiber config on recomposition, so the row can
    // keep reporting the previous value right after a successful write. A poll
    // that answers identically must not write again for that reason.
    const host = fakeHost({ values: { usageJson: '{"a":1}' } })
    const write = fieldWriterOf(host.ctx)!
    await write('usageJson', '{"a":2}')
    await write('usageJson', '{"a":2}')
    expect(host.updates).toHaveLength(1)
  })

  it('retries once when the page moved the revision, then succeeds', async () => {
    const host = fakeHost({ values: { usageJson: '{"a":1}' }, failures: [conflict()] })
    const write = fieldWriterOf(host.ctx)!
    await write('usageJson', '{"a":2}')
    expect(host.updates).toHaveLength(2)
    // The second attempt must re-read the row rather than reuse the first one.
    expect(host.describes).toBeGreaterThanOrEqual(2)
  })

  it('gives up after one conflict retry instead of looping', async () => {
    const host = fakeHost({ values: { usageJson: '{"a":1}' }, failures: [conflict(), conflict(), conflict()] })
    const write = fieldWriterOf(host.ctx)!
    await write('usageJson', '{"a":2}')
    expect(host.updates).toHaveLength(2)
    expect(host.warnings).toHaveLength(1)
  })

  it('does not retry a write that failed for a reason of its own', async () => {
    // Every retry costs a profile-level lock and a plugin-tree recomposition.
    // A malformed value will fail the same way twelve times; one attempt and a
    // warning is the right trade.
    const host = fakeHost({ values: { usageJson: '{"a":1}' }, failures: [new Error('validation failed')] })
    const write = fieldWriterOf(host.ctx)!
    await write('usageJson', '{"a":2}')
    expect(host.updates).toHaveLength(1)
    expect(host.warnings.some((line) => line.includes('could not cache usageJson'))).toBe(true)
  })

  it('waits for the entry to appear before attempting a write', async () => {
    const host = fakeHost({ absentFirst: 3, values: {} })
    const write = fieldWriterOf(host.ctx)!
    await write('usageJson', '{"a":1}')
    expect(host.updates).toHaveLength(1)
  })

  it('reports once and gives up when the entry never appears', async () => {
    const host = fakeHost({ present: false })
    const write = fieldWriterOf(host.ctx)!
    await write('usageJson', '{"a":1}')
    expect(host.updates).toHaveLength(0)
    expect(host.warnings.some((line) => line.includes(`no settings row for "${PROFILE_ENTRY_ID}"`))).toBe(true)
  })

  it('keeps one field from suppressing another', async () => {
    const host = fakeHost({ values: { usageJson: '{"a":1}', reportJson: '{"b":1}' } })
    const write = fieldWriterOf(host.ctx)!
    await write('usageJson', '{"a":2}')
    await write('reportJson', '{"b":2}')
    await write('usageJson', '{"a":2}')
    expect(host.updates.map((row) => Object.keys(row.patch)[0])).toEqual(['usageJson', 'reportJson'])
  })
})
