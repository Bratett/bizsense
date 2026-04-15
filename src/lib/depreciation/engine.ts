// ─── Depreciation Engine ─────────────────────────────────────────────────────
//
// Pure functions — no DB calls, no side effects.
// Only straight-line depreciation is implemented in Sprint 11.

export type DepreciationInput = {
  assetId: string
  purchaseDate: string // YYYY-MM-DD
  purchaseCost: number
  residualValue: number
  usefulLifeMonths: number
  accumulatedDepreciation: number
  depreciationMethod: string // currently always 'straight_line'
}

export type DepreciationResult = {
  assetId: string
  skip: boolean
  skipReason?: 'fully_depreciated' | 'not_yet_purchased'
  monthlyAmount: number // actual amount for this run (may be capped in last month)
  standardMonthlyAmount: number // uncapped periodic amount
  newAccumulatedDepreciation: number
  willBeFullyDepreciated: boolean
}

/**
 * Compute straight-line depreciation for a single asset in a single calendar month.
 *
 * Convention:
 * - If the asset was purchased during the target month, post a full month's
 *   depreciation regardless of which day of the month it was purchased.
 * - In the final period, cap the amount so accumulated never exceeds depreciable amount.
 */
export function computeMonthlyDepreciation(
  input: DepreciationInput,
  targetYear: number,
  targetMonth: number, // 1–12
): DepreciationResult {
  const depreciableAmount = input.purchaseCost - input.residualValue

  const standardMonthlyAmount =
    Math.round((depreciableAmount / input.usefulLifeMonths) * 100) / 100

  const base: Pick<DepreciationResult, 'assetId' | 'standardMonthlyAmount'> = {
    assetId: input.assetId,
    standardMonthlyAmount,
  }

  // ── Already fully depreciated ────────────────────────────────────────────
  if (input.accumulatedDepreciation >= depreciableAmount - 0.01) {
    return {
      ...base,
      skip: true,
      skipReason: 'fully_depreciated',
      monthlyAmount: 0,
      newAccumulatedDepreciation: input.accumulatedDepreciation,
      willBeFullyDepreciated: true,
    }
  }

  // ── Asset not yet purchased in target month ──────────────────────────────
  // Parse purchaseDate as UTC to avoid timezone shifts
  const purchaseParts = input.purchaseDate.split('-').map(Number)
  const purchaseYear = purchaseParts[0]
  const purchaseMonth = purchaseParts[1] // 1-based

  const purchasedAfterTarget =
    purchaseYear > targetYear ||
    (purchaseYear === targetYear && purchaseMonth > targetMonth)

  if (purchasedAfterTarget) {
    return {
      ...base,
      skip: true,
      skipReason: 'not_yet_purchased',
      monthlyAmount: 0,
      newAccumulatedDepreciation: input.accumulatedDepreciation,
      willBeFullyDepreciated: false,
    }
  }

  // ── Cap to remaining depreciable amount (last-month protection) ──────────
  const remaining = depreciableAmount - input.accumulatedDepreciation
  const monthlyAmount = Math.round(Math.min(standardMonthlyAmount, remaining) * 100) / 100
  const newAccumulatedDepreciation =
    Math.round((input.accumulatedDepreciation + monthlyAmount) * 100) / 100
  const willBeFullyDepreciated = newAccumulatedDepreciation >= depreciableAmount - 0.01

  return {
    ...base,
    skip: false,
    monthlyAmount,
    newAccumulatedDepreciation,
    willBeFullyDepreciated,
  }
}
