import { describe, expect, it } from 'vitest'
import {
  Config,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  PlainConfig,
  accountsOfConfig,
  assertApiKeyEnv,
  assertBaseURL,
  migrateGatewayBaseURL,
  readConfig,
} from '../src/config.ts'
import type { LiveConfig } from '../src/config.ts'
import { DEFAULT_API_KEY_ENV, DEFAULT_BASE_URL } from '../src/config-contract.ts'
import type { OpenDesignConfig } from '../src/config-contract.ts'

/** The same shape with mutable fields, so a test can simulate a committed edit. */
type MutableConfig = { -readonly [K in keyof OpenDesignConfig]: OpenDesignConfig[K] }

/** Build live references over one mutable snapshot, as the Loader would. */
function liveConfigOf(values: OpenDesignConfig): LiveConfig {
  return {
    enabled: { get: () => values.enabled },
    apiKeyEnv: { get: () => values.apiKeyEnv },
    accounts: { get: () => values.accounts ?? [] },
    autoSwitch: { get: () => values.autoSwitch },
    sessionRef: { get: () => values.sessionRef },
    workspaceId: { get: () => values.workspaceId },
    usageJson: { get: () => values.usageJson },
    reportJson: { get: () => values.reportJson },
    useVelaCredential: { get: () => values.useVelaCredential },
    diagnosticsJson: { get: () => values.diagnosticsJson },
    baseURL: { get: () => values.baseURL },
    requestTimeoutMs: { get: () => values.requestTimeoutMs },
    streamIdleTimeoutMs: { get: () => values.streamIdleTimeoutMs },
  }
}

const DEFAULTS: OpenDesignConfig = {
  enabled: true,
  apiKeyEnv: DEFAULT_API_KEY_ENV,
  accounts: [],
  autoSwitch: false,
  sessionRef: '',
  workspaceId: '',
  usageJson: '',
  reportJson: '',
  useVelaCredential: false,
  diagnosticsJson: '',
  baseURL: DEFAULT_BASE_URL,
  requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
  streamIdleTimeoutMs: DEFAULT_STREAM_IDLE_TIMEOUT_MS,
}

describe('PlainConfig', () => {
  it('fills every declared default when called without input', () => {
    expect(PlainConfig()).toEqual(DEFAULTS)
  })

  it('pins the documented timeout defaults', () => {
    expect(DEFAULT_REQUEST_TIMEOUT_MS).toBe(1_800_000)
    expect(DEFAULT_STREAM_IDLE_TIMEOUT_MS).toBe(300_000)
  })

  it('keeps explicit values and the account shape', () => {
    const config = PlainConfig({
      enabled: false,
      apiKeyEnv: 'OTHER_KEY',
      accounts: [{ id: 'a1', name: 'Primary', apiKeyEnv: 'ACCOUNT_KEY' }],
      autoSwitch: true,
      baseURL: 'https://gateway.example.com/v1',
      requestTimeoutMs: 1000,
      streamIdleTimeoutMs: 2000,
    })
    expect(config.enabled).toBe(false)
    expect(config.accounts).toEqual([{ id: 'a1', name: 'Primary', apiKeyEnv: 'ACCOUNT_KEY' }])
    expect(config.baseURL).toBe('https://gateway.example.com/v1')
  })

  it('folds an absent, null, or empty account list to an empty array', () => {
    // The schema stays a plain walkable array so the settings service can
    // project an editable form; callers normalize through accountsOfConfig.
    expect(PlainConfig().accounts).toEqual([])
    expect(PlainConfig({ ...DEFAULTS, accounts: [] }).accounts).toEqual([])
    expect(accountsOfConfig(null)).toBeNull()
    expect(accountsOfConfig([])).toBeNull()
    expect(accountsOfConfig([{ id: 'a1', name: 'Primary', apiKeyEnv: 'ACCOUNT_KEY' }])).toHaveLength(1)
  })
})

describe('assertBaseURL', () => {
  it('accepts an http(s) URL and returns it unchanged', () => {
    expect(assertBaseURL(DEFAULT_BASE_URL)).toBe(DEFAULT_BASE_URL)
  })

  it('accepts http and strips one trailing slash', () => {
    expect(assertBaseURL('http://127.0.0.1:8080/v1/')).toBe('http://127.0.0.1:8080/v1')
  })

  it('strips repeated trailing slashes', () => {
    expect(assertBaseURL('https://gateway.example.com/v1//')).toBe('https://gateway.example.com/v1')
  })

  it('normalizes a host-only URL without a trailing slash', () => {
    expect(assertBaseURL('https://gateway.example.com/')).toBe('https://gateway.example.com')
  })

  it('rejects a query', () => {
    expect(() => assertBaseURL('https://gateway.example.com/v1?key=1')).toThrow(/baseURL/)
  })

  it('rejects a fragment', () => {
    expect(() => assertBaseURL('https://gateway.example.com/v1#top')).toThrow(/baseURL/)
  })

  it('rejects a non-http protocol', () => {
    expect(() => assertBaseURL('ftp://gateway.example.com/v1')).toThrow(/baseURL/)
  })

  it('rejects a relative or unparseable value', () => {
    expect(() => assertBaseURL('gateway.example.com/v1')).toThrow(/baseURL/)
  })

  it('rejects an empty value', () => {
    expect(() => assertBaseURL('   ')).toThrow(/baseURL/)
  })
})

describe('assertApiKeyEnv', () => {
  it('accepts environment-variable names', () => {
    expect(() => assertApiKeyEnv('OPENDESIGN_API_KEY')).not.toThrow()
    expect(() => assertApiKeyEnv('_INTERNAL')).not.toThrow()
    expect(() => assertApiKeyEnv('A1')).not.toThrow()
  })

  it('rejects a leading digit', () => {
    expect(() => assertApiKeyEnv('1KEY')).toThrow(/apiKeyEnv/)
  })

  it('rejects separators a shell would not accept', () => {
    expect(() => assertApiKeyEnv('OPEN-DESIGN')).toThrow(/apiKeyEnv/)
    expect(() => assertApiKeyEnv('OPEN DESIGN')).toThrow(/apiKeyEnv/)
    expect(() => assertApiKeyEnv('OPEN.DESIGN')).toThrow(/apiKeyEnv/)
  })

  it('rejects an empty name', () => {
    expect(() => assertApiKeyEnv('')).toThrow(/apiKeyEnv/)
  })
})

describe('migrateGatewayBaseURL', () => {
  it('passes the stored URL through unchanged today', () => {
    expect(migrateGatewayBaseURL('https://legacy.example.com/v1')).toBe('https://legacy.example.com/v1')
  })
})

describe('readConfig', () => {
  it('reads plain values out of the live references', () => {
    // readConfig normalizes an empty account list to null, the contract's
    // "only apiKeyEnv" meaning; the schema itself keeps a walkable array.
    expect(readConfig(liveConfigOf(DEFAULTS))).toEqual({ ...DEFAULTS, accounts: null })
  })

  it('re-reads the current value on every call', () => {
    const snapshot: MutableConfig = { ...DEFAULTS }
    const live = liveConfigOf(snapshot)
    expect(readConfig(live).enabled).toBe(true)

    snapshot.enabled = false
    expect(readConfig(live).enabled).toBe(false)
  })

  it('passes baseURL through the gateway migration', () => {
    const live = liveConfigOf({ ...DEFAULTS, baseURL: 'https://legacy.example.com/v1' })
    expect(readConfig(live).baseURL).toBe(migrateGatewayBaseURL('https://legacy.example.com/v1'))
  })

  it('resolves the defaults materialized by the Loader schema', () => {
    const live = Config()
    expect(typeof live.enabled.get).toBe('function')
    expect(live.accounts.get()).toEqual([])
    expect(readConfig(live)).toEqual({ ...DEFAULTS, accounts: null })
  })

  it('keeps an explicit value set through the Loader schema', () => {
    const live = Config({ enabled: false, apiKeyEnv: 'OTHER_KEY' })
    expect(live.enabled.get()).toBe(false)
    expect(readConfig(live).enabled).toBe(false)
    expect(readConfig(live).apiKeyEnv).toBe('OTHER_KEY')
  })
})
