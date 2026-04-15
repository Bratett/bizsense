import { and, desc, eq, gt, sql, inArray, gte, lte } from 'drizzle-orm'
import { db } from '@/db'
import {
  accounts,
  journalLines,
  orders,
  expenses,
  customers,
  products,
  inventoryTransactions,
  goodsReceivedNotes,
  supplierPayments,
  hubtelPaymentLinks,
} from '@/db/schema'
import { format, subDays } from 'date-fns'

// TODO Sprint 9: replace all queries with Dexie-first reads

// ─── Types ────────────────────────────────────────────────────────────────────

export type TodaySales = { total: number; count: number }

export type CashBalanceBreakdown = { name: string; code: string; balance: number }
export type CashBalance = { totalBalance: number; breakdown: CashBalanceBreakdown[] }

export type Receivables = { total: number; count: number }

export type PendingApprovals = { count: number }

export type ActivityItem = {
  type: 'sale' | 'expense'
  id: string
  description: string
  amount: number
  date: string
  status: string
  href: string
}

export type ChartDataPoint = { day: string; date: string; revenue: number; expenses: number }

// ─── getDashboardTodaySales ───────────────────────────────────────────────────

export async function getDashboardTodaySales(businessId: string): Promise<TodaySales> {
  // Ghana is UTC+0, so UTC date matches local date
  const today = new Date().toISOString().split('T')[0]

  const result = await db
    .select({
      total: sql<string>`COALESCE(SUM(${orders.totalAmount}), '0')`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.businessId, businessId),
        eq(orders.orderDate, today),
        eq(orders.status, 'fulfilled'),
        eq(orders.paymentStatus, 'paid'),
      ),
    )

  return {
    total: Math.round(Number(result[0]?.total ?? 0) * 100) / 100,
    count: Number(result[0]?.count ?? 0),
  }
}

// ─── getDashboardCashBalance ──────────────────────────────────────────────────

const CASH_ACCOUNT_CODES = ['1001', '1002', '1003', '1004', '1005']

export async function getDashboardCashBalance(businessId: string): Promise<CashBalance> {
  const rows = await db
    .select({
      name: accounts.name,
      code: accounts.code,
      balance: sql<string>`COALESCE(SUM(${journalLines.debitAmount}), 0) - COALESCE(SUM(${journalLines.creditAmount}), 0)`,
    })
    .from(accounts)
    .leftJoin(journalLines, eq(journalLines.accountId, accounts.id))
    .where(and(eq(accounts.businessId, businessId), inArray(accounts.code, CASH_ACCOUNT_CODES)))
    .groupBy(accounts.id, accounts.name, accounts.code)
    .orderBy(accounts.code)

  const breakdown: CashBalanceBreakdown[] = rows.map((r) => ({
    name: r.name,
    code: r.code,
    balance: Math.round(Number(r.balance) * 100) / 100,
  }))

  const totalBalance = breakdown.reduce((sum, b) => sum + b.balance, 0)

  return {
    totalBalance: Math.round(totalBalance * 100) / 100,
    breakdown,
  }
}

// ─── getDashboardReceivables ──────────────────────────────────────────────────

export async function getDashboardReceivables(businessId: string): Promise<Receivables> {
  const result = await db
    .select({
      total: sql<string>`COALESCE(SUM(${orders.totalAmount} - ${orders.amountPaid}), '0')`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.businessId, businessId),
        eq(orders.status, 'fulfilled'),
        inArray(orders.paymentStatus, ['unpaid', 'partial']),
      ),
    )

  return {
    total: Math.round(Number(result[0]?.total ?? 0) * 100) / 100,
    count: Number(result[0]?.count ?? 0),
  }
}

// ─── getDashboardPendingApprovals ─────────────────────────────────────────────

export async function getDashboardPendingApprovals(businessId: string): Promise<PendingApprovals> {
  const result = await db
    .select({
      count: sql<number>`COUNT(*)::int`,
    })
    .from(expenses)
    .where(
      and(eq(expenses.businessId, businessId), eq(expenses.approvalStatus, 'pending_approval')),
    )

  return { count: Number(result[0]?.count ?? 0) }
}

// ─── getDashboardActivity ─────────────────────────────────────────────────────

export async function getDashboardActivity(
  businessId: string,
  userId?: string,
  role?: string,
): Promise<ActivityItem[]> {
  const isCashier = role === 'cashier'

  // Build order conditions
  const orderConditions = [eq(orders.businessId, businessId), eq(orders.status, 'fulfilled')]
  if (isCashier && userId) {
    orderConditions.push(eq(orders.createdBy, userId))
  }

  // Build expense conditions
  const expenseConditions = [
    eq(expenses.businessId, businessId),
    inArray(expenses.approvalStatus, ['approved', 'pending_approval']),
  ]
  if (isCashier && userId) {
    expenseConditions.push(eq(expenses.createdBy, userId))
  }

  const [recentOrders, recentExpenses] = await Promise.all([
    db
      .select({
        id: orders.id,
        description: sql<string>`COALESCE(${customers.name}, 'Walk-in customer')`,
        amount: orders.totalAmount,
        date: orders.orderDate,
        status: orders.paymentStatus,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .where(and(...orderConditions))
      .orderBy(desc(orders.orderDate), desc(orders.createdAt))
      .limit(10),

    db
      .select({
        id: expenses.id,
        description: expenses.description,
        amount: expenses.amount,
        date: expenses.expenseDate,
        status: expenses.approvalStatus,
        createdAt: expenses.createdAt,
      })
      .from(expenses)
      .where(and(...expenseConditions))
      .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt))
      .limit(10),
  ])

  const items: ActivityItem[] = [
    ...recentOrders.map((o) => ({
      type: 'sale' as const,
      id: o.id,
      description: o.description,
      amount: Number(o.amount ?? 0),
      date: o.date,
      status: o.status,
      href: `/orders/${o.id}`,
    })),
    ...recentExpenses.map((e) => ({
      type: 'expense' as const,
      id: e.id,
      description: e.description,
      amount: Number(e.amount ?? 0),
      date: e.date,
      status: e.status,
      href: `/expenses/${e.id}`,
    })),
  ]

  // Sort by date DESC, then by createdAt DESC as tiebreaker
  items.sort((a, b) => {
    const dateCompare = b.date.localeCompare(a.date)
    if (dateCompare !== 0) return dateCompare
    return 0
  })

  return items.slice(0, 10)
}

// ─── getDashboardChartData ────────────────────────────────────────────────────

export async function getDashboardChartData(businessId: string): Promise<ChartDataPoint[]> {
  const today = new Date()
  const sevenDaysAgo = subDays(today, 6)

  const startDate = format(sevenDaysAgo, 'yyyy-MM-dd')
  const endDate = format(today, 'yyyy-MM-dd')

  const [revenueRows, expenseRows] = await Promise.all([
    db
      .select({
        date: orders.orderDate,
        total: sql<string>`COALESCE(SUM(${orders.totalAmount}), '0')`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.businessId, businessId),
          eq(orders.status, 'fulfilled'),
          gte(orders.orderDate, startDate),
          lte(orders.orderDate, endDate),
        ),
      )
      .groupBy(orders.orderDate),

    db
      .select({
        date: expenses.expenseDate,
        total: sql<string>`COALESCE(SUM(${expenses.amount}), '0')`,
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.businessId, businessId),
          eq(expenses.approvalStatus, 'approved'),
          gte(expenses.expenseDate, startDate),
          lte(expenses.expenseDate, endDate),
        ),
      )
      .groupBy(expenses.expenseDate),
  ])

  // Build a map for fast lookup
  const revenueMap = new Map(revenueRows.map((r) => [r.date, Number(r.total)]))
  const expenseMap = new Map(expenseRows.map((r) => [r.date, Number(r.total)]))

  // Generate exactly 7 entries
  const chartData: ChartDataPoint[] = []
  for (let i = 0; i < 7; i++) {
    const date = subDays(today, 6 - i)
    const dateStr = format(date, 'yyyy-MM-dd')
    const dayLabel = format(date, 'EEE') // Mon, Tue, etc.

    chartData.push({
      day: dayLabel,
      date: dateStr,
      revenue: Math.round((revenueMap.get(dateStr) ?? 0) * 100) / 100,
      expenses: Math.round((expenseMap.get(dateStr) ?? 0) * 100) / 100,
    })
  }

  return chartData
}

// ─── getDashboardPayables ─────────────────────────────────────────────────────

export type DashboardPayables = { total: number; supplierCount: number }

export async function getDashboardPayables(businessId: string): Promise<DashboardPayables> {
  const [result] = await db
    .select({
      supplierCount: sql<number>`COUNT(DISTINCT ${goodsReceivedNotes.supplierId})::int`,
      totalOwed: sql<string>`COALESCE(SUM(CAST(${goodsReceivedNotes.totalCost} AS numeric)), 0)`,
    })
    .from(goodsReceivedNotes)
    .where(
      and(
        eq(goodsReceivedNotes.businessId, businessId),
        eq(goodsReceivedNotes.status, 'confirmed'),
      ),
    )

  const [paidResult] = await db
    .select({
      totalPaid: sql<string>`COALESCE(SUM(CAST(${supplierPayments.amount} AS numeric)), 0)`,
    })
    .from(supplierPayments)
    .where(eq(supplierPayments.businessId, businessId))

  const totalOwed = Number(result?.totalOwed ?? '0')
  const totalPaid = Number(paidResult?.totalPaid ?? '0')
  const total = Math.round((totalOwed - totalPaid) * 100) / 100

  return {
    total: Math.max(0, total),
    supplierCount: Number(result?.supplierCount ?? 0),
  }
}

// ─── getDashboardLowStock ────────────────────────────────────────────────────

export type LowStockItem = {
  id: string
  name: string
  sku: string | null
  currentStock: number
  reorderLevel: number
  unit: string | null
}

export type DashboardLowStock = {
  count: number
  items: LowStockItem[]
}

export async function getDashboardLowStock(businessId: string): Promise<DashboardLowStock> {
  const stockSubquery = sql<string>`COALESCE((
    SELECT SUM(CAST(${inventoryTransactions.quantity} AS numeric))
    FROM ${inventoryTransactions}
    WHERE ${inventoryTransactions.productId} = ${products.id}
      AND ${inventoryTransactions.businessId} = ${products.businessId}
  ), 0)`

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      unit: products.unit,
      reorderLevel: products.reorderLevel,
      currentStock: stockSubquery,
    })
    .from(products)
    .where(
      and(
        eq(products.businessId, businessId),
        eq(products.isActive, true),
        eq(products.trackInventory, true),
        sql`${products.reorderLevel} > 0`,
        sql`${stockSubquery} <= ${products.reorderLevel}`,
      ),
    )
    .orderBy(sql`${products.reorderLevel} - ${stockSubquery} DESC`)

  const items: LowStockItem[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    sku: r.sku,
    currentStock: Math.round(Number(r.currentStock) * 100) / 100,
    reorderLevel: r.reorderLevel,
    unit: r.unit,
  }))

  return {
    count: items.length,
    items: items.slice(0, 5),
  }
}

// ─── getDashboardPendingMomoLinks ─────────────────────────────────────────────

export type PendingMomoLinks = { count: number; total: number }

/**
 * Count and sum active (non-expired) pending Hubtel MoMo payment links.
 * Used to surface the MoMo payment links alert card on the dashboard.
 */
export async function getDashboardPendingMomoLinks(businessId: string): Promise<PendingMomoLinks> {
  const now = new Date()

  const result = await db
    .select({
      count: sql<number>`COUNT(*)::int`,
      total: sql<string>`COALESCE(SUM(${hubtelPaymentLinks.amount}), '0')`,
    })
    .from(hubtelPaymentLinks)
    .where(
      and(
        eq(hubtelPaymentLinks.businessId, businessId),
        eq(hubtelPaymentLinks.status, 'pending'),
        gt(hubtelPaymentLinks.expiresAt, now),
      ),
    )

  return {
    count: result[0]?.count ?? 0,
    total: Math.round(Number(result[0]?.total ?? 0) * 100) / 100,
  }
}
