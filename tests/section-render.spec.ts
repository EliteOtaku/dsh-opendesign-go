/**
 * The settings page renders every card, so a crash in one of them is a whole
 * page that will not open. These render the real component tree to static HTML
 * with the smallest configuration that still exercises each card, and assert
 * that the page and its sections actually appear.
 *
 * Static markup is enough here: the restyle changed structure and class names,
 * not behaviour, and any missing token, bad hook order or dropped export shows
 * up as either a thrown render or missing text.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { OpenDesignSection } from '../src/client/Section.tsx'
import type { OpenDesignConfig } from '../src/config-contract.ts'
import type { ConfigForm } from '../src/client/form.ts'

/**
 * A form stuck on one snapshot.
 * @param value - the configuration the page reads.
 * @param overrides - snapshot fields to replace.
 * @returns the form.
 */
function staticForm(
  value: OpenDesignConfig,
  overrides: { status?: string, writable?: boolean } = {},
): ConfigForm<OpenDesignConfig> {
  return {
    subscribe: () => () => {},
    getSnapshot: () => ({
      status: overrides.status ?? 'ready',
      writable: overrides.writable ?? true,
      revision: 1,
      value,
    }),
  } as unknown as ConfigForm<OpenDesignConfig>
}

/** The smallest configuration every card can render against. */
const BASE = {
  enabled: true,
  composerUsage: true,
  apiKeyEnv: 'OPENDESIGN_API_KEY',
  accounts: [],
  autoSwitch: true,
  sessionRef: '',
  workspaceId: '',
  usageJson: '',
  reportJson: '',
  useVelaCredential: false,
  diagnosticsJson: '',
  modelParamsJson: '',
  enabledModelsJson: '',
  planOverrides: '',
  alignBaselineJson: '',
  recoveredEnabled: false,
  recoveredProviders: '',
  refreshNonce: '',
  updateJson: '',
  baseURL: 'https://opencode.ai/inference/go/v1',
  requestTimeoutMs: 300_000,
  streamIdleTimeoutMs: 300_000,
} as unknown as OpenDesignConfig

/** Render the page with one configuration. */
function render(value: OpenDesignConfig, overrides: { status?: string, writable?: boolean } = {}): string {
  return renderToStaticMarkup(createElement(OpenDesignSection, {
    form: staticForm(value, overrides),
    execute: () => Promise.resolve('applied' as const),
    channelState: 'idle',
  }))
}

describe('settings section', () => {
  it('renders every card with an empty configuration', () => {
    const html = render(BASE)
    for (const heading of [
      '启用 OpenDesign Go',
      '在输入框旁显示额度',
      '账号',
      '可用模型',
      '订阅额度',
      '套餐对账',
      '本地用量',
      '额度来源',
      '路由状态',
    ]) {
      expect(html).toContain(heading)
    }
  })

  it('names the models in the list even when none are enabled', () => {
    const html = render(BASE)
    expect(html).toContain('deepseek-v4.1-flash')
    expect(html).toContain('上下文')
    expect(html).toContain('改参数')
  })

  it('shows the unread quota state instead of an empty bar', () => {
    const html = render(BASE)
    expect(html).toContain('尚未读取')
    expect(html).toContain('尚未读取额度，无法对账')
  })

  it('survives a configuration the form has not loaded yet', () => {
    const html = renderToStaticMarkup(createElement(OpenDesignSection, {
      form: {
        subscribe: () => () => {},
        getSnapshot: () => ({ status: 'loading', writable: false, revision: 0, value: undefined }),
      } as unknown as ConfigForm<OpenDesignConfig>,
      execute: () => Promise.resolve('applied' as const),
      channelState: 'idle',
    }))
    expect(html).toContain('OpenDesign Go')
  })
})
