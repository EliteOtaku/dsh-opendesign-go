/**
 * Local usage card: what this plugin's own calls cost, per model.
 *
 * It answers the question a user can act on — which model on which key is
 * spending what — and needs no credential, because the numbers come from the
 * token usage the adapter already received. The console's own quota is a
 * different question and stays out of scope.
 *
 * Every figure is labelled with what it is not: only the base price tier is
 * public, so a long-context request is undercounted, and a model without a
 * published price contributes tokens but no money.
 *
 * @module dsh-opendesign-go/client/UsageCard
 */
import type { ReactElement } from 'react'
import type { UsageReport } from '../usage-ledger.ts'
import { Card, cx } from './ui/primitives.tsx'
import styles from './UsageCard.module.css'

/**
 * Format a token count compactly.
 * @param tokens - raw count.
 * @returns text such as `12.3k`.
 */
function tokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`
  return String(tokens)
}

/**
 * Format a dollar amount.
 * @param usd - amount.
 * @returns text with four decimals below a cent, so tiny costs stay visible.
 */
function money(usd: number): string {
  return usd >= 0.01 ? `$${usd.toFixed(2)}` : `$${usd.toFixed(4)}`
}

/**
 * Render the local usage card.
 * @param props - the trailing-window report, or undefined while none exists.
 * @returns the card.
 */
export function UsageCard({ report }: { readonly report: UsageReport | undefined }): ReactElement {
  if (report === undefined || (report.calls === 0 && report.recovered === undefined)) {
    return (
      <Card
        title="本地用量"
        description="还没有通过本插件发出的请求。这里只统计经本插件路由的调用，其他 provider 与 OpenDesign 官方客户端的用量不计入。"
      />
    )
  }

  return (
    <Card
      title="本地用量 · 近 30 天"
      description={report.unpricedCalls > 0 ? `本次有 ${report.unpricedCalls} 次请求未计入金额。` : undefined}
      actions={(
        <span className={styles.headCell}>
          {report.calls} 次请求 · 估算 {money(report.costUsd)}
        </span>
      )}
    >
      {report.recovered !== undefined && report.recovered.calls > 0 && (
        <div className={styles.recovered}>
          <span>
            另有 {report.recovered.calls} 次历史调用（{money(report.recovered.costUsd)}）未经过本插件，从会话日志补算。
          </span>
          <span>
            这些是插件做出来之前，用 DSH 自定义模型直连 OpenDesign 的消耗；
            缓存读 {Math.round(report.recovered.cacheReadTokens / 1000)}k token 已计入。
          </span>
        </div>
      )}

      <div className={styles.table}>
        <span className={styles.headCell}>模型</span>
        <span className={cx(styles.headCell, styles.num)}>输入 / 输出</span>
        <span className={cx(styles.headCell, styles.num)}>请求</span>
        <span className={cx(styles.headCell, styles.num)}>估算</span>

        {report.models.map((row) => (
          <span key={row.model} style={{ display: 'contents' }}>
            <span className={cx(styles.cell, styles.model)} title={row.model}>{row.model}</span>
            <span className={cx(styles.cell, styles.num)}>
              {tokens(row.inputTokens)} / {tokens(row.outputTokens)}
            </span>
            <span className={cx(styles.cell, styles.num)}>{row.calls}</span>
            <span className={cx(styles.cell, styles.num)}>
              {row.unpricedCalls === row.calls ? '未定价' : money(row.costUsd)}
            </span>
          </span>
        ))}
      </div>

      <p className={styles.foot}>
        金额按官方公开价目表的<b>基础档</b>估算：超出阶梯阈值的请求会被低估；标「未定价」的模型只计 token，不计金额。
        这不是账单，实际扣费以 OpenDesign 控制台为准。
      </p>
    </Card>
  )
}
