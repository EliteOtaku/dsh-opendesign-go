/**
 * The update card's decision logic, tested without a Host.
 *
 * Every branch here turns a `PluginChangeResult` into something the user reads,
 * and several of them are the difference between "nothing changed" and "your
 * plugin is gone" — which is exactly why they are worth pinning down in text.
 */
import { describe, expect, it } from 'vitest'
import { changeOutcome, updateBundleOutcome } from '../src/client/update-controller.ts'

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
