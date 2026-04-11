import { getAccountBalances } from './engine'

// ─── Types ────────────────────────────────────────────────────────────────────

export type TrialBalanceLine = {
  accountId:         string
  accountCode:       string
  accountName:       string
  accountType:       string
  cumulativeDebits:  number   // SUM of all debits to asOfDate
  cumulativeCredits: number   // SUM of all credits to asOfDate
}

export type TrialBalanceReport = {
  asOfDate:        string
  lines:           TrialBalanceLine[]  // ALL accounts, including zero-balance
  totalDebits:     number
  totalCredits:    number
  isBalanced:      boolean
  imbalanceAmount: number   // 0.00 when balanced
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Compute the Trial Balance cumulative to asOfDate.
 * Includes every account regardless of activity — the engine's LEFT JOIN
 * guarantees zero-activity accounts appear with totalDebits = totalCredits = 0.
 * Lines are already sorted by accountCode ASC from the engine.
 *
 * @param businessId - from server-side session, never from client
 * @param asOfDate   - 'YYYY-MM-DD' inclusive upper bound
 */
export async function getTrialBalance(
  businessId: string,
  asOfDate: string,
): Promise<TrialBalanceReport> {
  const balances = await getAccountBalances(businessId, {
    type: 'asOf',
    date: asOfDate,
  })

  const lines: TrialBalanceLine[] = balances.map(ab => ({
    accountId:         ab.accountId,
    accountCode:       ab.accountCode,
    accountName:       ab.accountName,
    accountType:       ab.accountType,
    cumulativeDebits:  ab.totalDebits,
    cumulativeCredits: ab.totalCredits,
  }))

  // Accumulate totals — apply rounding after summing to absorb float drift
  const totalDebits  = Math.round(lines.reduce((s, l) => s + l.cumulativeDebits,  0) * 100) / 100
  const totalCredits = Math.round(lines.reduce((s, l) => s + l.cumulativeCredits, 0) * 100) / 100
  const imbalance    = Math.abs(totalDebits - totalCredits)

  return {
    asOfDate,
    lines,
    totalDebits,
    totalCredits,
    isBalanced:      imbalance < 0.01,
    imbalanceAmount: Math.round(imbalance * 100) / 100,
  }
}
