import { describe, it, expect } from 'vitest'
import { computeMonthlyDepreciation } from '../engine'

// ─── Shared fixture builder ───────────────────────────────────────────────────

function makeInput(overrides: Partial<Parameters<typeof computeMonthlyDepreciation>[0]> = {}) {
  return {
    assetId: 'asset-001',
    purchaseDate: '2024-01-01',
    purchaseCost: 12000,
    residualValue: 0,
    usefulLifeMonths: 60,
    accumulatedDepreciation: 0,
    depreciationMethod: 'straight_line',
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('computeMonthlyDepreciation', () => {
  // Test 1 — Standard case
  it('computes monthly depreciation correctly for a standard asset', () => {
    const result = computeMonthlyDepreciation(makeInput(), 2025, 6)

    expect(result.skip).toBe(false)
    expect(result.monthlyAmount).toBe(200)             // 12000 / 60
    expect(result.standardMonthlyAmount).toBe(200)
    expect(result.newAccumulatedDepreciation).toBe(200)
    expect(result.willBeFullyDepreciated).toBe(false)
    expect(result.skipReason).toBeUndefined()
  })

  // Test 2 — Last-month cap prevents over-depreciation
  it('caps the final month amount so accumulated does not exceed depreciable amount', () => {
    const result = computeMonthlyDepreciation(
      makeInput({ accumulatedDepreciation: 11900 }),
      2025,
      6,
    )

    expect(result.skip).toBe(false)
    // Standard would be 200, but only 100 remains before hitting cost (12000 - 0)
    expect(result.monthlyAmount).toBe(100)
    expect(result.newAccumulatedDepreciation).toBe(12000)
    expect(result.willBeFullyDepreciated).toBe(true)
  })

  // Test 3 — Fully depreciated asset is skipped
  it('skips an asset that is already fully depreciated', () => {
    const result = computeMonthlyDepreciation(
      makeInput({ accumulatedDepreciation: 12000 }),
      2025,
      6,
    )

    expect(result.skip).toBe(true)
    expect(result.skipReason).toBe('fully_depreciated')
    expect(result.monthlyAmount).toBe(0)
    expect(result.newAccumulatedDepreciation).toBe(12000)
  })

  // Test 4 — Asset purchased after target month is skipped
  it('skips an asset purchased after the target month', () => {
    // Asset purchased in March 2026, target is February 2026
    const result = computeMonthlyDepreciation(
      makeInput({ purchaseDate: '2026-03-01' }),
      2026,
      2,
    )

    expect(result.skip).toBe(true)
    expect(result.skipReason).toBe('not_yet_purchased')
    expect(result.monthlyAmount).toBe(0)
  })

  // Test 5 — Asset purchased during target month is NOT skipped
  it('does not skip an asset purchased during the target month', () => {
    // Asset purchased Feb 15, target is Feb 2026 — post full month
    const result = computeMonthlyDepreciation(
      makeInput({ purchaseDate: '2026-02-15', accumulatedDepreciation: 0 }),
      2026,
      2,
    )

    expect(result.skip).toBe(false)
    expect(result.monthlyAmount).toBe(200) // full month per spec
  })

  // Test 6 — Non-zero residual value
  it('computes depreciation correctly with a non-zero residual value', () => {
    const result = computeMonthlyDepreciation(
      makeInput({
        purchaseCost: 10000,
        residualValue: 1000,
        usefulLifeMonths: 36,
        accumulatedDepreciation: 0,
      }),
      2025,
      6,
    )

    expect(result.skip).toBe(false)
    // Depreciable = 10000 - 1000 = 9000; monthly = 9000 / 36 = 250
    expect(result.monthlyAmount).toBe(250)
    expect(result.standardMonthlyAmount).toBe(250)
    expect(result.newAccumulatedDepreciation).toBe(250)
  })
})
