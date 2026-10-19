/**
 * Account management card.
 *
 * Accounts are ordered and the first one is what every request uses, so
 * "select" is expressed as "move to front" rather than a separate field — there
 * is no second place for the selection to disagree with the list.
 *
 * Keys are never displayed or echoed back: adding an account writes a credential
 * reference plus a name, and the value itself is stored by the host credentials
 * service. This card therefore shows only whether a reference is *configured*,
 * which the host reports separately.
 *
 * @module dsh-opendesign-go/client/AccountsCard
 */
import { useState } from 'react'
import type { ReactElement } from 'react'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { MAX_ACCOUNTS, accountsOf, deriveAccountRef } from '../accounts.ts'
import type { OpenDesignAccount } from '../config-contract.ts'
import type { OpenDesignConfig } from '../config-contract.ts'

const card = {
  border: '1px solid rgba(128, 128, 128, 0.25)',
  borderRadius: '10px',
  padding: '14px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
} as const

const hint = { fontSize: '13px', opacity: 0.65, margin: 0 } as const

/** Small bordered button used by every row action. */
const smallButton = {
  fontSize: '12px',
  padding: '3px 10px',
  borderRadius: '6px',
  border: '1px solid rgba(128, 128, 128, 0.35)',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
} as const

const input = {
  display: 'block',
  width: '100%',
  marginTop: '4px',
  padding: '6px 8px',
  fontSize: '12px',
  borderRadius: '6px',
  border: '1px solid rgba(128, 128, 128, 0.3)',
  background: 'transparent',
  color: 'inherit',
  boxSizing: 'border-box',
} as const

/**
 * Render the account card.
 * @param props - config form, current accounts, and the write helper.
 * @returns the card.
 */
export function AccountsCard({ form, config, editable }: {
  readonly form: ConfigForm<OpenDesignConfig>
  readonly config: OpenDesignConfig | undefined
  readonly editable: boolean
}): ReactElement {
  const [adding, setAdding] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [error, setError] = useState<string | undefined>(undefined)

  const accounts = accountsOf({
    apiKeyEnv: config?.apiKeyEnv ?? '',
    accounts: config?.accounts ?? null,
  })
  const atCap = accounts.length >= MAX_ACCOUNTS

  /**
   * Persist one new list. The host validates it, so a refusal is surfaced
   * instead of being lost.
   * @param next - the complete next account list.
   * @param selectedRef - reference that becomes the active account.
   */
  const commit = (next: readonly OpenDesignAccount[], selectedRef: string): void => {
    setError(undefined)
    void form.mutate([
      { op: 'set', path: ['accounts'], value: next.map((account) => ({ ...account })) },
      { op: 'set', path: ['apiKeyEnv'], value: selectedRef },
    ]).then((accepted) => {
      if (accepted === false) setError('宿主拒绝了这次修改，请检查账号信息')
    }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason))
    })
  }

  /**
   * Add an account with a derived credential reference.
   *
   * A derived reference keeps the user out of environment-variable naming,
   * where a typo would surface much later as a failed request.
   */
  const add = (): void => {
    const name = draftName.trim()
    if (name.length === 0) {
      setError('请输入账号名称')
      return
    }
    const used = new Set(accounts.map((account) => account.apiKeyEnv))
    let index = 0
    while (used.has(deriveAccountRef(index))) index += 1
    const account: OpenDesignAccount = {
      id: crypto.randomUUID(),
      name,
      apiKeyEnv: deriveAccountRef(index),
    }
    commit([...accounts, account], accounts[0]?.apiKeyEnv ?? account.apiKeyEnv)
    setDraftName('')
    setAdding(false)
  }

  /**
   * Drop one account. The last account cannot be removed, because the plugin
   * would then have no credential to resolve at all.
   * @param ref - credential reference of the account to remove.
   */
  const remove = (ref: string): void => {
    const next = accounts.filter((account) => account.apiKeyEnv !== ref)
    if (next.length === 0) {
      setError('至少保留一个账号')
      return
    }
    const selected = next[0]
    if (selected === undefined) return
    commit(next, selected.apiKeyEnv)
  }

  /**
   * Make one account active. Reordering is the selection.
   * @param ref - credential reference to promote.
   */
  const select = (ref: string): void => {
    commit(accounts, ref)
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontSize: '14px', fontWeight: 500 }}>账号</div>
        <span style={{ fontSize: '12px', opacity: 0.6 }}>
          {accounts.length} 个 · 当前 {accounts[0]?.name || accounts[0]?.apiKeyEnv || '未配置'}
        </span>
      </div>
      <p style={hint}>
        每个账号是一份独立的 OpenDesign 订阅。同一工作空间内的多个 Key 共享同一份额度，
        因此多账号的意义是「多买几份 Go」，而不是「一个订阅拆成几把钥匙」。
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {accounts.map((account, index) => (
          <div
            key={account.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              padding: '8px 10px',
              borderRadius: '8px',
              border: '1px solid rgba(128, 128, 128, 0.2)',
              background: index === 0 ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '13px' }}>
                {account.name || account.apiKeyEnv}
                {index === 0 && <span style={{ marginLeft: '8px', fontSize: '11px', opacity: 0.6 }}>当前</span>}
              </div>
              <div style={{ fontSize: '11px', opacity: 0.55 }}>{account.apiKeyEnv}</div>
            </div>
            <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
              {index !== 0 && (
                <button type="button" disabled={!editable} style={smallButton} onClick={() => { select(account.apiKeyEnv) }}>
                  设为当前
                </button>
              )}
              <button type="button" disabled={!editable} style={smallButton} onClick={() => { remove(account.apiKeyEnv) }}>
                移除
              </button>
            </div>
          </div>
        ))}
      </div>

      {adding ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '12px', opacity: 0.7 }}>
            账号名称
            <input
              type="text"
              value={draftName}
              onChange={(event) => { setDraftName(event.target.value) }}
              placeholder="例如：主账号"
              style={input}
            />
          </label>
          <p style={hint}>
            Key 请通过宿主凭据服务写入（引用名保存后显示），页面不会读取或回显密钥。
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" style={smallButton} onClick={add}>确认</button>
            <button type="button" style={smallButton} onClick={() => { setAdding(false); setError(undefined) }}>取消</button>
          </div>
        </div>
      ) : (
        <div>
          <button
            type="button"
            disabled={!editable || atCap}
            style={smallButton}
            onClick={() => { setAdding(true) }}
          >
            添加账号
          </button>
          {atCap && <p style={{ ...hint, marginTop: '6px' }}>已达 {MAX_ACCOUNTS} 个账号上限</p>}
        </div>
      )}

      {error !== undefined && (
        <p style={{ ...hint, color: '#e5484d' }}>{error}</p>
      )}
    </div>
  )
}
