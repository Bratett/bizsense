import { getAccountBalances } from './engine'
import type { AccountBalance } from './engine'

// ─── Types ────────────────────────────────────────────────────────────────────

export type PLLine = {
  accountId: string
  accountCode: string
  accountName: string
  netBalance: number
  priorNetBalance?: number
}

export type PLSection = {
  lines: PLLine[]
  total: number
  priorTotal?: number
}

export type ProfitAndLoss = {
  period: { from: string; to: string }
  revenue: PLSection
  cogs: PLSection
  grossProfit: number
  priorGrossProfit?: number
  grossMarginPct: number
  expenses: PLSection
  netProfit: number
  priorNetProfit?: number
  hasPrior: boolean
}

// ─── Helper: shift period back by the same number of days ─────────────────────

function derivePriorPeriod(period: { from: string; to: string }): { from: string; to: string } {
  // Use UTC midnight to avoid DST artifacts when parsing ISO date strings
  const fromMs = new Date(period.from + 'T00:00:00Z').getTime()
  const toMs = new Date(period.to + 'T00:00:00Z').getTime()
  const span = Math.round((toMs - fromMs) / 86_400_000) + 1 // inclusive day count

  const priorToMs = fromMs - 86_400_000
  const priorFromMs = priorToMs - (span - 1) * 86_400_000

  return {
    from: new Date(priorFromMs).toISOString().slice(0, 10),
    to: new Date(priorToMs).toISOString().slice(0, 10),
  }
}

// ─── Helper: map AccountBalance rows to PLLine ────────────────────────────────

function toLine(ab: AccountBalance): PLLine {
  return {
    accountId: ab.accountId,
    accountCode: ab.accountCode,
    accountName: ab.accountName,
    netBalance: ab.netBalance,
  }
}

function sumLines(lines: PLLine[]): number {
  return Math.round(lines.reduce((s, l) => s + l.netBalance, 0) * 100) / 100
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Compute a Profit & Loss statement for the given date range.
 * All figures derive from the ledger via getAccountBalances().
 *
 * @param businessId  - from server-side session, never from client
 * @param period      - inclusive date range { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
 * @param includePrior - when true, fetches a prior period of equal length for comparison
 */
export async function getProfitAndLoss(
  businessId: string,
  period: { from: string; to: string },
  includePrior = false,
): Promise<ProfitAndLoss> {
  const balances = await getAccountBalances(businessId, {
    type: 'range',
    from: period.from,
    to: period.to,
  })

  // ── Section filters ────────────────────────────────────────────────────────
  const revenueBalances = balances.filter((a) => a.accountType === 'revenue')
  const cogsBalances = balances.filter((a) => a.accountType === 'cogs')
  const expenseBalances = balances.filter((a) => a.accountType === 'expense' && a.netBalance !== 0)

  const revenueLines = revenueBalances.map(toLine)
  const cogsLines = cogsBalances.map(toLine)
  const expenseLines = expenseBalances.map(toLine)

  const revenueTotal = sumLines(revenueLines)
  const cogsTotal = sumLines(cogsLines)
  const expenseTotal = sumLines(expenseLines)
  const grossProfit = Math.round((revenueTotal - cogsTotal) * 100) / 100
  const netProfit = Math.round((grossProfit - expenseTotal) * 100) / 100
  const grossMarginPct =
    revenueTotal === 0 ? 0 : Math.round((grossProfit / revenueTotal) * 10_000) / 100 // e.g. 42.5

  const result: ProfitAndLoss = {
    period,
    revenue: { lines: revenueLines, total: revenueTotal },
    cogs: { lines: cogsLines, total: cogsTotal },
    grossProfit,
    grossMarginPct,
    expenses: { lines: expenseLines, total: expenseTotal },
    netProfit,
    hasPrior: false,
  }

  // ── Prior period comparison ────────────────────────────────────────────────
  if (includePrior) {
    const priorPeriod = derivePriorPeriod(period)
    const prior = await getProfitAndLoss(businessId, priorPeriod, false)

    // Index prior lines by accountId for O(1) lookup
    const priorRevMap = new Map(prior.revenue.lines.map((l) => [l.accountId, l.netBalance]))
    const priorCogMap = new Map(prior.cogs.lines.map((l) => [l.accountId, l.netBalance]))
    const priorExpMap = new Map(prior.expenses.lines.map((l) => [l.accountId, l.netBalance]))

    result.revenue.lines = revenueLines.map((l) => ({
      ...l,
      priorNetBalance: priorRevMap.get(l.accountId) ?? 0,
    }))
    result.cogs.lines = cogsLines.map((l) => ({
      ...l,
      priorNetBalance: priorCogMap.get(l.accountId) ?? 0,
    }))
    result.expenses.lines = expenseLines.map((l) => ({
      ...l,
      priorNetBalance: priorExpMap.get(l.accountId) ?? 0,
    }))

    result.revenue.priorTotal = prior.revenue.total
    result.cogs.priorTotal = prior.cogs.total
    result.expenses.priorTotal = prior.expenses.total
    result.priorGrossProfit = prior.grossProfit
    result.priorNetProfit = prior.netProfit
    result.hasPrior = true
  }

  return result
}
