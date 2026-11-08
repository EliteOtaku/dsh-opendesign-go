/**
 * The model list has to reflect what the gateway granted this account, and it
 * has to say when the numbers beside a model are this build's estimates. Both
 * facts change what a user does, so both are asserted on the real component.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ModelsCard } from '../src/client/ModelsCard.tsx'
import type { OpenDesignConfig } from '../src/config-contract.ts'
import type { ConfigForm } from '../src/client/form.ts'

/**
 * A form stuck on one snapshot.
 * @param value - the configuration the card reads.
 * @returns the form.
 */
function staticForm(value: OpenDesignConfig): ConfigForm<OpenDesignConfig> {
  return {
    subscribe: () => () => {},
    getSnapshot: () => ({ status: 'ready', writable: true, revision: 1, value }),
  } as unknown as ConfigForm<OpenDesignConfig>
}

/**
 * Render the card with one configuration.
 * @param value - configuration fields to set; the rest are left undefined.
 * @returns the static markup.
 */
function render(value: Partial<OpenDesignConfig>): string {
  return renderToStaticMarkup(createElement(ModelsCard, {
    form: staticForm(value as OpenDesignConfig),
    config: value as OpenDesignConfig,
    editable: true,
  }))
}

/** A catalog snapshot naming exactly these ids. */
function catalog(ids: readonly string[]): Partial<OpenDesignConfig> {
  return { catalogJson: JSON.stringify({ source: 'gateway', ids }) }
}

describe('ModelsCard catalog', () => {
  it('renders the models the snapshot names, not the bundled list', () => {
    // This is the whole point of the change: a Plus subscriber's snapshot names
    // models this build has never heard of, and they must show up.
    const html = render(catalog(['claude-sonnet-5.5', 'deepseek-v4-pro']))
    expect(html).toContain('Claude Sonnet 5.5')
    expect(html).toContain('DeepSeek V4 Pro')
    expect(html).toContain('2 个')
    expect(html).not.toContain('GPT-6 Luna')
  })

  it('marks a model whose parameters this build does not carry', () => {
    // The context window drives truncation and max_tokens becomes the request's
    // cap, so a guessed number has to look different from a documented one.
    const html = render(catalog(['claude-sonnet-5.5']))
    expect(html).toContain('参数未收录')
    expect(html).toContain('通用默认值')
  })

  it('leaves a documented model unmarked', () => {
    const html = render(catalog(['deepseek-v4.1-flash']))
    expect(html).toContain('DeepSeek V4.1 Flash')
    expect(html).not.toContain('参数未收录')
  })

  it('shows the generic numbers rather than unknown, for an undocumented model', () => {
    // The request path gives these models the generic defaults, so the page
    // claiming "未知" would describe a different behaviour than the one in use.
    const html = render(catalog(['claude-sonnet-5.5']))
    expect(html).toContain('1.00M')
    expect(html).toContain('128k')
    expect(html).not.toContain('未知')
  })

  it('falls back to the bundled list when no snapshot was ever written', () => {
    const html = render({})
    expect(html).toContain('DeepSeek V4.1 Flash')
    expect(html).toContain('14 个')
    expect(html).not.toContain('参数未收录')
  })

  it('honours an empty snapshot instead of substituting the bundled list', () => {
    // An account that grants nothing is a different fact from a read that has
    // not landed; showing the Go list here would advertise models it cannot call.
    const html = render(catalog([]))
    expect(html).toContain('0 个')
    expect(html).not.toContain('DeepSeek V4.1 Flash')
  })
})
