/**
 * The "OpenDesign Go" settings page body.
 *
 * One page covers the whole route: the enable switch and interface protocol,
 * the accounts that bill inference, the model list the Go plan grants, the quota
 * windows and their reconciliation, local usage, and the update card.
 *
 * Every reading arrives through the same config document — quota, ledger,
 * diagnostics, update notice — because the host already publishes them there.
 * Only mutations reach for a Remote namespace, and only two of them: account
 * writes (`remote.settings` / `remote.credentials`) and plugin updates
 * (`remote.pluginManager`).
 *
 * @module dsh-opendesign-go/client/Section
 */
import { useMemo, useState, useEffect, useSyncExternalStore } from 'react'
import type { ReactElement } from 'react'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { PROFILE_ENTRY_ID, PROTOCOL_IDS, PROTOCOL_LABELS } from '../config-contract.ts'
import type { OpenDesignConfig, ProtocolId } from '../config-contract.ts'
import type { UsageSnapshot } from '../usage-contract.ts'
import { parseReport, parseUsage } from '../usage-contract.ts'
import { parseRouteDiagnostics } from '../diagnostics.ts'
import { QuotaCard } from './QuotaCard.tsx'
import { BillingCard } from './BillingCard.tsx'
import { parseBaseline, parsePlanOverrides, planOf } from '../plans.ts'
import { parseUpdate } from '../update-check.ts'
import { explainRouteProblem } from './route-explanation.ts'
import { UsageCard } from './UsageCard.tsx'
import { AccountsCard } from './AccountsCard.tsx'
import { ModelsCard } from './ModelsCard.tsx'
import type { ChannelState, ExecuteAccountCommand } from './accounts-controller.ts'
import type { RunUpdate, UpdateChannelState, UpdateOutcome } from './update-controller.ts'
import { Badge, Button, Card, Row, Switch, cx } from './ui/primitives.tsx'
import tokens from './ui/tokens.module.css'
import styles from './Section.module.css'

/** Props injected into the section by the registering plugin. */
export interface OpenDesignSectionInjected {
  /** Live config form bound to this plugin's profile entry. */
  readonly form: ConfigForm<OpenDesignConfig>
  /** Sends account mutations to the host, which owns credential storage. */
  readonly execute: ExecuteAccountCommand
  /** Reads which step the command channel reached, for diagnostics. */
  readonly channelState: ChannelState
  /** Updates this plugin through the npm registry. */
  readonly updateFromNpm: RunUpdate
  /** Reinstalls this plugin from its repository tag, as the fallback route. */
  readonly installFromGithub: RunUpdate
  /** Reads which step the update channel reached, for diagnostics. */
  readonly updateState: UpdateChannelState
}

/**
 * Render the settings page.
 * @param props - injected config form and optional quota reader.
 * @returns the page body.
 */
export function OpenDesignSection({
  form,
  execute,
  channelState,
  updateFromNpm,
  installFromGithub,
  updateState,
}: OpenDesignSectionInjected): ReactElement {
  const snapshot = useSyncExternalStore(
    (listener) => form.subscribe(listener),
    () => form.getSnapshot(),
    // The same reading for a render that has no client store, so the page can
    // still be rendered to markup outside the app (tests, snapshots).
    () => form.getSnapshot(),
  )
  const value = snapshot.value
  const enabled = value?.enabled ?? true
  const editable = snapshot.status === 'ready' && snapshot.writable
  const useVela = value?.useVelaCredential ?? false
  // The host publishes each quota reading into the config document, which this
  // page already receives; parsing it here needs no second transport and keeps
  // one source of truth.
  const usage = useMemo(() => parseUsage(value?.usageJson), [value?.usageJson])
  // Local accounting: produced by this plugin's own adapter, so it needs no
  // console session and is the primary usage surface.
  const report = useMemo(() => parseReport(value?.reportJson), [value?.reportJson])
  const routeState = useMemo(() => parseRouteDiagnostics(value?.diagnosticsJson), [value?.diagnosticsJson])
  // Plan row: the advertised allowance is a default, so an operator override
  // wins. `plan` stays undefined for a tier this build does not know, and the
  // billing card then omits that row rather than inventing a cap.
  const plan = useMemo(
    () => (usage === undefined ? undefined : planOf(usage.tier, parsePlanOverrides(value?.planOverrides))),
    [usage?.tier, value?.planOverrides],
  )
  const baseline = useMemo(() => parseBaseline(value?.alignBaselineJson), [value?.alignBaselineJson])
  // Published release newer than this build, filled by the startup check. Absent
  // means either up to date or the registry was unreachable; both read the same
  // way to a user, so no banner appears.
  const update = useMemo(() => parseUpdate(value?.updateJson), [value?.updateJson])
  // Explains an empty model picker where the status line alone was not enough:
  // "未注册" states the symptom, not the cause or the fix.
  const routeProblem = useMemo(() => explainRouteProblem(routeState), [routeState])

  /**
   * Ask the host for a reading now.
   *
   * The page has no direct line to the quota reader, but the host already watches
   * this configuration for changes, so writing a fresh nonce both expresses the
   * request and carries it. `refreshing` is cleared when the reading's timestamp
   * moves past the moment the button was pressed — not on the write resolving,
   * because the write succeeds long before the CLI answers.
   */
  const [refreshingSince, setRefreshingSince] = useState<number | undefined>(undefined)
  const refreshQuota = (): void => {
    const at = Date.now()
    setRefreshingSince(at)
    void form.mutate([{ op: 'set', path: ['refreshNonce'], value: String(at) }])
      .catch((error: unknown) => {
        setRefreshingSince(undefined)
        console.error('llm-opendesign-go: could not request a quota refresh', error)
      })
  }
  const usageAt = usage === undefined ? undefined : Date.parse(usage.asOf)
  const refreshing = refreshingSince !== undefined
    && (usageAt === undefined || usageAt < refreshingSince)
  useEffect(() => {
    // A read that never lands would leave the button stuck on "读取中…", so the
    // wait is bounded: the request is one CLI call, not a state to hold forever.
    if (!refreshing) return undefined
    const timer = setTimeout(() => { setRefreshingSince(undefined) }, 15_000)
    return () => { clearTimeout(timer) }
  }, [refreshing])

  /**
   * Record the current credits reading as the zero point.
   *
   * Plan credits accumulate over the window and include traffic this plugin
   * never saw, so only an increment measured from a shared instant is
   * comparable with the plugin's own total.
   */
  const align = (): void => {
    if (usage === undefined) return
    const widest = usage.windows.reduce<typeof usage.windows[number] | undefined>(
      (best, window) => (best === undefined || window.durationSeconds > best.durationSeconds ? window : best),
      undefined,
    )
    if (widest === undefined) return
    const credits = Number(widest.usedCredits)
    if (!Number.isFinite(credits)) return
    const payload = {
      at: Date.now(),
      credits,
      measuredUsd: report?.costUsd ?? 0,
    }
    void form.mutate([{ op: 'set', path: ['alignBaselineJson'], value: JSON.stringify(payload) }])
      .catch((error: unknown) => { console.error('llm-opendesign-go: could not save the baseline', error) })
  }

  /**
   * Flip the route switch. A refusal is surfaced instead of swallowed: the
   * Host validates the write, so silence would read as success.
   * @param next - the value the user selected.
   */
  const toggle = (next: boolean): void => {
    void form.set('enabled', next).catch((error: unknown) => {
      // The store owns the message; keep the page responsive and honest.
      console.error('llm-opendesign-go: could not save the enable switch', error)
    })
  }

  /**
   * Switch this route's inference surface.
   *
   * Written through the same form as every other field, so the Host validates
   * it; a refused write is logged rather than silently reverted, because the
   * switch would otherwise snap back with no explanation.
   * @param next - the surface the user picked.
   */
  const pickProtocol = (next: ProtocolId): void => {
    void form.set('protocol', next).catch((error: unknown) => {
      console.error('llm-opendesign-go: could not save the protocol choice', error)
    })
  }

  /**
   * Force the settings mirror to reload. The mirror is populated on its own
   * schedule; a page opened before the first describe lands would otherwise sit
   * on `loading` with no way out, so the user gets an explicit retry.
   */
  const retry = (): void => {
    form.getSnapshot()
    window.location.reload()
  }

  /** Which update route is running, so its button can show it and the other waits. */
  const [updating, setUpdating] = useState<'npm' | 'github' | undefined>(undefined)
  /** The last outcome, which replaces the buttons until the page is reloaded. */
  const [outcome, setOutcome] = useState<UpdateOutcome | undefined>(undefined)

  /**
   * Run one update route and keep its answer.
   *
   * Nothing here reloads automatically: a landed update needs the Host to
   * restart before it is live, and a reload in the middle of that would read as
   * "nothing happened". The outcome stays on screen instead.
   * @param kind - which route to run.
   * @param run - that route's executor.
   * @param version - the version to install.
   */
  const runUpdate = (kind: 'npm' | 'github', run: RunUpdate, version: string): void => {
    setUpdating(kind)
    setOutcome(undefined)
    void run(version).then((answer) => {
      setUpdating(undefined)
      setOutcome(answer)
    }).catch((error: unknown) => {
      // The executors already turn failures into messages; reaching here means a
      // programming error, which still must not leave the button spinning.
      setUpdating(undefined)
      setOutcome({ ok: false, message: String(error) })
    })
  }

  return (
    <div className={cx(tokens.scope, styles.page)}>
      <header className={styles.header}>
        <h1 className={styles.title}>OpenDesign Go</h1>
        <p className={styles.subtitle}>选择会话中显示的 OpenDesign Go 模型，并调整其设置。</p>
      </header>

      {snapshot.status === 'loading' && (
        <div className={styles.inlineActions}>
          <span className={styles.subtitle}>正在读取配置…</span>
          <Button onClick={retry}>重新加载</Button>
        </div>
      )}

      {snapshot.status === 'unavailable' && (
        <div className={cx(styles.notice, styles.noticeWarn)}>
          <span>宿主未暴露本插件的配置项（namespace: {PROFILE_ENTRY_ID}）。</span>
          <span className={styles.noticeFoot}>
            诊断：{snapshot.status} / revision={String(snapshot.revision)} / writable={String(snapshot.writable)}
          </span>
          <div className={styles.inlineActions}><Button onClick={retry}>重新加载</Button></div>
        </div>
      )}

      {routeProblem !== undefined && (
        <div className={cx(styles.notice, styles.noticeWarn)}>
          <div className={styles.noticeTitle}>⚠ {routeProblem.title}</div>
          <ul className={styles.noticeList}>
            {routeProblem.causes.map((cause) => <li key={cause.text}>{cause.text}</li>)}
          </ul>
          <div className={styles.noticeFoot}>最新状态见页面下方的「路由状态」。</div>
        </div>
      )}

      <Card
        title="启用 OpenDesign Go"
        description="关闭后，本插件提供的模型会从会话选择器中移除。"
        actions={(
          <Switch
            checked={enabled}
            disabled={!editable}
            label="启用 OpenDesign Go"
            onChange={toggle}
          />
        )}
      >
        <Row
          label="在输入框旁显示额度"
          hint="始终显示 5 小时与 7 天的剩余额度，点开可看每条窗口的明细与钱包余额。"
        >
          <Switch
            checked={value?.composerUsage ?? true}
            disabled={!editable}
            label="在输入框旁显示额度"
            onChange={(next) => { void form.set('composerUsage', next) }}
          />
        </Row>
        <Row
          label="接口协议"
          hint="两条协议由同一网关提供、计费相同。Chat Completions 会返回模型自己的完整思维链；Responses 只返回被改写的摘要，且预算紧张时空回答略多。"
        >
          <div className={styles.protocolPicker}>
            {PROTOCOL_IDS.map((id) => (
              <Button
                key={id}
                variant={(value?.protocol ?? 'chat') === id ? 'primary' : 'ghost'}
                disabled={!editable}
                onClick={() => { pickProtocol(id) }}
              >
                {PROTOCOL_LABELS[id]}
              </Button>
            ))}
          </div>
        </Row>
      </Card>

      <AccountsCard form={form} config={value} editable={editable} execute={execute} channelState={channelState} />

      <ModelsCard form={form} config={value} editable={editable} />

      <QuotaCard
        snapshot={usage}
        loading={false}
        ledgerCostUsd={report?.costUsd}
        onRefresh={editable ? refreshQuota : undefined}
        refreshing={refreshing}
      />

      <BillingCard
        snapshot={usage}
        plan={plan}
        measuredUsd={report?.costUsd}
        baseline={baseline}
        onAlign={usage === undefined ? undefined : align}
        editable={editable}
      />

      <UsageCard report={report} />

      <Card
        title="额度来源"
        description="决定 5 小时 / 7 天额度从哪里读取。"
        badge={useVela ? <Badge tone="ok">本机登录</Badge> : <Badge>会话凭据</Badge>}
      >
        <Row
          label="使用本机 OpenDesign 的登录凭证"
          hint="装过并登录过 OpenDesign 桌面端时，勾选即可读到真实额度，无需再填凭据。只用 API Key 就保持关闭。"
        >
          <Switch
            checked={useVela}
            disabled={!editable}
            label="使用本机 OpenDesign 的登录凭证"
            onChange={(next) => { void form.set('useVelaCredential', next) }}
          />
        </Row>
        {useVela && (
          <p className={styles.routeLine}>
            读取方式：调用 OpenDesign 桌面端自带的 vela 命令行。该命令是官方私有接口，
            若 OpenDesign 升级后格式变化，这里会显示失败原因而不是给出错误数字。
          </p>
        )}
      </Card>

      <Card
        title="路由状态"
        description="本插件在宿主里的注册结果，与额度无关。"
        badge={routeState === undefined
          ? <Badge>未知</Badge>
          : routeState.registered ? <Badge tone="ok">已注册</Badge> : <Badge tone="warn">未注册</Badge>}
      >
        {routeState === undefined ? (
          <p className={styles.routeLine}>宿主尚未上报路由状态。重启后若仍为空，说明插件未完成激活。</p>
        ) : (
          <p className={styles.routeLine}>
            <span>启用={String(routeState.enabled)}</span>
            <span className={styles.footerSep}>·</span>
            <span>凭据={routeState.credentialResolved ? '已解析' : '未解析'}（{routeState.triedRef || '无'}）</span>
            <span className={styles.footerSep}>·</span>
            <span>声明模型 {routeState.modelCount} 个</span>
            {routeState.lastError !== undefined && (
              <>
                <span className={styles.footerSep}>·</span>
                <span>失败：{routeState.lastError}</span>
              </>
            )}
          </p>
        )}
      </Card>

      {update !== undefined && (
        <Card
          title={`有新版本（当前 ${update.current}）`}
          description="桌面端插件管理里也能更新；这里的两个按钮走同一条 Host 通道。"
          badge={outcome === undefined
            ? undefined
            : outcome.ok ? <Badge tone="ok">完成</Badge> : <Badge tone="warn">失败</Badge>}
        >
          {outcome !== undefined && (
            <p className={styles.routeLine}>{outcome.message}</p>
          )}
          {update.latest !== undefined && (
            <Row
              label={`npm：${update.latest}`}
              hint="走 npm registry，与插件管理界面同一条路径。刚发布的版本可能被 pnpm 的最短发布时长检查拦下，几小时后再试即可。"
            >
              <Button
                variant="primary"
                disabled={updating !== undefined}
                onClick={() => { runUpdate('npm', updateFromNpm, update.latest as string) }}
              >
                {updating === 'npm' ? '更新中…' : '一键更新'}
              </Button>
            </Row>
          )}
          {update.githubLatest !== undefined && (
            <Row
              label={`GitHub：v${update.githubLatest}`}
              hint="从仓库标签安装。会先卸载当前版本再装，失败时自动装回原版本；适合 registry 还没轮到、或想装回某个具体版本。"
            >
              <Button
                variant={update.latest === undefined ? 'primary' : 'ghost'}
                disabled={updating !== undefined}
                onClick={() => { runUpdate('github', installFromGithub, update.githubLatest as string) }}
              >
                {updating === 'github' ? '安装中…' : '从 GitHub 装'}
              </Button>
            </Row>
          )}
          <p className={styles.routeLine}>
            {/* The stage is shown because "nothing happened" on a failed click is
                indistinguishable from a page that never wired the namespace. */}
            <span className={styles.noticeFoot}>更新通道：{updateState()}</span>
          </p>
        </Card>
      )}

      <div className={styles.footer}>
        <a className={styles.link} href="https://github.com/EliteOtaku/dsh-opendesign-go" target="_blank" rel="noreferrer noopener">
          GitHub 仓库 · 欢迎 Star ★
        </a>
        <span className={styles.footerSep}>|</span>
        <a className={styles.link} href="https://github.com/EliteOtaku/dsh-opendesign-go#readme" target="_blank" rel="noreferrer noopener">
          文档
        </a>
        <span className={styles.footerSep}>|</span>
        <a className={styles.link} href="https://github.com/EliteOtaku/dsh-opendesign-go/issues" target="_blank" rel="noreferrer noopener">
          反馈问题
        </a>
      </div>
    </div>
  )
}
