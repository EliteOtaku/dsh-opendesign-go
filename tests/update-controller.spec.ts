/**
 * The update card's decision logic, tested without a Host.
 *
 * Every branch here turns a `PluginChangeResult` into something the user reads,
 * and several of them are the difference between "nothing changed" and "your
 * plugin is gone" — which is exactly why they are worth pinning down in text.
 *
 * The wire-contract block at the end covers a different class of failure: calls
 * the Host gateway rejects because the argument count does not match the
 * parameters the endpoint declares. Those compile fine and fail on click, which
 * is how `listVersions(name)` shipped broken.
 */
import { describe, expect, it } from 'vitest'
import { changeOutcome, updateBundleOutcome, updateCommands } from '../src/client/update-controller.ts'
import type { Context as ClientContext } from '@deepseek-ai/cordis'

describe('changeOutcome', () => {
  it('reports a landed install', () => {
    expect(changeOutcome({ application: 'applied' }, '0.1.14'))
      .toEqual({ ok: true, message: '已更新到 0.1.14' })
  })

  it('asks for a restart rather than calling a pending activation done', () => {
    // `restart-required` means the files landed but the running Host still holds
    // the old module, so claiming "已更新" would be read as "already working".
    expect(changeOutcome({ application: 'restart-required' }, '0.1.14'))
      .toEqual({ ok: true, message: '已装好 0.1.14，重启 DSH 后生效' })
  })

  it('passes the Host diagnostic through untouched', () => {
    expect(changeOutcome({
      application: 'failed',
      error: { code: 'operation-error', diagnostic: 'pnpm exited 1' },
    }, '0.1.14')).toEqual({ ok: false, message: 'pnpm exited 1' })
  })

  it('names the supply-chain gate, which is the likeliest refusal on release day', () => {
    // pnpm 11 rejects a version published inside its minimum-release-age window
    // and rolls the whole operation back. Its raw output is the only place that
    // fact appears, so it is translated rather than dropped.
    expect(changeOutcome({
      application: 'failed',
      packageResult: { kind: 'network', output: 'ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION  dsh-opendesign-go@0.1.14' },
    })).toEqual({ ok: false, message: '这个版本刚发布，尚未通过 pnpm 的最短发布时长检查；等几小时后再试' })
  })

  it('explains a version the running DSH rejects', () => {
    expect(changeOutcome({ application: 'failed', error: { code: 'incompatible-version' } }))
      .toEqual({ ok: false, message: '该版本要求的 DSH 版本高于当前运行版本' })
  })

  it('falls back to the error code when there is no diagnostic', () => {
    expect(changeOutcome({ application: 'failed', error: { code: 'not-removable' } }))
      .toEqual({ ok: false, message: '宿主认为这个包不能移除' })
  })

  it('reads a cancellation as a refusal, not as success', () => {
    expect(changeOutcome({ application: 'cancelled' }).ok).toBe(false)
  })
})

describe('updateBundleOutcome', () => {
  it('reports the new version on success', () => {
    expect(updateBundleOutcome({
      from: '0.1.13',
      to: '0.1.14',
      step: 'enable',
      result: { application: 'applied' },
    })).toEqual({ ok: true, message: '已更新到 0.1.14' })
  })

  it('says nothing was changed when the check refused the version', () => {
    // A `check` failure happens before any file moves, so the user must not be
    // told to reinstall anything.
    expect(updateBundleOutcome({
      from: '0.1.13',
      to: '0.1.14',
      step: 'check',
      result: { application: 'failed', error: { diagnostic: '0.1.14 is not a version newer than the installed 0.1.14' } },
    })).toEqual({ ok: false, message: '装不上 0.1.14：0.1.14 is not a version newer than the installed 0.1.14' })
  })

  it('distinguishes a failed removal from a failed install', () => {
    // The two steps leave the profile in different states, and the Host restores
    // from the registry only after a removal succeeded.
    expect(updateBundleOutcome({
      from: '0.1.13',
      to: '0.1.14',
      step: 'remove',
      result: { application: 'failed', error: { diagnostic: 'bundle-in-use' } },
    })).toEqual({ ok: false, message: '卸载 0.1.13 失败，未做改动：bundle-in-use' })
  })

  it('says the old version was restored when the install failed after removal', () => {
    expect(updateBundleOutcome({
      from: '0.1.13',
      to: '0.1.14',
      step: 'install',
      result: { application: 'failed', error: { diagnostic: 'pnpm exited 1' } },
    })).toEqual({ ok: false, message: '更新到 0.1.14 失败，已恢复 0.1.13：pnpm exited 1' })
  })
})

/**
 * Parameters each endpoint declares, counted exactly as the Host gateway counts.
 *
 * The gateway computes `descriptor.parameters.length` — which includes slots
 * TypeScript marks optional — and rejects a call whose argument count differs.
 * A fake that enforces the same rule is the only way to catch this class of bug
 * locally, because the compiler accepts the short call.
 */
const DECLARED: Readonly<Record<string, number>> = {
  listVersions: 2,
  updateBundle: 3,
  removeBundle: 1,
  installBundle: 2,
}

/** One version row, in the shape `listVersions` reports. */
const LISTING = {
  status: 'listed' as const,
  installed: '0.1.20',
  registry: 'https://registry.npmjs.org',
  versions: [{ version: '0.1.21' }],
}

/** A remote envelope holding one value. */
function ok<T>(value: T): { ok: true, value: T } {
  return { ok: true, value }
}

/**
 * Build a `remote.pluginManager` that rejects a wrong argument count.
 *
 * Overrides replace only the *answer*, never the recording wrapper: assigning a
 * bare method over the fake would also remove its argument-count check, and the
 * call log would then silently stay empty while the test still seemed to pass.
 * @param overrides - per-method answers, replacing the defaults.
 * @returns the fake manager, the call log, and a setter for one answer.
 */
function fakeManager(overrides: Partial<Record<string, (...args: unknown[]) => unknown>> = {}): {
  manager: Record<string, (...args: unknown[]) => Promise<unknown>>
  calls: { method: string, args: unknown[] }[]
  answer: (method: string, fn: (...args: unknown[]) => unknown) => void
} {
  const calls: { method: string, args: unknown[] }[] = []
  const answers: Record<string, (...args: unknown[]) => unknown> = {
    listVersions: () => ok(LISTING),
    updateBundle: () => ok({
      from: '0.1.20',
      to: '0.1.21',
      step: 'install',
      result: { application: 'applied' },
    }),
    removeBundle: () => ok({ application: 'applied', version: '0.1.20' }),
    installBundle: () => ok({ application: 'applied', version: '0.1.21' }),
    ...overrides,
  }
  const manager: Record<string, (...args: unknown[]) => Promise<unknown>> = {}
  for (const [method, declared] of Object.entries(DECLARED)) {
    manager[method] = async (...args: unknown[]) => {
      calls.push({ method, args })
      // The Host's exact check and wording: a wrong count fails before any value
      // is decoded, which is what made this look like a provider error.
      if (args.length !== declared) {
        throw new Error(
          `client api: pluginManager/${method} expected ${declared} business argument(s) `
          + `plus an optional AbortSignal, got ${args.length}`,
        )
      }
      return answers[method]!(...args)
    }
  }
  return {
    manager,
    calls,
    answer: (method: string, fn: (...args: unknown[]) => unknown) => {
      answers[method] = fn
    },
  }
}

/**
 * Build a context whose `inject` hands out the fake remote synchronously.
 *
 * `inject` returns a thenable the caller reads through `ready`, so the stand-in
 * has to settle like the real one: returning a bare object makes `await ready`
 * hang until the test times out.
 * @param manager - the fake plugin manager.
 * @returns the context.
 */
function fakeContext(manager: unknown): ClientContext {
  const ctx = {
    inject: (_names: string[], callback: (scope: unknown) => void) => {
      callback({ remote: { pluginManager: manager } })
      return Promise.resolve()
    },
    logger: { warn: () => undefined },
  }
  return ctx as unknown as ClientContext
}

describe('update channel wire contract', () => {
  it('calls listVersions with the declared argument count', async () => {
    // The regression: `listVersions(PACKAGE_NAME)` compiled and then failed on
    // every click. The second slot must be passed even when it is undefined.
    const { manager, calls } = fakeManager()
    const commands = updateCommands(fakeContext(manager))
    await commands.ready

    const outcome = await commands.updateFromNpm('0.1.21')

    expect(calls[0]).toEqual({ method: 'listVersions', args: ['dsh-opendesign-go', undefined] })
    expect(outcome).toEqual({ ok: true, message: '已更新到 0.1.21' })
  })

  it('calls updateBundle with all three declared arguments', async () => {
    const { manager, calls } = fakeManager()
    const commands = updateCommands(fakeContext(manager))
    await commands.ready

    await commands.updateFromNpm('0.1.21')

    const call = calls.find((entry) => entry.method === 'updateBundle')
    expect(call?.args).toHaveLength(3)
    expect(call?.args[0]).toBe('dsh-opendesign-go')
    expect(call?.args[1]).toBe('0.1.21')
    expect(call?.args[2]).toMatchObject({ registry: LISTING.registry })
  })

  it('calls removeBundle and installBundle with their declared counts', async () => {
    const { manager, calls } = fakeManager()
    const commands = updateCommands(fakeContext(manager))
    await commands.ready

    const outcome = await commands.installFromGithub('0.1.21')

    expect(calls.map((entry) => [entry.method, entry.args.length])).toEqual([
      ['removeBundle', 1],
      ['installBundle', 2],
    ])
    expect(outcome.ok).toBe(true)
  })

  it('reports a wrong-argument-count failure instead of claiming success', async () => {
    // A gateway declaring a different count is the one case this page cannot
    // satisfy; the Host's sentence must reach the user, because their next step
    // differs completely from "the install failed".
    const { manager, answer } = fakeManager()
    answer('listVersions', () => {
      throw new Error('client api: pluginManager/listVersions expected 3 business argument(s), got 2')
    })
    const commands = updateCommands(fakeContext(manager))
    await commands.ready

    const outcome = await commands.updateFromNpm('0.1.21')

    expect(outcome.ok).toBe(false)
    expect(outcome.message).toContain('expected 3 business argument(s)')
  })

  it('refuses before any write when the registry lists no such version', async () => {
    const { manager, calls, answer } = fakeManager()
    answer('listVersions', () => ok({ ...LISTING, versions: [] }))
    const commands = updateCommands(fakeContext(manager))
    await commands.ready

    const outcome = await commands.updateFromNpm('0.1.99')

    expect(outcome.ok).toBe(false)
    expect(calls.map((entry) => entry.method)).toEqual(['listVersions'])
  })
})
