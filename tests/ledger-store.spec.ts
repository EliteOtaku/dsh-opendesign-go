import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { LedgerStore } from '../src/ledger-store.ts'

const dirs: string[] = []

/** Create a throwaway home directory and its ledger path. */
function freshStore(): { store: LedgerStore, path: string } {
  const dir = mkdtempSync(join(tmpdir(), 'opendesign-ledger-'))
  dirs.push(dir)
  const path = LedgerStore.pathIn(dir)
  // The plugin owns this directory; create it so a test can seed a file
  // without going through record().
  mkdirSync(dirname(path), { recursive: true })
  return { store: new LedgerStore(path), path }
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('LedgerStore', () => {
  it('starts empty when no file exists', () => {
    const { store } = freshStore()
    expect(store.all()).toEqual([])
  })

  it('persists entries across instances', () => {
    const { store, path } = freshStore()
    store.record({
      at: Date.now(), model: 'm', accountRef: 'r',
      inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.1,
    })
    const reopened = new LedgerStore(path)
    expect(reopened.all()).toHaveLength(1)
    expect(reopened.all()[0]?.model).toBe('m')
  })

  it('skips a torn line but keeps the rest of the history', () => {
    const { store, path } = freshStore()
    store.record({
      at: Date.now(), model: 'good', accountRef: 'r',
      inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0,
    })
    // Simulate an interrupted append.
    writeFileSync(path, `${readFileSync(path, 'utf8')}{"at":123,"mod`, 'utf8')
    const reopened = new LedgerStore(path)
    expect(reopened.all()).toHaveLength(1)
    expect(reopened.all()[0]?.model).toBe('good')
  })

  it('tolerates a hand-edited line with the wrong shape', () => {
    const { path } = freshStore()
    writeFileSync(path, '{"at":"not-a-number","model":"x"}\n', 'utf8')
    expect(new LedgerStore(path).all()).toEqual([])
  })

  it('normalizes an absent cache field to zero instead of undefined', () => {
    const { path } = freshStore()
    writeFileSync(path, JSON.stringify({
      at: Date.now(), model: 'm', inputTokens: 1, outputTokens: 2,
    }) + '\n', 'utf8')
    const entry = new LedgerStore(path).all()[0]
    expect(entry?.cacheReadTokens).toBe(0)
    expect(entry?.costUsd).toBeNull()
  })

  it('lives under a plugin-owned directory in the DSH home', () => {
    expect(LedgerStore.pathIn('/home/x/.dsh')).toMatch(/dsh-opendesign-go[\\/]usage\.jsonl$/)
  })
})
