/**
 * Tests for the reconciliation arithmetic only.
 *
 * Vitest runs without a DOM here, so the component is left to type checking and
 * manual rendering: `spentFromCredits` carries the one calculation whose failure
 * would silently misprice a plan, which makes it worth asserting directly.
 */
import { describe, expect, it } from 'vitest'
import { spentFromCredits } from '../src/client/BillingCard.tsx'

describe('spentFromCredits', () => {
  it('converts a credits string at the reported rate', () => {
    // 21322 credits at 10000/USD: the live 7-day reading on 2026-10-19.
    expect(spentFromCredits('21322', 10_000)).toBeCloseTo(2.1322, 4)
  })

  it('handles a decimal credits string without rounding it away', () => {
    expect(spentFromCredits('1234.56', 10_000)).toBeCloseTo(0.123456, 6)
  })

  it('returns undefined when the rate was not reported', () => {
    // A missing rate means "cannot be priced"; 0 would be a claim that the
    // window spent nothing.
    expect(spentFromCredits('21322', undefined)).toBeUndefined()
  })

  it('returns undefined for a non-positive rate', () => {
    // Division by zero would yield Infinity and render as "$Infinity".
    expect(spentFromCredits('21322', 0)).toBeUndefined()
  })

  it('returns undefined for a credits string that is not a number', () => {
    expect(spentFromCredits('abc', 10_000)).toBeUndefined()
  })

  it('keeps a genuine zero spend as zero', () => {
    // "0" is a real reading — an untouched window — so it must not degrade to
    // undefined alongside the unparseable cases.
    expect(spentFromCredits('0', 10_000)).toBe(0)
  })
})
