import { and, eq, gte, inArray, lte } from 'drizzle-orm'
import { getISOWeek, getISOWeekYear } from 'date-fns'
import { db } from '@/db'
import { orders, orderLines, customers, products, inventoryTransactions } from '@/db/schema'

// ─── Types ────────────────────────────────────────────────────────────────────

export type SalesGroupBy = 'product' | 'customer' | 'day' | 'week' | 'month'

export type SalesReportLine = {
  groupKey: string // product/customer id, date string, week key, month key
  label: string // human-readable name
  entityId: string | null // productId or customerId for navigation; null for time groups
  orderCount: number
  quantitySold: number
  revenue: number // sum of orderLines.lineTotal (GHS, pre-VAT)
  cogsTotal: number // from inventoryTransactions
  grossProfit: number
  grossMargin: number // ratio 0–1; 0 when revenue = 0
}

export type SalesReport = {
  period: { from: string; to: string }
  groupBy: SalesGroupBy
  lines: SalesReportLine[]
  totals: {
    orderCount: number
    quantitySold: number
    revenue: number
    cogsTotal: number
    grossProfit: number
    grossMargin: number
  }
}

// ─── Empty report helper ──────────────────────────────────────────────────────

function emptyReport(period: { from: string; to: string }, groupBy: SalesGroupBy): SalesReport {
  return {
    period,
    groupBy,
    lines: [],
    totals: {
      orderCount: 0,
      quantitySold: 0,
      revenue: 0,
      cogsTotal: 0,
      grossProfit: 0,
      grossMargin: 0,
    },
  }
}

// ─── Week key helper ──────────────────────────────────────────────────────────

function weekKey(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  const wk = String(getISOWeek(d)).padStart(2, '0')
  return `${getISOWeekYear(d)}-W${wk}`
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Build a sales breakdown for the given period, grouped by the chosen dimension.
 * Revenue comes from orderLines.lineTotal (GHS, net of line discounts; order-level
 * VAT is excluded). COGS comes from inventoryTransactions of type 'sale'.
 *
 * Only fulfilled orders are included.
 *
 * @param businessId - from server-side session, never from client
 * @param period     - inclusive date range
 * @param groupBy    - 'product' | 'customer' | 'day' | 'week' | 'month'
 */
export async function getSalesReport(
  businessId: string,
  period: { from: string; to: string },
  groupBy: SalesGroupBy,
): Promise<SalesReport> {
  // ── Step 1: fetch fulfilled orders in period ───────────────────────────────
  const fulfilledOrders = await db
    .select({
      id: orders.id,
      customerId: orders.customerId,
      orderDate: orders.orderDate,
    })
    .from(orders)
    .where(
      and(
        eq(orders.businessId, businessId),
        eq(orders.status, 'fulfilled'),
        gte(orders.orderDate, period.from),
        lte(orders.orderDate, period.to),
      ),
    )

  // Guard: empty array causes invalid SQL `IN ()`
  if (fulfilledOrders.length === 0) return emptyReport(period, groupBy)

  const orderIds = fulfilledOrders.map((o) => o.id)
  const customerIds = [
    ...new Set(fulfilledOrders.map((o) => o.customerId).filter(Boolean)),
  ] as string[]

  // ── Step 2: parallel data fetch ────────────────────────────────────────────
  const [lines, customerRows, invTxns] = await Promise.all([
    db
      .select({
        id: orderLines.id,
        orderId: orderLines.orderId,
        productId: orderLines.productId,
        description: orderLines.description,
        quantity: orderLines.quantity,
        lineTotal: orderLines.lineTotal,
      })
      .from(orderLines)
      .where(inArray(orderLines.orderId, orderIds)),

    customerIds.length > 0
      ? db
          .select({ id: customers.id, name: customers.name, phone: customers.phone })
          .from(customers)
          .where(inArray(customers.id, customerIds))
      : Promise.resolve([]),

    db
      .select({
        referenceId: inventoryTransactions.referenceId,
        productId: inventoryTransactions.productId,
        quantity: inventoryTransactions.quantity,
        unitCost: inventoryTransactions.unitCost,
      })
      .from(inventoryTransactions)
      .where(
        and(
          eq(inventoryTransactions.businessId, businessId),
          eq(inventoryTransactions.transactionType, 'sale'),
          inArray(inventoryTransactions.referenceId, orderIds),
        ),
      ),
  ])

  // Fetch products separately (productIds derived from lines)
  const productIds = [...new Set(lines.map((l) => l.productId).filter(Boolean))] as string[]
  const productRows =
    productIds.length > 0
      ? await db
          .select({ id: products.id, name: products.name, sku: products.sku })
          .from(products)
          .where(inArray(products.id, productIds))
      : []

  // ── Step 3: build lookup maps ──────────────────────────────────────────────
  const orderMap = new Map(fulfilledOrders.map((o) => [o.id, o]))
  const customerMap = new Map(customerRows.map((c) => [c.id, c]))
  const productMap = new Map(productRows.map((p) => [p.id, p]))

  // COGS per (orderId, productId) pair — quantity is negative for sales
  const cogsMap = new Map<string, number>()
  for (const txn of invTxns) {
    if (!txn.referenceId || !txn.productId) continue
    const key = `${txn.referenceId}:${txn.productId}`
    const cogs = Math.abs(Number(txn.quantity)) * Number(txn.unitCost)
    cogsMap.set(key, (cogsMap.get(key) ?? 0) + cogs)
  }

  // ── Step 4: group in application layer ────────────────────────────────────
  type Acc = {
    groupKey: string
    label: string
    entityId: string | null
    orderIds: Set<string> // track unique orders per group
    quantitySold: number
    revenue: number
    cogsTotal: number
  }

  const groups = new Map<string, Acc>()

  for (const line of lines) {
    const order = orderMap.get(line.orderId)
    if (!order) continue

    let groupKey: string
    let label: string
    let entityId: string | null = null

    switch (groupBy) {
      case 'product': {
        groupKey = line.productId ?? `custom-${line.id}`
        const prod = line.productId ? productMap.get(line.productId) : null
        label = prod?.name ?? line.description ?? 'Custom Item'
        entityId = line.productId ?? null
        break
      }
      case 'customer': {
        groupKey = order.customerId ?? 'walk-in'
        label = order.customerId
          ? (customerMap.get(order.customerId)?.name ?? 'Unknown')
          : 'Walk-in'
        entityId = order.customerId ?? null
        break
      }
      case 'day': {
        groupKey = order.orderDate
        label = order.orderDate
        break
      }
      case 'week': {
        groupKey = weekKey(order.orderDate)
        label = groupKey
        break
      }
      case 'month': {
        groupKey = order.orderDate.slice(0, 7)
        label = groupKey
        break
      }
    }

    const existing = groups.get(groupKey) ?? {
      groupKey,
      label,
      entityId,
      orderIds: new Set<string>(),
      quantitySold: 0,
      revenue: 0,
      cogsTotal: 0,
    }

    existing.orderIds.add(line.orderId)
    existing.quantitySold += Number(line.quantity)
    existing.revenue += Number(line.lineTotal)

    // Attribute COGS to this group
    if (line.productId) {
      const cogsKey = `${line.orderId}:${line.productId}`
      existing.cogsTotal += cogsMap.get(cogsKey) ?? 0
    }

    groups.set(groupKey, existing)
  }

  // ── Step 5: convert to SalesReportLine, compute margins ───────────────────
  const reportLines: SalesReportLine[] = Array.from(groups.values()).map((g) => {
    const revenue = Math.round(g.revenue * 100) / 100
    const cogsTotal = Math.round(g.cogsTotal * 100) / 100
    const grossProfit = Math.round((revenue - cogsTotal) * 100) / 100
    const grossMargin = revenue === 0 ? 0 : grossProfit / revenue

    return {
      groupKey: g.groupKey,
      label: g.label,
      entityId: g.entityId,
      orderCount: g.orderIds.size,
      quantitySold: Math.round(g.quantitySold * 100) / 100,
      revenue,
      cogsTotal,
      grossProfit,
      grossMargin,
    }
  })

  // ── Step 6: sort ───────────────────────────────────────────────────────────
  if (groupBy === 'day' || groupBy === 'week' || groupBy === 'month') {
    reportLines.sort((a, b) => a.groupKey.localeCompare(b.groupKey))
  } else {
    reportLines.sort((a, b) => b.revenue - a.revenue)
  }

  // ── Step 7: totals ─────────────────────────────────────────────────────────
  const totalRevenue = Math.round(reportLines.reduce((s, l) => s + l.revenue, 0) * 100) / 100
  const totalCogs = Math.round(reportLines.reduce((s, l) => s + l.cogsTotal, 0) * 100) / 100
  const totalGrossProfit =
    Math.round(reportLines.reduce((s, l) => s + l.grossProfit, 0) * 100) / 100
  const totalOrders = new Set(fulfilledOrders.map((o) => o.id)).size
  const totalQty = Math.round(reportLines.reduce((s, l) => s + l.quantitySold, 0) * 100) / 100

  return {
    period,
    groupBy,
    lines: reportLines,
    totals: {
      orderCount: totalOrders,
      quantitySold: totalQty,
      revenue: totalRevenue,
      cogsTotal: totalCogs,
      grossProfit: totalGrossProfit,
      grossMargin: totalRevenue === 0 ? 0 : totalGrossProfit / totalRevenue,
    },
  }
}
