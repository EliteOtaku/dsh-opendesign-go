import { describe, expect, it } from 'vitest'
import * as plugin from '../src/index.ts'

describe('plugin entry', () => {
  it('exports the declared module name', () => {
    expect(plugin.name).toBe('llm-opendesign-go')
  })

  it('exports an apply function', () => {
    expect(typeof plugin.apply).toBe('function')
  })
})
