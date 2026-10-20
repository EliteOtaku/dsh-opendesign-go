import { describe, expect, it } from 'vitest'
import { explainRouteProblem } from '../src/client/route-explanation.ts'
import type { RouteDiagnostics } from '../src/diagnostics.ts'

/** A healthy route, which is the baseline the cases below deviate from. */
const healthy: RouteDiagnostics = {
  registered: true,
  enabled: true,
  credentialResolved: true,
  triedRef: 'OPENDESIGN_API_KEY',
  modelCount: 12,
  asOf: '2026-10-20T00:00:00.000Z',
}

describe('explainRouteProblem', () => {
  it('says nothing when the route is registered', () => {
    // A healthy plugin must not grow a warning banner; that would train users to
    // ignore the one that matters.
    expect(explainRouteProblem(healthy)).toBeUndefined()
  })

  it('says nothing before the host has reported', () => {
    // No data means no diagnosis. Guessing here would produce a warning that is
    // itself unreliable, which is worse than silence.
    expect(explainRouteProblem(undefined)).toBeUndefined()
  })

  it('names the switch when it is off', () => {
    // The cheapest fix, so it goes first.
    const problem = explainRouteProblem({ ...healthy, registered: false, enabled: false })
    expect(problem?.causes[0]?.text).toContain('开关是关的')
  })

  it('names the credential when it did not resolve', () => {
    const problem = explainRouteProblem({ ...healthy, registered: false, credentialResolved: false })
    const text = problem?.causes.map((cause) => cause.text).join(' ')
    expect(text).toContain('OPENDESIGN_API_KEY')
    expect(text).toContain('没有解析')
  })

  it('points at the profile entry when the switch and credential are fine', () => {
    // This is the state a half-completed install leaves behind: everything looks
    // configured and nothing is registered. It is the case that produced no
    // usable signal at all before.
    const problem = explainRouteProblem({ ...healthy, registered: false })
    const text = problem?.causes.map((cause) => cause.text).join(' ')
    expect(text).toContain('dsh.profile.bundles')
    expect(text).toContain('卸载后重装')
  })

  it('surfaces the host error when there is one', () => {
    const problem = explainRouteProblem({
      ...healthy,
      registered: false,
      lastError: 'registerAdapter refused',
    })
    const text = problem?.causes.map((cause) => cause.text).join(' ')
    expect(text).toContain('registerAdapter refused')
  })

  it('always states the symptom, so the banner is self-explanatory', () => {
    const problem = explainRouteProblem({ ...healthy, registered: false })
    expect(problem?.title).toContain('模型选择器')
    expect(problem?.causes.length).toBeGreaterThan(0)
  })

  it('lists several causes when several apply', () => {
    // Disabled and uncredentialed are independent; showing only the first would
    // send the user round the loop twice.
    const problem = explainRouteProblem({
      ...healthy,
      registered: false,
      enabled: false,
      credentialResolved: false,
    })
    expect(problem?.causes.length).toBe(2)
  })
})
