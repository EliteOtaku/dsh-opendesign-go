import { describe, expect, it } from 'vitest'
import { relativeTime } from '../src/client/usage-format.ts'

const NOW = Date.parse('2026-11-08T12:00:00.000Z')
/** An ISO timestamp `minutes` before NOW. */
const ago = (minutes: number): string => new Date(NOW - minutes * 60_000).toISOString()

describe('relativeTime', () => {
  it('names a fresh check as just now', () => {
    expect(relativeTime(ago(0), NOW)).toBe('刚刚')
    expect(relativeTime(ago(0.5), NOW)).toBe('刚刚')
  })

  it('counts minutes, then hours, then days', () => {
    expect(relativeTime(ago(3), NOW)).toBe('3 分钟前')
    expect(relativeTime(ago(59), NOW)).toBe('59 分钟前')
    expect(relativeTime(ago(60), NOW)).toBe('1 小时前')
    expect(relativeTime(ago(60 * 23), NOW)).toBe('23 小时前')
    expect(relativeTime(ago(60 * 26), NOW)).toBe('1 天前')
  })

  it('returns undefined for a value that is not a timestamp', () => {
    expect(relativeTime(undefined, NOW)).toBeUndefined()
    expect(relativeTime('', NOW)).toBeUndefined()
    expect(relativeTime('not-a-date', NOW)).toBeUndefined()
  })
})
