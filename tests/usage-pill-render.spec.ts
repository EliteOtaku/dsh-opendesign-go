import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { ComposerUsagePill, ownedByThisProvider } from '../src/client/UsagePill.tsx'
import { PROVIDER_ID } from '../src/config-contract.ts'
import type { OpenDesignConfig } from '../src/config-contract.ts'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { QuotaWindow, UsageSnapshot } from '../src/usage-contract.ts'

const NOW = '2026-10-29T05:00:00.000Z'

function window(overrides: Partial<QuotaWindow> & { durationSeconds: number }): QuotaWindow {
  return {
    status: 'ok',
    usedCredits: '2500',
    limitCredits: '50000',
    remainingCredits: '47500',
    percentUsed: 5,
    resetsAt: NOW,
    ...overrides,
  }
}

function usageJson(windows: readonly QuotaWindow[]): string {
  const snapshot: UsageSnapshot = { asOf: NOW, tier: 'go', eligible: true, windows }
  return JSON.stringify(snapshot)
}

/**
 * The pill only reads `getSnapshot`/`subscribe` off the form, so a hand-built
 * double exercises the real component without a settings service.
 */
function formWith(overrides: Partial<OpenDesignConfig>): ConfigForm<OpenDesignConfig> {
  const value = {
    enabled: true,
    apiKeyEnv: 'OPENDESIGN_API_KEY',
    accounts: null,
    autoSwitch: false,
    composerUsage: true,
    sessionRef: '',
    workspaceId: '',
    usageJson: usageJson([
      window({ durationSeconds: 18_000, percentUsed: 38 }),
      window({ durationSeconds: 604_800, percentUsed: 12 }),
    ]),
    reportJson: '',
    useVelaCredential: true,
    diagnosticsJson: '',
    modelParamsJson: '',
    enabledModelsJson: '',
    planOverrides: '',
    alignBaselineJson: '',
    recoveredEnabled: false,
    recoveredProviders: '',
    refreshNonce: '',
    updateJson: '',
    baseURL: 'https://example.test/v1',
    requestTimeoutMs: 1_000,
    streamIdleTimeoutMs: 1_000,
    ...overrides,
  } as OpenDesignConfig
  return {
    subscribe: () => () => {},
    getSnapshot: () => ({ status: 'ready', writable: true, revision: 1, value }),
  } as unknown as ConfigForm<OpenDesignConfig>
}

/**
 * The session's model directory: the pill only reads one field of it, and the
 * value has to be renderable so a static render can stand in for a live session.
 */
function directoryOf(provider: string | undefined): { subscribe: () => () => void; getSnapshot: () => ModelDirectoryState } {
  const state = {
    current: provider === undefined ? null : { provider, model: 'deepseek-v4.1-flash' },
    routable: true,
    groups: [],
    failures: [],
    status: 'ready',
    pending: null,
    error: null,
  } as ModelDirectoryState
  return { subscribe: () => () => {}, getSnapshot: () => state }
}

const OURS = directoryOf(PROVIDER_ID)

function render(form: ConfigForm<OpenDesignConfig>, directory = OURS): string {
  return renderToStaticMarkup(createElement(ComposerUsagePill, { form, directory }))
}

describe('ComposerUsagePill', () => {
  it('renders the reading in the collapsed pill', () => {
    // 38% used of the 5-hour window leaves 62%, 12% of the week leaves 88%.
    const html = render(formWith({}))
    expect(html).toContain('5h 62%')
    expect(html).toContain('7d 88%')
    // The panel is closed by default: it would otherwise cover the composer.
    expect(html).not.toContain('刷新额度')
  })

  it('renders nothing until the host has published a reading', () => {
    // An empty pill would be a promise the plugin has no data to keep; the
    // settings page is where a missing channel is explained.
    expect(render(formWith({ usageJson: '' }))).toBe('')
  })

  it('honours the display toggle', () => {
    expect(render(formWith({ composerUsage: false }))).toBe('')
  })

  it('disappears with the provider, matching the withdrawn route', () => {
    expect(render(formWith({ enabled: false }))).toBe('')
  })

  it('stays out of sessions that are not spending our quota', () => {
    // Another provider means another account's credits: the number would be
    // wrong even though the reading itself is fine.
    expect(render(formWith({}), directoryOf('opencode-go'))).toBe('')
    // Nothing selected yet is also not ours; the pill appears on selection.
    expect(render(formWith({}), directoryOf(undefined))).toBe('')
    expect(ownedByThisProvider(directoryOf(PROVIDER_ID).getSnapshot())).toBe(true)
    expect(ownedByThisProvider(directoryOf('opencode-go').getSnapshot())).toBe(false)
  })

  it('shows the windows it can price, and hides the pill when it can price none', () => {
    const html = render(formWith({
      usageJson: usageJson([
        window({ durationSeconds: 18_000, percentUsed: 100 }),
        window({ durationSeconds: 604_800, status: 'unknown', percentUsed: null }),
      ]),
    }))
    expect(html).toContain('5h 0%')
    expect(html).not.toContain('7d')
    expect(render(formWith({ usageJson: usageJson([]) }))).toBe('')
  })
})
