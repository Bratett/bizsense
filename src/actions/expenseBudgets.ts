'use server'

import { and, eq, between, sql } from 'drizzle-orm'
import { db } from '@/db'
import { expenseBudgets, expenses, accounts } from '@/db/schema'
import { requireRole } from '@/lib/auth/requireRole'
import { getServerSession } from '@/lib/session'

// ─── Types ───────────────────────────────────────────────────────────────────

export type UpsertBudgetInput = {
  accountId: string
  category: string
  monthlyBudget: number
  alertThreshold?: number // fraction, e.g. 0.80 for 80%
}

export type BudgetStatus = {
  id: string
  accountId: string
  accountName: string | null
  category: string
  monthlyBudget: number
  spentThisMonth: number
  remainingBudget: number
  percentUsed: number
  isOverBudget: boolean
  isNearLimit: boolean // spent >= alertThreshold × budget AND not over budget
  alertThreshold: number
}

// ─── Actions ─────────────────────────────────────────────────────────────────

/**
 * Create or update a monthly budget for a given account/category.
 * Upserts by (businessId, accountId) — one budget per account.
 */
export async function upsertExpenseBudget(input: UpsertBudgetInput): Promise<void> {
  const user = await requireRole(['owner', 'manager'])
  const { businessId } = user

  const existing = await db
    .select({ id: expenseBudgets.id })
    .from(expenseBudgets)
    .where(and(eq(expenseBudgets.businessId, businessId), eq(expenseBudgets.accountId, input.accountId)))
    .limit(1)

  const threshold = (input.alertThreshold ?? 0.8).toFixed(2)

  if (existing.length > 0) {
    await db
      .update(expenseBudgets)
      .set({
        category: input.category,
        monthlyBudget: input.monthlyBudget.toFixed(2),
        alertThreshold: threshold,
        updatedAt: new Date(),
      })
      .where(and(eq(expenseBudgets.businessId, businessId), eq(expenseBudgets.accountId, input.accountId)))
  } else {
    await db.insert(expenseBudgets).values({
      businessId,
      accountId: input.accountId,
      category: input.category,
      monthlyBudget: input.monthlyBudget.toFixed(2),
      alertThreshold: threshold,
      isActive: true,
    })
  }
}

/**
 * List all active budgets for the authenticated business.
 */
export async function listExpenseBudgets() {
  const session = await getServerSession()
  const { businessId } = session.user

  return db
    .select({
      id: expenseBudgets.id,
      accountId: expenseBudgets.accountId,
      accountName: accounts.name,
      category: expenseBudgets.category,
      monthlyBudget: expenseBudgets.monthlyBudget,
      alertThreshold: expenseBudgets.alertThreshold,
    })
    .from(expenseBudgets)
    .leftJoin(accounts, eq(expenseBudgets.accountId, accounts.id))
    .where(and(eq(expenseBudgets.businessId, businessId), eq(expenseBudgets.isActive, true)))
    .orderBy(expenseBudgets.category)
}

/**
 * For each active budget, compute spent vs limit for the given month.
 * @param month - format 'YYYY-MM'
 */
export async function getExpenseBudgetStatus(month: string): Promise<BudgetStatus[]> {
  const session = await getServerSession()
  const { businessId } = session.user

  const budgetRows = await listExpenseBudgets()
  if (budgetRows.length === 0) return []

  const [year, mon] = month.split('-').map(Number)
  const monthStart = `${month}-01`
  // Last day of the month: day 0 of the next month
  const lastDay = new Date(year, mon, 0).getDate()
  const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`

  return Promise.all(
    budgetRows.map(async (budget) => {
      const [result] = await db
        .select({
          total: sql<string>`COALESCE(SUM(${expenses.amount}), 0)`,
        })
        .from(expenses)
        .where(
          and(
            eq(expenses.businessId, businessId),
            eq(expenses.accountId, budget.accountId),
            eq(expenses.approvalStatus, 'approved'),
            between(expenses.expenseDate, monthStart, monthEnd),
          ),
        )

      const spent = Number(result?.total ?? 0)
      const budgetAmount = Number(budget.monthlyBudget)
      const threshold = Number(budget.alertThreshold ?? 0.8)
      const percentUsed = budgetAmount > 0 ? Math.round((spent / budgetAmount) * 100) : 0
      const isOverBudget = spent > budgetAmount
      const isNearLimit = !isOverBudget && spent >= threshold * budgetAmount

      return {
        id: budget.id,
        accountId: budget.accountId,
        accountName: budget.accountName ?? null,
        category: budget.category,
        monthlyBudget: budgetAmount,
        spentThisMonth: Math.round(spent * 100) / 100,
        remainingBudget: Math.max(0, Math.round((budgetAmount - spent) * 100) / 100),
        percentUsed,
        isOverBudget,
        isNearLimit,
        alertThreshold: threshold,
      }
    }),
  )
}

/**
 * List all expense-type accounts for the business (used to populate the budget form).
 */
export async function listExpenseAccounts() {
  const session = await getServerSession()
  const { businessId } = session.user

  return db
    .select({ id: accounts.id, code: accounts.code, name: accounts.name })
    .from(accounts)
    .where(and(eq(accounts.businessId, businessId), eq(accounts.type, 'expense')))
    .orderBy(accounts.code)
}

/**
 * Deactivate a budget (soft-delete).
 */
export async function deactivateBudget(budgetId: string): Promise<void> {
  const user = await requireRole(['owner', 'manager'])
  const { businessId } = user

  await db
    .update(expenseBudgets)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(expenseBudgets.id, budgetId), eq(expenseBudgets.businessId, businessId)))
}
