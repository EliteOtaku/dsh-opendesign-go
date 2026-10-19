import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_REF_PATTERN,
  MAX_ACCOUNTS,
  accountRefOf,
  accountsOf,
  assertAccounts,
  deriveAccountRef,
  moveAccountFirst,
} from '../src/accounts.ts'
import type { OpenDesignAccount } from '../src/config-contract.ts'
import { DEFAULT_API_KEY_ENV } from '../src/config-contract.ts'

/** Two accounts in a fixed order. */
const A: OpenDesignAccount = { id: 'a', name: '主要账号', apiKeyEnv: 'OPENDESIGN_ACCOUNT_1' }
const B: OpenDesignAccount = { id: 'b', name: '备用账号', apiKeyEnv: 'OPENDESIGN_ACCOUNT_2' }

describe('accountRefOf', () => {
  it('falls back to the default reference for an empty selection', () => {
    expect(accountRefOf({ apiKeyEnv: '' })).toBe(DEFAULT_API_KEY_ENV)
    expect(accountRefOf({ apiKeyEnv: '   ' })).toBe(DEFAULT_API_KEY_ENV)
  })

  it('keeps an explicit reference', () => {
    expect(accountRefOf({ apiKeyEnv: 'OTHER_KEY' })).toBe('OTHER_KEY')
  })
})

describe('moveAccountFirst', () => {
  it('promotes the selected account and preserves the others order', () => {
    expect(moveAccountFirst([A, B], B.apiKeyEnv)).toEqual([B, A])
  })

  it('leaves the order alone when already first or absent', () => {
    expect(moveAccountFirst([A, B], A.apiKeyEnv)).toEqual([A, B])
    expect(moveAccountFirst([A, B], 'MISSING')).toEqual([A, B])
  })
})

describe('accountsOf', () => {
  it('returns the stored order with the selected account first', () => {
    const result = accountsOf({ apiKeyEnv: B.apiKeyEnv, accounts: [A, B] })
    expect(result.map((account) => account.id)).toEqual(['b', 'a'])
  })

  it('synthesizes the legacy account so a pre-list configuration still resolves', () => {
    const result = accountsOf({ apiKeyEnv: 'LEGACY_KEY', accounts: null })
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ id: 'legacy:LEGACY_KEY', name: '', apiKeyEnv: 'LEGACY_KEY' })
  })

  it('puts the synthetic legacy account first when the list does not carry it', () => {
    const result = accountsOf({ apiKeyEnv: 'LEGACY_KEY', accounts: [A] })
    expect(result[0]?.id).toBe('legacy:LEGACY_KEY')
    expect(result).toHaveLength(2)
  })
})

describe('assertAccounts', () => {
  it('accepts a well-formed list and null', () => {
    expect(() => assertAccounts([A, B], A.apiKeyEnv)).not.toThrow()
    expect(() => assertAccounts(null, A.apiKeyEnv)).not.toThrow()
  })

  it('rejects a duplicate reference, because two rows would resolve the same key', () => {
    expect(() => assertAccounts([A, { ...B, apiKeyEnv: A.apiKeyEnv }], A.apiKeyEnv))
      .toThrow('凭据引用名重复')
  })

  it('rejects a duplicate id', () => {
    expect(() => assertAccounts([A, { ...B, id: A.id }], A.apiKeyEnv)).toThrow('账号 id 重复')
  })

  it('rejects a reference that is not an environment variable name', () => {
    expect(() => assertAccounts([{ ...A, apiKeyEnv: 'bad-ref' }], A.apiKeyEnv)).toThrow('凭据引用名无效')
  })

  it('rejects an empty name on a real account but allows it on the legacy entry', () => {
    expect(() => assertAccounts([{ ...A, name: '  ' }], A.apiKeyEnv)).toThrow('账号名称不能为空')
    expect(() => assertAccounts([{ id: 'legacy:X', name: '', apiKeyEnv: 'X' }], 'X')).not.toThrow()
  })

  it('rejects more accounts than the cap', () => {
    const many = Array.from({ length: MAX_ACCOUNTS + 1 }, (_, index) => ({
      id: `id-${index}`, name: `n-${index}`, apiKeyEnv: `KEY_${index}`,
    }))
    expect(() => assertAccounts(many, 'KEY_0')).toThrow(`最多支持 ${MAX_ACCOUNTS} 个账号`)
  })

  it('rejects an empty workspace id instead of treating it as unset', () => {
    expect(() => assertAccounts([{ ...A, workspaceId: ' ' }], A.apiKeyEnv)).toThrow('工作空间 ID 不能为空字符串')
  })
})

describe('deriveAccountRef', () => {
  it('produces references that match the credential pattern', () => {
    for (const index of [0, 1, 9, 19]) {
      expect(ACCOUNT_REF_PATTERN.test(deriveAccountRef(index))).toBe(true)
    }
    expect(deriveAccountRef(0)).toBe('OPENDESIGN_ACCOUNT_1')
  })
})
