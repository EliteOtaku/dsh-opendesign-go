/**
 * Host half of the settings surface.
 *
 * On a modern host (0.2.x) the profile editor edits the composition entry's
 * config directly, so the plugin only has to opt that entry into editing; the
 * client page reads and writes the same entry through `configForms`. The
 * schema still validates every write, so a bad value is refused where it is
 * typed instead of at the next request.
 *
 * @module dsh-opendesign-go/host-settings
 */
import type { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the settings plugin's Context merge (ctx.settings).
import type {} from '@deepseek-ai/dsh-settings'
import { PROFILE_ENTRY_ID } from './config-contract.ts'

/** The subset of the modern settings service this plugin relies on. */
interface ProfileSettings {
  /** Opt this entry's config into profile editing without an automatic schema. */
  configure(presentation: { auto: boolean }, owner: unknown): () => void
  /** Current profile accepts edits. */
  readonly writable?: boolean
  /** Read one entry's form, including its live values and write fence. */
  describe?(options?: unknown): {
    ns: string
    revision: number
    /** Live field values; present on every host row this plugin targets. */
    value?: Readonly<Record<string, unknown>>
  }[]
  /** Merge fields into one entry's config. */
  update?(ns: string, patch: object, expectedRevision?: number): Promise<void>
}

/**
 * How long to wait for the settings service and this entry's row to appear.
 *
 * This is the pre-write phase: no update has been attempted yet, so each pass
 * is free of the profile-level file lock the host takes per write.
 */
const WAIT_ATTEMPTS = 12

/**
 * How many times one value may actually be written.
 *
 * Every `settings.update` makes the host lock the profile directory and rewrite
 * the whole composition document, which recomposes the plugin tree. A retry is
 * therefore far more expensive than a missed cache write: give up after two
 * attempts and leave the page showing the previous value.
 */
const WRITE_ATTEMPTS = 2

/** Backoff before the next pass; linear and capped so a late mount costs seconds. */
const backoff = (attempt: number): Promise<void> =>
  new Promise((resolve) => { setTimeout(resolve, Math.min(100 * (attempt + 1), 250)) })

/** Read the host's stable machine code from a failed settings call. */
function errorCodeOf(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}

/**
 * The last value this process wrote for each field, per host context.
 *
 * `describe()` reflects the live fiber config, which the host only republishes
 * once it has recomposed the tree, so a write can still look absent on the very
 * next poll. Remembering the write keeps one changed snapshot from being written
 * twice while the document catches up. Nothing else edits these cache fields —
 * they are read-only mirrors on the page — so a stale entry cannot mask a change
 * the user made.
 */
const lastWritten = new WeakMap<object, Map<string, string>>()

/** The per-context record of what was written, created on first use. */
function writtenFor(ctx: object): Map<string, string> {
  const existing = lastWritten.get(ctx)
  if (existing !== undefined) return existing
  const created = new Map<string, string>()
  lastWritten.set(ctx, created)
  return created
}

/**
 * Attach this plugin's entry to the host settings service.
 *
 * Older hosts expose only a namespace-scoped section installer; this plugin
 * targets the modern profile-entry surface and leaves the legacy path to a
 * later milestone rather than guessing at a contract the target does not ship.
 * @param ctx - host context that may carry a settings service.
 */
export function installHostSettings(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    const settings = (settingsCtx as { settings?: Partial<ProfileSettings> }).settings
    if (settings === undefined || typeof settings.configure !== 'function') {
      ctx.logger.warn(
        `llm-opendesign-go: no profile settings service; the page will stay read-only (entry "${PROFILE_ENTRY_ID}")`,
      )
      return
    }
    settingsCtx.effect(() => {
      const dispose = settings.configure!({ auto: false }, ctx.fiber)
      // Report exactly what the host sees: whether this entry reached a form at
      // all, and which namespaces did. A page receiving no mirror is otherwise
      // indistinguishable from a plugin that failed to activate.
      const writable = (settings as { writable?: boolean }).writable
      const rows = typeof settings.describe === 'function'
        ? (settings.describe.call(settings) as { ns: string, autoGenerate?: boolean }[])
        : []
      const own = rows.find((row) => row.ns === PROFILE_ENTRY_ID)
      ctx.logger.info(
        `llm-opendesign-go: settings attached (writable=${String(writable)}, forms=${rows.length}, `
        + `own=${own === undefined ? 'ABSENT' : `present(auto=${String(own.autoGenerate)})`}, `
        + `ns=[${rows.map((row) => row.ns).join(', ')}])`,
      )
      return dispose
    })
  })
}

/**
 * Expose a writer for one cached field.
 *
 * The page reads these fields from the config mirror, so the host publishes a
 * value by writing it. Keeping the write here means the plugin never keeps a
 * second copy of the state: one document, one source of truth.
 *
 * Every call is cheap when it has nothing to say. A write costs a profile-level
 * file lock and a full plugin-tree recomposition, so the writer checks what the
 * entry already carries — and what this process last wrote — before touching the
 * document. A poll that answers the same way as last time therefore costs one
 * `describe()` and no I/O.
 * @param ctx - host context that may carry a settings service.
 * @returns a writer for a named field, or undefined when this host cannot write.
 */
export function fieldWriterOf(ctx: Context): ((field: string, json: string) => Promise<void>) | undefined {
  /** Resolve the settings service at write time, not at capture time. */
  const settingsOf = (): ProfileSettings | undefined => {
    const settings = ctx.get('settings') as ProfileSettings | undefined
    if (settings === undefined || typeof settings.update !== 'function'
      || typeof settings.describe !== 'function' || settings.writable !== true) return undefined
    return settings
  }
  // A host without the service at capture time may still mount it later, so the
  // writer is always returned and reports failure per call instead of being
  // absent — an absent writer would be indistinguishable from "nothing to say".
  // This line describes the state at activation only; each later failure is
  // reported with its own reason when it happens.
  if (ctx.get('settings') === undefined) {
    ctx.logger.info('llm-opendesign-go: settings service not mounted at activation; each write will report its own outcome')
  }
  return async (field: string, json: string) => {
    const written = writtenFor(ctx)
    // Published cache fields are polls of the outside world, and most polls
    // answer with the value already stored. Every write makes the host lock the
    // profile directory and rewrite the whole composition document — which
    // recomposes this very plugin tree — so an unchanged value must never reach
    // `update`. The last write is checked first because `describe()` lags the
    // document by one recomposition.
    if (written.get(field) === json) return

    // The entry reaches the projection on the settings service's own schedule,
    // not at `apply` time, so an early write finds no service or no row yet.
    // Waiting costs a timer; writing costs a file lock and a tree rebuild, so
    // this phase retries and the write phase barely does.
    let ready = false
    for (let attempt = 0; attempt < WAIT_ATTEMPTS; attempt += 1) {
      const settings = settingsOf()
      if (settings === undefined) {
        await backoff(attempt)
        continue
      }
      if (settings.describe!().find((candidate) => candidate.ns === PROFILE_ENTRY_ID) === undefined) {
        await backoff(attempt)
        continue
      }
      ready = true
      break
    }
    if (!ready) {
      ctx.logger.warn(
        `llm-opendesign-go: no settings row for "${PROFILE_ENTRY_ID}"; ${field} was not cached`,
      )
      return
    }

    for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt += 1) {
      const settings = settingsOf()
      if (settings === undefined) {
        ctx.logger.warn(`llm-opendesign-go: settings service went away; ${field} was not cached`)
        return
      }
      // Re-read on every attempt: the row carries the live value and the
      // revision the write must fence against, and both can move while a
      // previous attempt was in flight. Nothing is remembered between attempts.
      const current = settings.describe!().find((candidate) => candidate.ns === PROFILE_ENTRY_ID)
      if (current === undefined) {
        ctx.logger.warn(`llm-opendesign-go: settings row for "${PROFILE_ENTRY_ID}" vanished; ${field} was not cached`)
        return
      }
      if (current.value?.[field] === json || written.get(field) === json) return
      try {
        // Fence on the revision just read: a concurrent edit from the page must
        // win rather than be silently overwritten by a background refresh.
        await settings.update!(PROFILE_ENTRY_ID, { [field]: json }, current.revision)
        written.set(field, json)
        return
      } catch (error) {
        const code = errorCodeOf(error)
        if (code === 'SETTINGS_CONFLICT') {
          // The page edited this entry after the value was read. Retrying once
          // picks up the new revision; retrying harder would fight the user.
          continue
        }
        ctx.logger.warn(`llm-opendesign-go: could not cache ${field} (${String(error)})`)
        return
      }
    }
    ctx.logger.warn(`llm-opendesign-go: gave up caching ${field} after a revision conflict`)
  }
}

/**
 * Expose the host's current settings projection so the page can report why it
 * sees no form. Kept separate from {@link installHostSettings} so a host
 * without the modern service still answers with an empty list rather than
 * throwing during activation.
 * @param ctx - host context that may carry a settings service.
 * @returns a reader returning every namespace the host currently exposes.
 */
export function describeNamespacesOf(ctx: Context): () => string[] {
  return () => {
    const settings = ctx.get('settings') as
      | { describe?: (options?: unknown) => { ns: string }[] }
      | undefined
    if (settings === undefined || typeof settings.describe !== 'function') return []
    try {
      return settings.describe().map((row) => row.ns)
    } catch {
      return []
    }
  }
}
