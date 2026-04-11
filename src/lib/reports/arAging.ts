import { and, eq, inArray, lte } from 'drizzle-orm'
import { db } from '@/db'
import { orders, customers } from '@/db/schema'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ArAgingLine = {
  orderId: string
  orderNumber: string
  orderDate: string
  dueDate: string
  customerId: string | null
  customerName: string
  customerPhone: string | null
  originalAmount: number
  amountPaid: number
  outstanding: number
  ageDays: number
  bucket: 'current' | '31-60' | '61-90' | 'over90'
}

export type ArAgingCustomer = {
  customerId: string | null
  customerName: string
  customerPhone: string | null
  invoices: ArAgingLine[]
  totals: {
    current: number
    days31to60: number
    days61to90: number
    over90: number
    total: number
  }
}

export type ArAgingReport = {
  asOfDate: string
  customers: ArAgingCustomer[]
  grandTotals: {
    current: number
    days31to60: number
    days61to90: number
    over90: number
    total: number
  }
  totalCustomersWithBalance: number
}

// ─── Reconciliation helper ────────────────────────────────────────────────────

export function computeReconciliationStatus(
  agingTotal: number,
  ledgerBalance: number,
): { isReconciled: boolean; diff: number } {
  const diff = Math.round(Math.abs(agingTotal - ledgerBalance) * 100) / 100
  return { isReconciled: diff < 0.01, diff }
}

// ─── Main query function ──────────────────────────────────────────────────────

/**
 * Returns an AR aging report as at the given date.
 * Only includes fulfilled orders with paymentStatus 'unpaid' or 'partial'.
 * businessId must come from the server-side session — never from client input.
 */
export async function getArAging(
  businessId: string,
  asOfDate: string,
): Promise<ArAgingReport> {
  const rows = await db
    .select({
      orderId:          orders.id,
      orderNumber:      orders.orderNumber,
      orderDate:        orders.orderDate,
      totalAmount:      orders.totalAmount,
      amountPaid:       orders.amountPaid,
      customerId:       orders.customerId,
      customerName:     customers.name,
      customerPhone:    customers.phone,
      paymentTermsDays: customers.paymentTermsDays,
    })
    .from(orders)
    .leftJoin(customers, eq(customers.id, orders.customerId))
    .where(
      and(
        eq(orders.businessId, businessId),
        eq(orders.status, 'fulfilled'),
        inArray(orders.paymentStatus, ['unpaid', 'partial']),
        lte(orders.orderDate, asOfDate),
      ),
    )

  const today = new Date(asOfDate)

  const agingLines: ArAgingLine[] = rows.map((row) => {
    const orderDate = new Date(row.orderDate)
    const termsDays = row.paymentTermsDays ?? 30
    const dueDate   = new Date(orderDate.getTime() + termsDays * 86_400_000)
    const ageDays   = Math.max(
      0,
      Math.floor((today.getTime() - dueDate.getTime()) / 86_400_000),
    )
    const bucket: ArAgingLine['bucket'] =
      ageDays <= 30 ? 'current' :
      ageDays <= 60 ? '31-60'   :
      ageDays <= 90 ? '61-90'   : 'over90'

    return {
      orderId:        row.orderId,
      orderNumber:    row.orderNumber,
      orderDate:      row.orderDate,
      dueDate:        dueDate.toISOString().slice(0, 10),
      customerId:     row.customerId,
      customerName:   row.customerName ?? 'Walk-in',
      customerPhone:  row.customerPhone,
      originalAmount: Number(row.totalAmount),
      amountPaid:     Number(row.amountPaid),
      outstanding:    Number(row.totalAmount) - Number(row.amountPaid),
      ageDays,
      bucket,
    }
  })

  // Group by customer
  const customerMap = new Map<string, ArAgingCustomer>()
  for (const line of agingLines) {
    const key = line.customerId ?? 'walk-in'
    if (!customerMap.has(key)) {
      customerMap.set(key, {
        customerId:    line.customerId,
        customerName:  line.customerName,
        customerPhone: line.customerPhone,
        invoices: [],
        totals: { current: 0, days31to60: 0, days61to90: 0, over90: 0, total: 0 },
      })
    }
    const entry = customerMap.get(key)!
    entry.invoices.push(line)
    const t = entry.totals
    if (line.bucket === 'current') t.current    += line.outstanding
    if (line.bucket === '31-60')   t.days31to60 += line.outstanding
    if (line.bucket === '61-90')   t.days61to90 += line.outstanding
    if (line.bucket === 'over90')  t.over90     += line.outstanding
    t.total += line.outstanding
  }

  const customerList = Array.from(customerMap.values()).sort(
    (a, b) => b.totals.total - a.totals.total,
  )

  const grandTotals = customerList.reduce(
    (acc, c) => ({
      current:    acc.current    + c.totals.current,
      days31to60: acc.days31to60 + c.totals.days31to60,
      days61to90: acc.days61to90 + c.totals.days61to90,
      over90:     acc.over90     + c.totals.over90,
      total:      acc.total      + c.totals.total,
    }),
    { current: 0, days31to60: 0, days61to90: 0, over90: 0, total: 0 },
  )

  return {
    asOfDate,
    customers: customerList,
    grandTotals,
    totalCustomersWithBalance: customerList.length,
  }
}
