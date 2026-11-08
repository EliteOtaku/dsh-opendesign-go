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
  protocol: 'chat',
  requestTimeoutMs: 300_000,
  streamIdleTimeoutMs: 300_000,
} as unknown as OpenDesignConfig

/** Render the page with one configuration. */
function render(value: OpenDesignConfig, overrides: { status?: string, writable?: boolean } = {}): string {
  return renderToStaticMarkup(createElement(OpenDesignSection, {
    form: staticForm(value, overrides),
    execute: () => Promise.resolve('applied' as const),
    channelState: 'idle',
    // Never called during a static render: both routes need a click. They are
    // supplied so the prop shape stays honest rather than being cast away.
    updateFromNpm: () => Promise.resolve({ ok: true, message: '' }),
    installFromGithub: () => Promise.resolve({ ok: true, message: '' }),
    updateState: () => 'ready',
  }))
}

/** A configuration whose notice names one or both newer versions. */
function withNotice(notice: { latest?: string, githubLatest?: string }): OpenDesignConfig {
  return {
    ...BASE,
    updateJson: JSON.stringify({ current: '0.1.13', ...notice }),
  } as unknown as OpenDesignConfig
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
      updateFromNpm: () => Promise.resolve({ ok: true, message: '' }),
      installFromGithub: () => Promise.resolve({ ok: true, message: '' }),
      updateState: () => 'ready',
    }))
    expect(html).toContain('OpenDesign Go')
  })

  it('offers both inference surfaces and marks the active one', () => {
    const html = render(BASE)

    expect(html).toContain('Chat Completions')
    expect(html).toContain('Responses')
    // The active button carries the primary fill; the other stays ghost. Static
    // markup is enough to see which is which.
    expect(html).toMatch(/Chat Completions/)
  })

  it('draws the update card only for the routes that have something to install', () => {
    // The registry answered but the repository tag did not: only the npm button
    // may appear, because a GitHub button would have no version to name.
    const npmOnly = render(withNotice({ latest: '0.1.14' }))
    expect(npmOnly).toContain('一键更新')
    expect(npmOnly).not.toContain('从 GitHub 装')

    // The reverse: a tag exists before the registry publish lands.
    const githubOnly = render(withNotice({ githubLatest: '0.1.14' }))
    expect(githubOnly).toContain('从 GitHub 装')
    expect(githubOnly).not.toContain('一键更新')

    const neither = render(BASE)
    expect(neither).not.toContain('一键更新')
    expect(neither).not.toContain('从 GitHub 装')
  })

  it('shows the model count this build carries, not a stale cached one', () => {
    // The page reads the count from the host's cached report, which only moves
    // when a write lands. A refused write froze it at 12 while the catalog had
    // 14, so the page now trusts its own catalog and says the cache is behind.
    const stale = render({
      ...BASE,
      diagnosticsJson: JSON.stringify({
        registered: true,
        enabled: true,
        credentialResolved: true,
        triedRef: 'OPENDESIGN_API_KEY',
        modelCount: 12,
        asOf: '2026-10-20T15:40:17.194Z',
      }),
    } as unknown as OpenDesignConfig)
    expect(stale).toContain('声明模型 14 个')
    expect(stale).toContain('宿主缓存的是 12 个')

    // With no report at all there is nothing stale to mention.
    expect(render(BASE)).toContain('宿主尚未上报路由状态')
  })
})
