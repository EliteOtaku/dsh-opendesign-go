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

const card = {
  border: '1px solid rgba(128, 128, 128, 0.25)',
  borderRadius: '10px',
  padding: '14px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
} as const

const hint = { fontSize: '13px', opacity: 0.65, margin: 0 } as const

const rowStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr auto auto auto',
  gap: '10px',
  alignItems: 'baseline',
  fontSize: '12px',
  padding: '6px 0',
  borderTop: '1px solid rgba(128, 128, 128, 0.14)',
} as const

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
  if (report === undefined || report.calls === 0) {
    return (
      <div style={card}>
        <div style={{ fontSize: '14px', fontWeight: 500 }}>本地用量</div>
        <p style={hint}>
          还没有通过本插件发出的请求。这里只统计经本插件路由的调用，其他 provider 与 OpenDesign
          官方客户端的用量不计入。
        </p>
      </div>
    )
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontSize: '14px', fontWeight: 500 }}>本地用量 · 近 30 天</div>
        <span style={{ fontSize: '12px', opacity: 0.6 }}>
          {report.calls} 次请求 · 估算 {money(report.costUsd)}
        </span>
      </div>

      <div style={{ ...rowStyle, borderTop: 'none', opacity: 0.55, paddingBottom: 0 }}>
        <span>模型</span>
        <span>输入 / 输出</span>
        <span>请求</span>
        <span style={{ textAlign: 'right' }}>估算</span>
      </div>

      {report.models.map((row) => (
        <div key={row.model} style={rowStyle}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.model}</span>
          <span style={{ fontVariantNumeric: 'tabular-nums', opacity: 0.75 }}>
            {tokens(row.inputTokens)} / {tokens(row.outputTokens)}
          </span>
          <span style={{ fontVariantNumeric: 'tabular-nums', opacity: 0.75 }}>{row.calls}</span>
          <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
            {row.unpricedCalls === row.calls ? '未定价' : money(row.costUsd)}
          </span>
        </div>
      ))}

      <p style={{ ...hint, fontSize: '11px', lineHeight: 1.5 }}>
        金额按官方公开价目表的**基础档**估算：超出阶梯阈值的请求会被低估；标「未定价」的模型只计 token，不计金额。
        {report.unpricedCalls > 0 && ` 本次有 ${report.unpricedCalls} 次请求未计入金额。`}
        这不是账单，实际扣费以 OpenDesign 控制台为准。
      </p>
    </div>
  )
}
