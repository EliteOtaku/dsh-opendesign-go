import { describe, expect, it } from 'vitest'
import { parseAccountCommand, parseCommandResult } from '../src/account-command.ts'

describe('parseAccountCommand', () => {
  it('accepts an add command and trims its fields', () => {
    const command = parseAccountCommand({ kind: 'add', id: 'a1', name: '  主账号 ', key: '  sk-x  ' })
    expect(command).toEqual({ kind: 'add', id: 'a1', name: '主账号', key: 'sk-x' })
  })

  it('keeps an optional workspace id only when given', () => {
    const withId = parseAccountCommand({ kind: 'add', id: 'a1', name: 'n', key: 'k', workspaceId: 'ws' })
    expect(withId).toMatchObject({ workspaceId: 'ws' })
    const without = parseAccountCommand({ kind: 'add', id: 'a1', name: 'n', key: 'k' })
    expect('workspaceId' in without).toBe(false)
  })

  it('refuses an add with no key, because the account would never resolve', () => {
    expect(() => parseAccountCommand({ kind: 'add', id: 'a1', name: 'n', key: '   ' })).toThrow('缺少 API Key')
  })

  it('refuses an add with no name', () => {
    expect(() => parseAccountCommand({ kind: 'add', id: 'a1', name: '', key: 'k' })).toThrow('账号名称无效')
  })

  it('refuses a reference that is not an environment-variable name', () => {
    expect(() => parseAccountCommand({ kind: 'remove', ref: 'bad-ref' })).toThrow('账号引用无效')
    expect(() => parseAccountCommand({ kind: 'select', ref: '1BAD' })).toThrow('账号引用无效')
  })

  it('validates replace-key the same way as add', () => {
    expect(parseAccountCommand({ kind: 'replace-key', ref: 'KEY', key: ' sk ' })).toEqual({ kind: 'replace-key', ref: 'KEY', key: 'sk' })
    expect(() => parseAccountCommand({ kind: 'replace-key', ref: 'KEY', key: '' })).toThrow('缺少 API Key')
  })

  it('requires a boolean for auto-switch', () => {
    expect(parseAccountCommand({ kind: 'auto-switch', value: true })).toEqual({ kind: 'auto-switch', value: true })
    expect(() => parseAccountCommand({ kind: 'auto-switch', value: 'yes' })).toThrow('自动切换取值无效')
  })

  it('refuses unknown and malformed shapes before anything is written', () => {
    expect(() => parseAccountCommand(null)).toThrow('账号命令格式无效')
    expect(() => parseAccountCommand([])).toThrow('账号命令格式无效')
    expect(() => parseAccountCommand({ kind: 'drop-table' })).toThrow('未知的账号命令')
  })

  it('never echoes the key into an error message', () => {
    try {
      parseAccountCommand({ kind: 'add', id: 'a1', name: 'n', key: 'super-secret-value' })
      // A valid command throws nothing; force the failure path instead.
      parseAccountCommand({ kind: 'add', id: 'a1', name: '', key: 'super-secret-value' })
    } catch (error) {
      expect(String(error)).not.toContain('super-secret-value')
    }
  })
})

describe('parseCommandResult', () => {
  it('accepts exactly the three outcomes', () => {
    expect(parseCommandResult('applied')).toBe('applied')
    expect(parseCommandResult('rejected')).toBe('rejected')
    expect(parseCommandResult('unknown')).toBe('unknown')
  })

  it('refuses anything else so a typo cannot be read as success', () => {
    expect(() => parseCommandResult('ok')).toThrow('账号命令结果无效')
    expect(() => parseCommandResult(true)).toThrow('账号命令结果无效')
  })
})
