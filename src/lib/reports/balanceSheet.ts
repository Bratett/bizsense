import { getAccountBalances } from './engine'
import type { AccountBalance, PeriodParams } from './engine'
import { getProfitAndLoss } from './pl'

// ─── Types ────────────────────────────────────────────────────────────────────

export type BalanceSheet = {
  asOfDate: string
  assets: {
    currentAssets: AccountBalance[] // type='asset', subtype='current_asset', code≠'1510'
    fixedAssets: {
      cost: number // account 1500 netBalance
      accumulatedDepreciation: number // Math.abs(account 1510 netBalance)
      netBookValue: number // cost - accumulatedDepreciation
    }
    totalAssets: number
  }
  liabilities: {
    currentLiabilities: AccountBalance[] // type='liability', subtype='current_liability'
    longTermLiabilities: AccountBalance[] // type='liability', subtype='long_term_liability'
    totalLiabilities: number
  }
  equity: {
    lines: AccountBalance[] // type='equity'
    currentPeriodProfit: number // getProfitAndLoss YTD netProfit
    totalEquity: number
  }
  totalLiabilitiesAndEquity: number
  isBalanced: boolean // |totalAssets - totalLiabilitiesAndEquity| < 0.01
  imbalanceAmount: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Given an as-of date and a financial year start month (1–12),
 * returns the YYYY-MM-01 string of the start of the current financial year.
 *
 * Uses UTC midnight to avoid DST artifacts (same pattern as pl.ts derivePriorPeriod).
 */
export function getFinancialYearStart(asOfDate: string, startMonth: number): string {
  const asOf = new Date(asOfDate + 'T00:00:00Z')
  let year = asOf.getUTCFullYear()
  // If the asOf month is before the start month, the financial year began last calendar year
  if (asOf.getUTCMonth() + 1 < startMonth) year -= 1
  return `${year}-${String(startMonth).padStart(2, '0')}-01`
}

/** Round-to-2dp sum. Never accumulate raw floats across multiple additions. */
function sum(nums: number[]): number {
  return Math.round(nums.reduce((s, n) => s + n, 0) * 100) / 100
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Compute a Balance Sheet as at the given date.
 *
 * All figures are cumulative from the dawn of time to asOfDate.
 * The "current period profit" in the equity section is derived from the
 * P&L for the financial year to date — making the Balance Sheet self-consistent
 * with the P&L without storing a computed profit figure anywhere.
 *
 * @param businessId               - from server-side session, never from client
 * @param asOfDate                 - YYYY-MM-DD
 * @param financialYearStartMonth  - 1–12, parsed from businesses.financialYearStart
 */
export async function getBalanceSheet(
  businessId: string,
  asOfDate: string,
  financialYearStartMonth: number,
): Promise<BalanceSheet> {
  const period: PeriodParams = { type: 'asOf', date: asOfDate }
  const balances = await getAccountBalances(businessId, period)

  // O(1) lookup by account code
  const byCode = (code: string) => balances.find((b) => b.accountCode === code)?.netBalance ?? 0

  // ── Assets ─────────────────────────────────────────────────────────────────
  const currentAssets = balances.filter(
    (b) =>
      b.accountType === 'asset' && b.accountSubtype === 'current_asset' && b.accountCode !== '1510',
  )

  // Account 1510 (Accumulated Depreciation) is stored as type='asset' (debit-normal).
  // Normal depreciation credits 1510, making netBalance = debits - credits = negative.
  // Math.abs gives the positive accumulated depreciation figure.
  const cost = byCode('1500')
  const accDep = Math.abs(byCode('1510'))
  const netBV = Math.round((cost - accDep) * 100) / 100

  const totalCurrentAssets = sum(currentAssets.map((a) => a.netBalance))
  const totalAssets = Math.round((totalCurrentAssets + netBV) * 100) / 100

  // ── Liabilities ────────────────────────────────────────────────────────────
  const currentLiabilities = balances.filter(
    (b) => b.accountType === 'liability' && b.accountSubtype === 'current_liability',
  )
  const longTermLiabilities = balances.filter(
    (b) => b.accountType === 'liability' && b.accountSubtype === 'long_term_liability',
  )

  const totalCurrentL = sum(currentLiabilities.map((a) => a.netBalance))
  const totalLongTermL = sum(longTermLiabilities.map((a) => a.netBalance))
  const totalLiabilities = Math.round((totalCurrentL + totalLongTermL) * 100) / 100

  // ── Equity ─────────────────────────────────────────────────────────────────
  const equityLines = balances.filter((b) => b.accountType === 'equity')

  // Current period profit = P&L for financial year to date.
  // This keeps the Balance Sheet self-consistent with the Income Statement.
  const ytdFrom = getFinancialYearStart(asOfDate, financialYearStartMonth)
  const { netProfit: currentPeriodProfit } = await getProfitAndLoss(businessId, {
    from: ytdFrom,
    to: asOfDate,
  })

  const totalEquityLines = sum(equityLines.map((a) => a.netBalance))
  const totalEquity = Math.round((totalEquityLines + currentPeriodProfit) * 100) / 100

  // ── Balance check ──────────────────────────────────────────────────────────
  const totalLiabilitiesAndEquity = Math.round((totalLiabilities + totalEquity) * 100) / 100
  const imbalance = Math.abs(totalAssets - totalLiabilitiesAndEquity)

  return {
    asOfDate,
    assets: {
      currentAssets,
      fixedAssets: {
        cost,
        accumulatedDepreciation: accDep,
        netBookValue: netBV,
      },
      totalAssets,
    },
    liabilities: {
      currentLiabilities,
      longTermLiabilities,
      totalLiabilities,
    },
    equity: {
      lines: equityLines,
      currentPeriodProfit,
      totalEquity,
    },
    totalLiabilitiesAndEquity,
    isBalanced: imbalance < 0.01,
    imbalanceAmount: Math.round(imbalance * 100) / 100,
  }
}
