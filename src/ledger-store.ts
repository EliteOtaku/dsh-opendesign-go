/**
 * Durable ledger storage.
 *
 * Entries are appended as JSON Lines: an interrupted write costs at most the
 * last line, and a corrupt line is skipped rather than discarding the history.
 * The file lives under the DSH home so it survives restarts with the profile.
 *
 * Nothing here is synchronized across processes. Two DSH profiles sharing one
 * home would interleave appends; each line stays intact, and totals remain a
 * correct sum of everything written.
 *
 * @module dsh-opendesign-go/ledger-store
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { LedgerEntry } from './usage-ledger.ts'

/** Entries beyond this age are dropped when the file is rewritten. */
const RETENTION_DAYS = 400

/** Rewrite the file once it grows past this size, to bound startup cost. */
const COMPACT_BYTES = 4 * 1024 * 1024

/**
 * Owns the ledger file for one plugin mount.
 */
export class LedgerStore {
  readonly #path: string
  /** Parsed entries, loaded once and kept current. */
  #entries: LedgerEntry[] | undefined

  /**
   * @param path - absolute path of the JSONL ledger.
   */
  constructor(path: string) {
    this.#path = path
  }

  /**
   * Resolve the ledger path inside a DSH home.
   * @param dshHome - resolved DSH home directory.
   * @returns the ledger path for this plugin.
   */
  static pathIn(dshHome: string): string {
    return join(dshHome, 'dsh-opendesign-go', 'usage.jsonl')
  }

  /**
   * Record one finished call and persist it.
   * @param entry - the call to append.
   */
  record(entry: LedgerEntry): void {
    this.#load()
    this.#entries!.push(entry)
    mkdirSync(dirname(this.#path), { recursive: true })
    appendFileSync(this.#path, `${JSON.stringify(entry)}\n`, 'utf8')
    if (this.#size() > COMPACT_BYTES) this.#compact()
  }

  /**
   * Every retained entry.
   * @returns the entries, oldest first.
   */
  all(): readonly LedgerEntry[] {
    this.#load()
    return this.#entries!
  }

  /** Read and parse the file once. */
  #load(): void {
    if (this.#entries !== undefined) return
    this.#entries = []
    if (!existsSync(this.#path)) return
    let raw = ''
    try {
      raw = readFileSync(this.#path, 'utf8')
    } catch {
      return
    }
    for (const line of raw.split('\n')) {
      if (line.length === 0) continue
      try {
        const parsed = JSON.parse(line) as Partial<LedgerEntry>
        if (typeof parsed.at === 'number' && typeof parsed.model === 'string'
          && typeof parsed.inputTokens === 'number' && typeof parsed.outputTokens === 'number') {
          this.#entries.push({
            at: parsed.at,
            model: parsed.model,
            accountRef: typeof parsed.accountRef === 'string' ? parsed.accountRef : '',
            inputTokens: parsed.inputTokens,
            outputTokens: parsed.outputTokens,
            cacheReadTokens: typeof parsed.cacheReadTokens === 'number' ? parsed.cacheReadTokens : 0,
            cacheWriteTokens: typeof parsed.cacheWriteTokens === 'number' ? parsed.cacheWriteTokens : 0,
            costUsd: typeof parsed.costUsd === 'number' ? parsed.costUsd : null,
          })
        }
      } catch {
        // A torn or hand-edited line is skipped; the rest of the history stands.
      }
    }
  }

  /**
   * Current file size in bytes.
   * @returns the size, or 0 when absent.
   */
  #size(): number {
    try {
      return statSync(this.#path).size
    } catch {
      return 0
    }
  }

  /** Drop entries past retention and rewrite the file atomically. */
  #compact(): void {
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
    const kept = this.#entries!.filter((entry) => entry.at >= cutoff)
    this.#entries = kept
    const temp = `${this.#path}.tmp`
    writeFileSync(temp, kept.map((entry) => `${JSON.stringify(entry)}\n`).join(''), 'utf8')
    renameSync(temp, this.#path)
  }
}
