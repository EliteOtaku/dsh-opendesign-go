/**
 * Account management card.
 *
 * Accounts are ordered and the first one is what every request uses, so
 * "select" is expressed as "move to front" rather than a separate field — there
 * is no second place for the selection to disagree with the list.
 *
 * Keys are entered here but never shown again: the field sends a command to the
 * host, which stores the value in the credentials service and keeps only a
 * reference in the config. Nothing in this card can read a stored key back.
 *
 * @module dsh-opendesign-go/client/AccountsCard
 */
import { useState } from 'react'
import type { ReactElement } from 'react'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { MAX_ACCOUNTS, accountsOf } from '../accounts.ts'
import type { OpenDesignAccount } from '../config-contract.ts'
import type { OpenDesignConfig } from '../config-contract.ts'
import type { ExecuteAccountCommand } from './accounts-controller.ts'

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

/** Turn one command outcome into what the card says. */
function outcomeMessage(result: 'applied' | 'rejected' | 'unknown'): string | undefined {
  if (result === 'applied') return undefined
  if (result === 'rejected') return '宿主拒绝了这次修改，请检查填写内容'
  return '未能确认写入结果：通道可能未就绪，请刷新后核对账号列表'
}

/**
 * Render the account card.
 * @param props - config form, current accounts, and the command executor.
 * @returns the card.
 */
export function AccountsCard({ form, config, editable, execute }: {
  readonly form: ConfigForm<OpenDesignConfig>
  readonly config: OpenDesignConfig | undefined
  readonly editable: boolean
  /** Sends an account command to the host, which owns credential storage. */
  readonly execute: ExecuteAccountCommand
}): ReactElement {
  const [adding, setAdding] = useState(false)
  const [replacing, setReplacing] = useState<string | undefined>(undefined)
  const [draftName, setDraftName] = useState('')
  const [draftKey, setDraftKey] = useState('')
  const [draftWorkspace, setDraftWorkspace] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [notice, setNotice] = useState<string | undefined>(undefined)

  const accounts = accountsOf({
    apiKeyEnv: config?.apiKeyEnv ?? '',
    accounts: config?.accounts ?? null,
  })
  const atCap = accounts.length >= MAX_ACCOUNTS

  /**
   * Run one command and surface its outcome.
   * @param command - the command to send.
   * @param onApplied - runs only when the host confirmed the write.
   */
  const run = (command: Parameters<ExecuteAccountCommand>[0], onApplied?: () => void): void => {
    setError(undefined)
    setNotice(undefined)
    setBusy(true)
    void execute(command)
      .then((result) => {
        const message = outcomeMessage(result)
        if (message === undefined) {
          onApplied?.()
          return
        }
        setError(message)
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : String(reason))
      })
      .finally(() => { setBusy(false) })
  }

  /**
   * Add an account and store its key.
   *
   * The host derives the credential reference, so the user never types an
   * environment-variable name.
   */
  const add = (): void => {
    const name = draftName.trim()
    const key = draftKey.trim()
    if (name.length === 0) {
      setError('请输入账号名称')
      return
    }
    if (key.length === 0) {
      setError('请输入 API Key')
      return
    }
    const workspace = draftWorkspace.trim()
    run({
      kind: 'add',
      // A stable id makes a retried submission idempotent on the host.
      id: crypto.randomUUID(),
      name,
      key,
      ...(workspace.length === 0 ? {} : { workspaceId: workspace }),
    }, () => {
      setDraftName('')
      setDraftKey('')
      setDraftWorkspace('')
      setAdding(false)
      setNotice('已添加账号，请确认已保存')
    })
  }

  /**
   * Store a new key for one existing account.
   * @param ref - the account's credential reference.
   */
  const replaceKey = (ref: string): void => {
    const key = draftKey.trim()
    if (key.length === 0) {
      setError('请输入新的 API Key')
      return
    }
    run({ kind: 'replace-key', ref, key }, () => {
      setDraftKey('')
      setReplacing(undefined)
      setNotice('已更新 Key')
    })
  }

  /**
   * Drop one account. The last account cannot be removed, because the plugin
   * would then have no credential to resolve at all.
   * @param ref - credential reference of the account to remove.
   */
  const remove = (ref: string): void => {
    run({ kind: 'remove', ref })
  }

  /**
   * Make one account active. Reordering is the selection.
   * @param ref - credential reference to promote.
   */
  const select = (ref: string): void => {
    run({ kind: 'select', ref })
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
        {accounts.map((account: OpenDesignAccount, index: number) => (
          <div
            key={account.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              padding: '8px 10px',
              borderRadius: '8px',
              border: '1px solid rgba(128, 128, 128, 0.2)',
              background: index === 0 ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '13px' }}>
                  {account.name || account.apiKeyEnv}
                  {index === 0 && <span style={{ marginLeft: '8px', fontSize: '11px', opacity: 0.6 }}>当前</span>}
                </div>
                <div style={{ fontSize: '11px', opacity: 0.55 }}>{account.apiKeyEnv}</div>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                {index !== 0 && (
                  <button type="button" disabled={!editable || busy} style={smallButton} onClick={() => { select(account.apiKeyEnv) }}>
                    设为当前
                  </button>
                )}
                <button
                  type="button"
                  disabled={!editable || busy}
                  style={smallButton}
                  onClick={() => { setReplacing(replacing === account.apiKeyEnv ? undefined : account.apiKeyEnv); setDraftKey(''); setError(undefined) }}
                >
                  {replacing === account.apiKeyEnv ? '取消' : '更换 Key'}
                </button>
                <button type="button" disabled={!editable || busy} style={smallButton} onClick={() => { remove(account.apiKeyEnv) }}>
                  移除
                </button>
              </div>
            </div>
            {replacing === account.apiKeyEnv && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', opacity: 0.7 }}>
                  新的 API Key
                  <input
                    type="password"
                    value={draftKey}
                    autoComplete="off"
                    onChange={(event) => { setDraftKey(event.target.value) }}
                    placeholder="sk-..."
                    style={input}
                  />
                </label>
                <div>
                  <button type="button" disabled={busy} style={smallButton} onClick={() => { replaceKey(account.apiKeyEnv) }}>
                    保存 Key
                  </button>
                </div>
              </div>
            )}
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
          <label style={{ fontSize: '12px', opacity: 0.7 }}>
            API Key
            <input
              type="password"
              value={draftKey}
              autoComplete="off"
              onChange={(event) => { setDraftKey(event.target.value) }}
              placeholder="sk-..."
              style={input}
            />
          </label>
          <label style={{ fontSize: '12px', opacity: 0.7 }}>
            工作空间 ID（可选，仅用于以后读取额度）
            <input
              type="text"
              value={draftWorkspace}
              onChange={(event) => { setDraftWorkspace(event.target.value) }}
              placeholder="workspaceId"
              style={input}
            />
          </label>
          <p style={hint}>
            Key 由宿主凭据服务保存，页面不会回显已保存的密钥；引用名由插件自动分配。
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" disabled={busy} style={smallButton} onClick={add}>
              {busy ? '保存中…' : '确认'}
            </button>
            <button
              type="button"
              style={smallButton}
              onClick={() => { setAdding(false); setDraftKey(''); setError(undefined) }}
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button
            type="button"
            disabled={!editable || atCap}
            style={smallButton}
            onClick={() => { setAdding(true); setNotice(undefined) }}
          >
            添加账号
          </button>
          {atCap && <p style={{ ...hint, marginTop: '6px' }}>已达 {MAX_ACCOUNTS} 个账号上限</p>}
        </div>
      )}

      {error !== undefined && <p style={{ ...hint, color: '#e5484d' }}>{error}</p>}
      {notice !== undefined && <p style={hint}>{notice}</p>}
    </div>
  )
}
