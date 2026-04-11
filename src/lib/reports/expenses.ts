import { and, eq, gte, lte, sql } from 'drizzle-orm'
import { db } from '@/db'
import { expenses, orders } from '@/db/schema'
import { getAccountBalances } from './engine'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExpenseReportLine = {
  accountId: string
  accountCode: string
  category: string // = accountName
  transactionCount: number
  totalAmount: number // netBalance from getAccountBalances
  priorAmount?: number
  changePercent?: number | null // null when priorAmount === 0
}

export type ExpenseReport = {
  period: { from: string; to: string }
  lines: ExpenseReportLine[]
  grandTotal: number
  priorTotal?: number
  hasPrior: boolean
}

// ─── Helper: derive prior period of equal length ──────────────────────────────

function derivePriorPeriod(period: { from: string; to: string }): { from: string; to: string } {
  const fromMs = new Date(period.from + 'T00:00:00Z').getTime()
  const toMs = new Date(period.to + 'T00:00:00Z').getTime()
  const span = Math.round((toMs - fromMs) / 86_400_000) + 1

  const priorToMs = fromMs - 86_400_000
  const priorFromMs = priorToMs - (span - 1) * 86_400_000

  return {
    from: new Date(priorFromMs).toISOString().slice(0, 10),
    to: new Date(priorToMs).toISOString().slice(0, 10),
  }
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Produce an expense breakdown by account category for the given period.
 * Amounts derive from getAccountBalances(); transaction counts come from
 * the expenses table (for expense accounts) and orders table (for COGS accounts).
 *
 * @param businessId  - from server-side session, never from client
 * @param period      - inclusive date range
 * @param includePrior - when true, fetches a prior period for % change comparison
 */
export async function getExpenseReport(
  businessId: string,
  period: { from: string; to: string },
  includePrior = false,
): Promise<ExpenseReport> {
  // ── Step 1: account balances for expense + COGS accounts ───────────────────
  const balances = await getAccountBalances(businessId, {
    type: 'range',
    from: period.from,
    to: period.to,
  })

  const expenseBalances = balances.filter(
    (b) => b.accountType === 'expense' || b.accountType === 'cogs',
  )

  // ── Step 2: transaction counts in parallel ─────────────────────────────────
  const [expenseCounts, ordersCount] = await Promise.all([
    db
      .select({
        accountId: expenses.accountId,
        count: sql<string>`COUNT(*)`,
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.businessId, businessId),
          eq(expenses.approvalStatus, 'approved'),
          gte(expenses.expenseDate, period.from),
          lte(expenses.expenseDate, period.to),
        ),
      )
      .groupBy(expenses.accountId),

    db
      .select({ count: sql<string>`COUNT(*)` })
      .from(orders)
      .where(
        and(
          eq(orders.businessId, businessId),
          eq(orders.status, 'fulfilled'),
          gte(orders.orderDate, period.from),
          lte(orders.orderDate, period.to),
        ),
      ),
  ])

  const countMap = new Map(expenseCounts.map((r) => [r.accountId, Number(r.count)]))
  const cogsOrderCount = Number(ordersCount[0]?.count ?? '0')

  // ── Step 3: build lines, filter zero-balance ───────────────────────────────
  const lines: ExpenseReportLine[] = expenseBalances
    .filter((b) => b.netBalance !== 0)
    .map((b) => ({
      accountId: b.accountId,
      accountCode: b.accountCode,
      category: b.accountName,
      transactionCount:
        b.accountType === 'cogs' ? cogsOrderCount : (countMap.get(b.accountId) ?? 0),
      totalAmount: b.netBalance,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount)

  const grandTotal = Math.round(lines.reduce((s, l) => s + l.totalAmount, 0) * 100) / 100

  const result: ExpenseReport = {
    period,
    lines,
    grandTotal,
    hasPrior: false,
  }

  // ── Step 4: prior period comparison ────────────────────────────────────────
  if (includePrior) {
    const priorPeriod = derivePriorPeriod(period)
    const prior = await getExpenseReport(businessId, priorPeriod, false)

    const priorMap = new Map(prior.lines.map((l) => [l.accountId, l.totalAmount]))

    result.lines = lines.map((l) => {
      const priorAmount = priorMap.get(l.accountId) ?? 0
      const changePercent =
        priorAmount === 0
          ? null
          : Math.round(((l.totalAmount - priorAmount) / priorAmount) * 10_000) / 100
      return { ...l, priorAmount, changePercent }
    })

    result.priorTotal = prior.grandTotal
    result.hasPrior = true
  }

  return result
}
