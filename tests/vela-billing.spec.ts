import { describe, expect, it } from 'vitest'
import { readVelaUsage } from '../src/vela-billing.ts'

/**
 * These tests exercise the failure paths only.
 *
 * A successful read needs a real `vela` binary with a live login, which a test
 * cannot assume. What must be pinned is the opposite: a broken or absent CLI
 * yields a snapshot carrying `error` and never a fabricated number, because a
 * wrong quota bar is worse than an absent one.
 */
describe('readVelaUsage', () => {
  it('reports a missing binary as an error snapshot, not a throw', async () => {
    const snapshot = await readVelaUsage('/definitely/not/here/vela', 'ws-1')
    expect(snapshot.error).toBeDefined()
    expect(snapshot.windows).toEqual([])
    expect(snapshot.eligible).toBe(false)
  })

  it('still carries a timestamp so the page can show when it tried', async () => {
    const snapshot = await readVelaUsage('/definitely/not/here/vela', 'ws-1')
    expect(Number.isNaN(Date.parse(snapshot.asOf))).toBe(false)
  })

  it('explains an undetermined workspace instead of guessing one', async () => {
    // No explicit id and a binary that cannot answer means the workspace is
    // genuinely unknown; inventing one would read someone else's numbers.
    const snapshot = await readVelaUsage('/definitely/not/here/vela', undefined)
    expect(snapshot.error).toBeDefined()
    expect(snapshot.windows).toEqual([])
  })
})

describe('resolveWorkspaceId', () => {
  it('prefers a plausible explicit id without calling the CLI', async () => {
    const { resolveWorkspaceId } = await import('../src/vela-billing.ts')
    // A missing binary would make any CLI call fail; returning the explicit id
    // proves the call is skipped.
    expect(await resolveWorkspaceId('/definitely/not/here/vela', ' t7jg9xed43n5kuw6oq23n2xn '))
      .toBe('t7jg9xed43n5kuw6oq23n2xn')
  })

  it('ignores a value that cannot be a workspace id instead of failing on it', async () => {
    const { resolveWorkspaceId } = await import('../src/vela-billing.ts')
    // The field is free text and has held values like "test". Passing that to
    // the CLI guarantees a failure that reads like a login problem, while the
    // real workspace was discoverable all along.
    expect(await resolveWorkspaceId('/definitely/not/here/vela', 'test')).toBeUndefined()
  })

  it('returns undefined rather than guessing when the CLI cannot answer', async () => {
    const { resolveWorkspaceId } = await import('../src/vela-billing.ts')
    // The console shows no workspace concept, so an invented id would silently
    // read another workspace's numbers.
    expect(await resolveWorkspaceId('/definitely/not/here/vela', undefined)).toBeUndefined()
  })
})
