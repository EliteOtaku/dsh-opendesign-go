import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpenDesignUsageService } from '../src/usage.ts'

/** Build the console payload the real endpoint returns, trimmed to used fields. */
function usagePayload(windows: { durationSeconds: number, used: string, limit: string, remaining: string }[]) {
  return {
    workspaceId: 'ws-1',
    generatedAt: '2026-10-19T09:00:00.000Z',
    eligible: true,
    tier: 'go',
    windows: windows.map((w, index) => ({
      policyId: `policy-${index}`,
      durationSeconds: w.durationSeconds,
      resetMode: 'anchored_recurring',
      usedCredits: w.used,
      limitCredits: w.limit,
      remainingCredits: w.remaining,
      windowStart: '2026-10-19T00:00:00.000Z',
      resetsAt: '2026-10-19T14:00:00.000Z',
    })),
  }
}

/** Build a service over a fixed session and workspace. */
function serviceOf(options: {
  session?: string | undefined
  workspace?: string | undefined
} = {}) {
  return new OpenDesignUsageService({
    // `in` keeps an explicit undefined meaningful: it is how a test says
    // "nothing is stored", which `??` would turn back into the default.
    resolveSession: async () => ('session' in options ? options.session : 'session-token'),
    workspaceOf: () => ('workspace' in options ? options.workspace : 'ws-1'),
    activeRef: () => 'OPENDESIGN_API_KEY',
  })
}

/** Stub fetch with one canned response per URL substring. */
function stubConsole(routes: Record<string, unknown>) {
  return vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    for (const [needle, body] of Object.entries(routes)) {
      if (String(url).includes(needle)) {
        return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
      }
    }
    return new Response('{"error":"not found"}', { status: 404 })
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('OpenDesignUsageService', () => {
  it('reads both windows and derives percentages from the exact strings', async () => {
    stubConsole({
      'coding-plan-usage': usagePayload([
        { durationSeconds: 18000, used: '30', limit: '120', remaining: '90' },
        { durationSeconds: 604800, used: '60', limit: '120', remaining: '60' },
      ]),
      'billing/summary': { balanceUsd: '1.50', subscriptionCurrentPeriodEnd: '2026-11-19T00:00:00.000Z' },
    })

    const snapshot = await serviceOf().read()

    expect(snapshot.error).toBeUndefined()
    expect(snapshot.tier).toBe('go')
    expect(snapshot.eligible).toBe(true)
    expect(snapshot.windows).toHaveLength(2)
    // Sorted shortest first so the page renders 5h then 7d regardless of console order.
    expect(snapshot.windows[0]?.durationSeconds).toBe(18000)
    expect(snapshot.windows[0]?.percentUsed).toBe(25)
    expect(snapshot.windows[1]?.percentUsed).toBe(50)
    expect(snapshot.wallet?.balanceUsd).toBe('1.50')
    expect(snapshot.wallet?.subscriptionPeriodEnd).toBe('2026-11-19T00:00:00.000Z')
  })

  it('reports the channel as unconfigured instead of failing when no session is stored', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const snapshot = await serviceOf({ session: undefined }).read()

    expect(snapshot.error).toBe('console session not configured')
    expect(snapshot.windows).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses to guess a workspace instead of reading someone else quota', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const snapshot = await serviceOf({ workspace: undefined }).read()

    expect(snapshot.error).toBe('workspace id not configured for this account')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('turns an expired session into a degraded snapshot, not a throw', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"unauthenticated"}', { status: 401 })))
    const snapshot = await serviceOf().read()

    expect(snapshot.error).toBe('console session expired or invalid')
    expect(snapshot.windows).toEqual([])
  })

  it('drops unusable windows rather than reporting zero usage', async () => {
    stubConsole({
      'coding-plan-usage': {
        eligible: true,
        tier: 'go',
        windows: [
          { durationSeconds: 18000, usedCredits: '30', limitCredits: '120', remainingCredits: '90', resetsAt: '2026-10-19T14:00:00.000Z' },
          { durationSeconds: 'not-a-number', usedCredits: '1', limitCredits: '2', remainingCredits: '1' },
        ],
      },
      'billing/summary': {},
    })

    const snapshot = await serviceOf().read()

    expect(snapshot.windows).toHaveLength(1)
    expect(snapshot.windows[0]?.percentUsed).toBe(25)
  })

  it('keeps the reading usable when the wallet endpoint fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('coding-plan-usage')) {
        return new Response(JSON.stringify(usagePayload([
          { durationSeconds: 18000, used: '0', limit: '120', remaining: '120' },
        ])), { status: 200 })
      }
      return new Response('boom', { status: 500 })
    }))

    const snapshot = await serviceOf().read()

    expect(snapshot.error).toBeUndefined()
    expect(snapshot.wallet).toBeUndefined()
    expect(snapshot.windows).toHaveLength(1)
  })

  it('describes a reading without leaking quota values', async () => {
    stubConsole({
      'coding-plan-usage': usagePayload([
        { durationSeconds: 18000, used: '30', limit: '120', remaining: '90' },
        { durationSeconds: 604800, used: '60', limit: '120', remaining: '60' },
      ]),
      'billing/summary': { balanceUsd: '1.50' },
    })

    expect(serviceOf().describe(await serviceOf().read())).toBe('5 小时=25% 7 天=50%')
  })
})
