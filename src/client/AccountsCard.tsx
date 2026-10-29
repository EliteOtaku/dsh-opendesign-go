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
import type { ChannelState, ExecuteAccountCommand } from './accounts-controller.ts'
import { Badge, Button, Card, Field, Input, cx } from './ui/primitives.tsx'
import styles from './AccountsCard.module.css'

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
export function AccountsCard({ form, config, editable, execute, channelState }: {
  readonly form: ConfigForm<OpenDesignConfig>
  readonly config: OpenDesignConfig | undefined
  readonly editable: boolean
  /** Sends an account command to the host, which owns credential storage. */
  readonly execute: ExecuteAccountCommand
  /** Reads which step the command channel reached, for diagnostics. */
  readonly channelState: ChannelState
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
        // Name the stage the channel reached: "未就绪" alone cannot distinguish a
        // failed mount from a namespace that never appeared.
        setError(result === 'unknown' ? `${message}（通道状态：${channelState()}）` : message)
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
    <Card
      title="账号"
      description="每个账号是一份独立的 OpenDesign 订阅。同一工作空间内的多个 Key 共享同一份额度，因此多账号的意义是「多买几份 Go」，而不是「一个订阅拆成几把钥匙」。"
      actions={(
        <span className={styles.accountEnv}>
          {accounts.length} 个 · 当前 {accounts[0]?.name || accounts[0]?.apiKeyEnv || '未配置'}
        </span>
      )}
    >
      <div className={styles.accounts}>
        {accounts.map((account: OpenDesignAccount, index: number) => (
          <div key={account.id} className={cx(styles.account, index === 0 && styles.accountActive)}>
            <div className={styles.accountTop}>
              <div className={styles.accountMain}>
                <div className={styles.accountText}>
                  <span className={styles.accountName}>{account.name || account.apiKeyEnv}</span>
                  <span className={styles.accountEnv}>{account.apiKeyEnv}</span>
                </div>
                {index === 0 && <Badge tone="ok">当前</Badge>}
              </div>
              <div className={styles.accountActions}>
                {index !== 0 && (
                  <Button disabled={!editable || busy} onClick={() => { select(account.apiKeyEnv) }}>
                    设为当前
                  </Button>
                )}
                <Button
                  disabled={!editable || busy}
                  onClick={() => {
                    setReplacing(replacing === account.apiKeyEnv ? undefined : account.apiKeyEnv)
                    setDraftKey('')
                    setError(undefined)
                  }}
                >
                  {replacing === account.apiKeyEnv ? '取消' : '更换 Key'}
                </Button>
                <Button variant="danger" disabled={!editable || busy} onClick={() => { remove(account.apiKeyEnv) }}>
                  移除
                </Button>
              </div>
            </div>
            {replacing === account.apiKeyEnv && (
              <div className={styles.form}>
                <Field label="新的 API Key">
                  <Input type="password" value={draftKey} onChange={setDraftKey} placeholder="sk-..." />
                </Field>
                <div className={styles.formActions}>
                  <Button variant="primary" disabled={busy} onClick={() => { replaceKey(account.apiKeyEnv) }}>
                    保存 Key
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {adding ? (
        <div className={styles.form}>
          <Field label="账号名称">
            <Input value={draftName} onChange={setDraftName} placeholder="例如：主账号" />
          </Field>
          <Field label="API Key">
            <Input type="password" value={draftKey} onChange={setDraftKey} placeholder="sk-..." />
          </Field>
          <Field label="工作空间 ID（可选，仅用于以后读取额度）">
            <Input value={draftWorkspace} onChange={setDraftWorkspace} placeholder="workspaceId" />
          </Field>
          <p className={styles.cap}>Key 由宿主凭据服务保存，页面不会回显已保存的密钥；引用名由插件自动分配。</p>
          <div className={styles.formActions}>
            <Button variant="primary" disabled={busy} onClick={add}>
              {busy ? '保存中…' : '确认'}
            </Button>
            <Button onClick={() => { setAdding(false); setDraftKey(''); setError(undefined) }}>
              取消
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button disabled={!editable || atCap} onClick={() => { setAdding(true); setNotice(undefined) }}>
            添加账号
          </Button>
          {atCap && <p className={styles.cap}>已达 {MAX_ACCOUNTS} 个账号上限</p>}
        </div>
      )}

      {error !== undefined && <p className={styles.error}>{error}</p>}
      {notice !== undefined && <p className={styles.notice}>{notice}</p>}
    </Card>
  )
}
