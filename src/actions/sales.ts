'use server'

import {
  and,
  eq,
  desc,
  sql,
  ilike,
  or,
  inArray,
  gte,
  lte,
  count as drizzleCount,
} from 'drizzle-orm'
import { db } from '@/db'
import { orders, orderLines, customers, products } from '@/db/schema'
import { getServerSession } from '@/lib/session'

// ─── Types ───────────────────────────────────────────────────────────────────

export type SalesSummary = {
  totalSalesThisMonth: number
  totalSalesLastMonth: number
  pendingPayments: number
  totalCustomers: number
  customerCountLastMonth: number
}

export type SalesListItem = {
  id: string
  orderNumber: string
  customerName: string | null
  orderDate: string
  status: string
  paymentStatus: string
  totalAmount: string | null
  amountPaid: string | null
  itemCount: number
}

export type SalesListResult = {
  items: SalesListItem[]
  totalCount: number
  page: number
  pageSize: number
}

export type SalesListFilters = {
  search?: string
  paymentStatus?: 'paid' | 'unpaid' | 'partial' | 'overdue'
  page?: number
  pageSize?: number
}

export type SalesReportData = {
  totalRevenue: number
  totalRevenuePrevPeriod: number
  avgOrderValue: number
  orderCount: number
  bestSellingCategory: { name: string; total: number } | null
  revenueMix: Array<{ category: string; total: number; percentage: number }>
  recentTransactions: Array<{
    id: string
    orderDate: string
    orderNumber: string
    customerName: string | null
    productDescription: string | null
    quantity: number
    totalAmount: number
  }>
}

export type SalesReportFilters = {
  period: 'daily' | 'weekly' | 'monthly' | 'quarterly'
  dateFrom: string
  dateTo: string
}

export type AgingBucket = {
  current: number
  days1_30: number
  days31_60: number
  days61_90: number
  days90Plus: number
}

export type CustomerAgingRow = {
  customerId: string
  customerName: string
  customerPhone: string | null
  totalBalance: number
} & AgingBucket

export type ReceivablesAgingData = {
  totalReceivables: number
  avgCollectionPeriodDays: number
  totalOverdue: number
  overduePercentage: number
  agingDistribution: AgingBucket
  customerLedger: CustomerAgingRow[]
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getMonthRange(offset: number = 0): { start: string; end: string } {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + offset
  const start = new Date(year, month, 1)
  const end = new Date(year, month + 1, 0)
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  }
}

// ─── Sales Summary ──────────────────────────────────────────────────────────

export async function getSalesSummary(): Promise<SalesSummary> {
  const session = await getServerSession()
  const { businessId } = session.user

  const thisMonth = getMonthRange(0)
  const lastMonth = getMonthRange(-1)

  const [thisMonthSales, lastMonthSales, pendingRow, thisMonthCustomers, lastMonthCustomers] =
    await Promise.all([
      // Total sales this month
      db
        .select({
          total: sql<string>`COALESCE(SUM(CAST(${orders.totalAmount} AS numeric)), 0)`,
        })
        .from(orders)
        .where(
          and(
            eq(orders.businessId, businessId),
            eq(orders.status, 'fulfilled'),
            gte(orders.orderDate, thisMonth.start),
            lte(orders.orderDate, thisMonth.end),
          ),
        ),

      // Total sales last month (for trend)
      db
        .select({
          total: sql<string>`COALESCE(SUM(CAST(${orders.totalAmount} AS numeric)), 0)`,
        })
        .from(orders)
        .where(
          and(
            eq(orders.businessId, businessId),
            eq(orders.status, 'fulfilled'),
            gte(orders.orderDate, lastMonth.start),
            lte(orders.orderDate, lastMonth.end),
          ),
        ),

      // Pending payments
      db
        .select({
          total: sql<string>`COALESCE(SUM(CAST(${orders.totalAmount} AS numeric) - CAST(${orders.amountPaid} AS numeric)), 0)`,
        })
        .from(orders)
        .where(
          and(
            eq(orders.businessId, businessId),
            eq(orders.status, 'fulfilled'),
            inArray(orders.paymentStatus, ['unpaid', 'partial']),
          ),
        ),

      // Unique customers this month
      db
        .select({
          count: sql<string>`COUNT(DISTINCT ${orders.customerId})`,
        })
        .from(orders)
        .where(
          and(
            eq(orders.businessId, businessId),
            eq(orders.status, 'fulfilled'),
            sql`${orders.customerId} IS NOT NULL`,
            gte(orders.orderDate, thisMonth.start),
            lte(orders.orderDate, thisMonth.end),
          ),
        ),

      // Unique customers last month
      db
        .select({
          count: sql<string>`COUNT(DISTINCT ${orders.customerId})`,
        })
        .from(orders)
        .where(
          and(
            eq(orders.businessId, businessId),
            eq(orders.status, 'fulfilled'),
            sql`${orders.customerId} IS NOT NULL`,
            gte(orders.orderDate, lastMonth.start),
            lte(orders.orderDate, lastMonth.end),
          ),
        ),
    ])

  return {
    totalSalesThisMonth: Number(thisMonthSales[0]?.total ?? '0'),
    totalSalesLastMonth: Number(lastMonthSales[0]?.total ?? '0'),
    pendingPayments: Number(pendingRow[0]?.total ?? '0'),
    totalCustomers: Number(thisMonthCustomers[0]?.count ?? '0'),
    customerCountLastMonth: Number(lastMonthCustomers[0]?.count ?? '0'),
  }
}

// ─── List Sales (Paginated) ────────────────────────────────────────────────

const OVERDUE_DAYS = 30

export async function listSales(filters?: SalesListFilters): Promise<SalesListResult> {
  const session = await getServerSession()
  const { businessId } = session.user

  const page = filters?.page ?? 1
  const pageSize = filters?.pageSize ?? 20
  const offset = (page - 1) * pageSize

  const overdueDate = new Date(Date.now() - OVERDUE_DAYS * 86400000).toISOString().split('T')[0]

  // Build WHERE conditions
  const conditions = [
    eq(orders.businessId, businessId),
    // exclude drafts
    sql`${orders.status} != 'draft'`,
  ]

  if (filters?.search) {
    conditions.push(
      or(
        ilike(orders.orderNumber, `%${filters.search}%`),
        ilike(customers.name, `%${filters.search}%`),
      )!,
    )
  }

  if (filters?.paymentStatus === 'overdue') {
    conditions.push(
      inArray(orders.paymentStatus, ['unpaid', 'partial']),
      lte(orders.orderDate, overdueDate),
    )
  } else if (filters?.paymentStatus) {
    conditions.push(eq(orders.paymentStatus, filters.paymentStatus))
  }

  // Item count subquery
  const itemCountSq = sql<number>`(SELECT COUNT(*)::int FROM ${orderLines} WHERE ${orderLines.orderId} = ${orders.id})`

  // Fetch paginated rows + total count in parallel
  const [rows, countResult] = await Promise.all([
    db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        customerName: customers.name,
        orderDate: orders.orderDate,
        status: orders.status,
        paymentStatus: orders.paymentStatus,
        totalAmount: orders.totalAmount,
        amountPaid: orders.amountPaid,
        itemCount: itemCountSq,
      })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .where(and(...conditions))
      .orderBy(desc(orders.orderDate), desc(orders.createdAt))
      .limit(pageSize)
      .offset(offset),

    db
      .select({ count: drizzleCount() })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .where(and(...conditions)),
  ])

  return {
    items: rows.map((r) => ({
      id: r.id,
      orderNumber: r.orderNumber,
      customerName: r.customerName,
      orderDate: r.orderDate,
      status: r.status,
      paymentStatus: r.paymentStatus,
      totalAmount: r.totalAmount,
      amountPaid: r.amountPaid,
      itemCount: r.itemCount ?? 0,
    })),
    totalCount: countResult[0]?.count ?? 0,
    page,
    pageSize,
  }
}

// ─── Sales Report ──────────────────────────────────────────────────────────

export async function getSalesReport(filters: SalesReportFilters): Promise<SalesReportData> {
  const session = await getServerSession()
  const { businessId } = session.user

  const { dateFrom, dateTo } = filters

  // Calculate previous period for trend
  const fromDate = new Date(dateFrom)
  const toDate = new Date(dateTo)
  const periodMs = toDate.getTime() - fromDate.getTime()
  const prevFrom = new Date(fromDate.getTime() - periodMs - 86400000).toISOString().split('T')[0]
  const prevTo = new Date(fromDate.getTime() - 86400000).toISOString().split('T')[0]

  const baseConditions = [eq(orders.businessId, businessId), eq(orders.status, 'fulfilled')]

  const [revenueRow, prevRevenueRow, categoryRows, recentRows] = await Promise.all([
    // Current period revenue + count
    db
      .select({
        total: sql<string>`COALESCE(SUM(CAST(${orders.totalAmount} AS numeric)), 0)`,
        count: sql<string>`COUNT(*)`,
      })
      .from(orders)
      .where(
        and(...baseConditions, gte(orders.orderDate, dateFrom), lte(orders.orderDate, dateTo)),
      ),

    // Previous period revenue
    db
      .select({
        total: sql<string>`COALESCE(SUM(CAST(${orders.totalAmount} AS numeric)), 0)`,
      })
      .from(orders)
      .where(
        and(...baseConditions, gte(orders.orderDate, prevFrom), lte(orders.orderDate, prevTo)),
      ),

    // Revenue by product category
    db
      .select({
        category: sql<string>`COALESCE(${products.category}, 'Uncategorized')`,
        total: sql<string>`SUM(CAST(${orderLines.lineTotal} AS numeric))`,
      })
      .from(orderLines)
      .innerJoin(orders, eq(orderLines.orderId, orders.id))
      .leftJoin(products, eq(orderLines.productId, products.id))
      .where(
        and(
          eq(orders.businessId, businessId),
          eq(orders.status, 'fulfilled'),
          gte(orders.orderDate, dateFrom),
          lte(orders.orderDate, dateTo),
        ),
      )
      .groupBy(sql`COALESCE(${products.category}, 'Uncategorized')`)
      .orderBy(desc(sql`SUM(CAST(${orderLines.lineTotal} AS numeric))`)),

    // Recent transactions
    db
      .select({
        id: orders.id,
        orderDate: orders.orderDate,
        orderNumber: orders.orderNumber,
        customerName: customers.name,
        totalAmount: orders.totalAmount,
      })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .where(and(...baseConditions, gte(orders.orderDate, dateFrom), lte(orders.orderDate, dateTo)))
      .orderBy(desc(orders.orderDate), desc(orders.createdAt))
      .limit(20),
  ])

  const totalRevenue = Number(revenueRow[0]?.total ?? '0')
  const orderCount = Number(revenueRow[0]?.count ?? '0')
  const totalRevenuePrevPeriod = Number(prevRevenueRow[0]?.total ?? '0')
  const avgOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0

  // Revenue mix with percentages
  const revenueMix = categoryRows.map((r) => ({
    category: r.category,
    total: Number(r.total ?? '0'),
    percentage: totalRevenue > 0 ? Math.round((Number(r.total ?? '0') / totalRevenue) * 100) : 0,
  }))

  const bestSellingCategory =
    revenueMix.length > 0 ? { name: revenueMix[0].category, total: revenueMix[0].total } : null

  // Get first line item description + qty for each recent transaction
  const recentTransactions = await Promise.all(
    recentRows.map(async (row) => {
      const [firstLine] = await db
        .select({
          description: orderLines.description,
          quantity: orderLines.quantity,
        })
        .from(orderLines)
        .where(eq(orderLines.orderId, row.id))
        .limit(1)

      return {
        id: row.id,
        orderDate: row.orderDate,
        orderNumber: row.orderNumber,
        customerName: row.customerName,
        productDescription: firstLine?.description ?? null,
        quantity: Number(firstLine?.quantity ?? '0'),
        totalAmount: Number(row.totalAmount ?? '0'),
      }
    }),
  )

  return {
    totalRevenue,
    totalRevenuePrevPeriod,
    avgOrderValue,
    orderCount,
    bestSellingCategory,
    revenueMix,
    recentTransactions,
  }
}

// ─── Receivables Aging ─────────────────────────────────────────────────────

export async function getReceivablesAging(): Promise<ReceivablesAgingData> {
  const session = await getServerSession()
  const { businessId } = session.user

  // Fetch all unpaid/partial fulfilled orders with customer info
  const rows = await db
    .select({
      orderId: orders.id,
      customerId: orders.customerId,
      customerName: customers.name,
      customerPhone: customers.phone,
      orderDate: orders.orderDate,
      totalAmount: orders.totalAmount,
      amountPaid: orders.amountPaid,
    })
    .from(orders)
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .where(
      and(
        eq(orders.businessId, businessId),
        eq(orders.status, 'fulfilled'),
        inArray(orders.paymentStatus, ['unpaid', 'partial']),
      ),
    )
    .orderBy(desc(orders.orderDate))

  const today = new Date()
  const customerMap = new Map<string, CustomerAgingRow>()
  let totalReceivables = 0
  let totalOverdue = 0
  let weightedDays = 0
  const distribution: AgingBucket = {
    current: 0,
    days1_30: 0,
    days31_60: 0,
    days61_90: 0,
    days90Plus: 0,
  }

  for (const row of rows) {
    const balance = Number(row.totalAmount ?? '0') - Number(row.amountPaid ?? '0')
    if (balance <= 0) continue

    const orderDate = new Date(row.orderDate + 'T00:00:00')
    const daysSince = Math.floor((today.getTime() - orderDate.getTime()) / 86400000)

    totalReceivables += balance
    weightedDays += daysSince * balance

    // Bucket the balance
    let bucketKey: keyof AgingBucket
    if (daysSince <= 0) {
      bucketKey = 'current'
    } else if (daysSince <= 30) {
      bucketKey = 'days1_30'
    } else if (daysSince <= 60) {
      bucketKey = 'days31_60'
      totalOverdue += balance
    } else if (daysSince <= 90) {
      bucketKey = 'days61_90'
      totalOverdue += balance
    } else {
      bucketKey = 'days90Plus'
      totalOverdue += balance
    }

    distribution[bucketKey] += balance

    // Accumulate per customer
    const custId = row.customerId ?? 'unknown'
    const existing = customerMap.get(custId)
    if (existing) {
      existing.totalBalance += balance
      existing[bucketKey] += balance
    } else {
      const entry: CustomerAgingRow = {
        customerId: custId,
        customerName: row.customerName ?? 'Walk-in Customer',
        customerPhone: row.customerPhone ?? null,
        totalBalance: balance,
        current: 0,
        days1_30: 0,
        days31_60: 0,
        days61_90: 0,
        days90Plus: 0,
      }
      entry[bucketKey] = balance
      customerMap.set(custId, entry)
    }
  }

  const avgCollectionPeriodDays =
    totalReceivables > 0 ? Math.round(weightedDays / totalReceivables) : 0

  const overduePercentage =
    totalReceivables > 0 ? Math.round((totalOverdue / totalReceivables) * 1000) / 10 : 0

  // Sort customers by total balance descending
  const customerLedger = Array.from(customerMap.values()).sort(
    (a, b) => b.totalBalance - a.totalBalance,
  )

  return {
    totalReceivables,
    avgCollectionPeriodDays,
    totalOverdue,
    overduePercentage,
    agingDistribution: distribution,
    customerLedger,
  }
}
