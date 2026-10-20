/**
 * Explains why the model picker might be empty.
 *
 * The failure this addresses is the one the user hit: the settings page renders
 * normally while the session model picker shows nothing, and the only clue is a
 * status line in the middle of the page that reads "未注册". Without a cause and
 * a next step, that is indistinguishable from "the plugin is broken" and the only
 * recovery is asking someone.
 *
 * The route can be absent for four different reasons, three of which the user can
 * fix. Naming them is the whole point: the fix differs completely between a
 * missing profile entry and an unresolved credential.
 *
 * @module dsh-opendesign-go/route-explanation
 */

import type { RouteDiagnostics } from '../diagnostics.ts'

/** One thing the user should look at, ordered most likely first. */
export interface RouteCause {
  /** Short label, shown as a bullet. */
  readonly text: string
}

/** Why the route is absent, when it is. */
export interface RouteProblem {
  /** Headline stating the observable symptom. */
  readonly title: string
  /** Causes and next steps, most likely first. */
  readonly causes: readonly RouteCause[]
}

/**
 * Decide whether the user needs an explanation, and what it should say.
 *
 * Returns undefined when the route is registered, and also when the host has not
 * reported yet — an unactivated plugin is a different situation (the page would
 * not render at all in most cases), and guessing at causes with no data would
 * produce a warning that is itself unreliable.
 * @param diagnostics - last reported route state, or undefined when never reported.
 * @returns the problem to display, or undefined when there is nothing wrong.
 */
export function explainRouteProblem(diagnostics: RouteDiagnostics | undefined): RouteProblem | undefined {
  if (diagnostics === undefined) return undefined
  if (diagnostics.registered) return undefined

  const causes: RouteCause[] = []

  // The switch is the first thing to check because it is the cheapest to fix and
  // the most common way to arrive here on purpose.
  if (!diagnostics.enabled) {
    causes.push({ text: '「启用 OpenDesign Go」开关是关的，打开它即可' })
  }

  // Next: a credential that did not resolve. Without it the route is withheld by
  // design, so this is the expected state until a key is stored.
  if (!diagnostics.credentialResolved) {
    causes.push({
      text: `凭据 ${diagnostics.triedRef || '（未配置）'} 没有解析到，检查 API Key 是否已保存`,
    })
  }

  // Last resort: the failure both harder to see and harder to fix. It is the
  // state produced by a half-completed install, which is what an interrupted
  // package update leaves behind.
  if (diagnostics.enabled && diagnostics.credentialResolved) {
    causes.push({
      text: '插件条目可能没有完整注册：profile 的 dsh.profile.bundles 缺少 dsh-opendesign-go，卸载后重装一次',
    })
    if (diagnostics.lastError !== undefined) {
      causes.push({ text: `宿主报告：${diagnostics.lastError}` })
    }
  }

  return {
    title: '模型没有注册，会话的模型选择器里看不到它们',
    causes,
  }
}
