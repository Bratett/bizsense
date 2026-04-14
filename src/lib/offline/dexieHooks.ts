// BROWSER ONLY — do not import in server-side code or Server Actions.
// Raw query functions are exported for testability (vitest + fake-indexeddb).
// React hooks wrap each query with useLiveQuery for reactive re-renders.

import { useLiveQuery } from 'dexie-react-hooks'
import { localDb } from '@/db/local/dexie'
import type { DexieCustomer, DexieOrder, DexieExpense, DexieProduct } from '@/db/local/dexie'

// ── Types ─────────────────────────────────────────────────────────────────────

export type DexieOrderWithCustomer = DexieOrder & { customerName: string | null }

export type DexieProductWithStock = DexieProduct & {
  currentStock: number
  isLowStock: boolean
  stockValue: number
}

export interface DashboardMetrics {
  todaySales: number
  todaySalesCount: number
  outstandingReceivables: number
  receivablesCount: number
  cashBalance: number
  lowStockCount: number
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function weekStartIso(): string {
  const d = new Date()
  // Monday-based week (Ghana business week)
  const day = d.getUTCDay() // 0=Sun … 6=Sat
  const diff = (day + 6) % 7 // days since Monday
  d.setUTCDate(d.getUTCDate() - diff)
  return d.toISOString().slice(0, 10)
}

function monthStartIso(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

// ── Stock computation (shared between products hook and dashboard metrics) ───

function computeStock(txns: Array<{ transactionType: string; quantity: number }>): number {
  return txns.reduce((sum, t) => {
    if (['opening', 'purchase'].includes(t.transactionType) && t.quantity > 0)
      return sum + t.quantity
    if (['sale', 'return_out'].includes(t.transactionType)) return sum - Math.abs(t.quantity)
    if (t.transactionType === 'adjustment') return sum + t.quantity
    return sum
  }, 0)
}

// ── Customers ─────────────────────────────────────────────────────────────────

export async function queryCustomers(
  businessId: string,
  search?: string,
): Promise<DexieCustomer[]> {
  const lower = search ? search.toLowerCase() : ''

  const all = await localDb.customers
    .where('businessId')
    .equals(businessId)
    .filter((c) => {
      if (!c.isActive) return false
      if (!lower) return true
      return c.name.toLowerCase().includes(lower) || (c.phone != null && c.phone.includes(search!))
    })
    .sortBy('name')

  return all
}

export function useCustomers(businessId: string, search?: string) {
  return useLiveQuery(() => queryCustomers(businessId, search), [businessId, search])
}

// ── Orders ────────────────────────────────────────────────────────────────────

export async function queryOrders(
  businessId: string,
  filters: { tab?: string },
): Promise<DexieOrderWithCustomer[]> {
  const { tab = 'all' } = filters
  let orders: DexieOrder[]

  if (tab === 'unpaid') {
    // Use compound index for both payment statuses, then merge
    const [unpaid, partial] = await Promise.all([
      localDb.orders.where('[businessId+paymentStatus]').equals([businessId, 'unpaid']).toArray(),
      localDb.orders.where('[businessId+paymentStatus]').equals([businessId, 'partial']).toArray(),
    ])
    orders = [...unpaid, ...partial]
  } else {
    // Start with all orders for businessId, then date-filter
    const today = todayIso()
    const dateFrom =
      tab === 'today'
        ? today
        : tab === 'this_week'
          ? weekStartIso()
          : tab === 'this_month'
            ? monthStartIso()
            : null

    orders = await localDb.orders
      .where('businessId')
      .equals(businessId)
      .filter((o) => {
        if (dateFrom === null) return true
        // For 'today' require exact match; for ranges require >=
        if (tab === 'today') return o.orderDate === today
        return o.orderDate >= dateFrom
      })
      .toArray()
  }

  // Sort: newest first
  orders.sort((a, b) => {
    if (b.orderDate !== a.orderDate) return b.orderDate.localeCompare(a.orderDate)
    return b.id.localeCompare(a.id)
  })

  // Batch-lookup customer names
  const customerIds = [...new Set(orders.map((o) => o.customerId).filter(Boolean) as string[])]
  const customerMap = new Map<string, string>()
  if (customerIds.length > 0) {
    const customers = await localDb.customers.where('id').anyOf(customerIds).toArray()
    for (const c of customers) customerMap.set(c.id, c.name)
  }

  return orders.map((o) => ({
    ...o,
    customerName: o.customerId ? (customerMap.get(o.customerId) ?? null) : null,
  }))
}

export function useOrders(businessId: string, filters: { tab?: string }) {
  return useLiveQuery(() => queryOrders(businessId, filters), [businessId, filters.tab])
}

// ── Expenses ──────────────────────────────────────────────────────────────────

export async function queryExpenses(businessId: string): Promise<DexieExpense[]> {
  return localDb.expenses
    .where('businessId')
    .equals(businessId)
    .reverse() // newest first via primary key ordering after sort
    .sortBy('expenseDate')
    .then((rows) => rows.reverse()) // sortBy is ascending, we want descending
}

export function useExpenses(businessId: string) {
  return useLiveQuery(() => queryExpenses(businessId), [businessId])
}

// ── Products with stock ───────────────────────────────────────────────────────

export async function queryProductsWithStock(
  businessId: string,
  search?: string,
): Promise<DexieProductWithStock[]> {
  const lower = search ? search.toLowerCase() : ''

  const products = await localDb.products
    .where('businessId')
    .equals(businessId)
    .filter((p) => p.isActive && (!lower || p.name.toLowerCase().includes(lower)))
    .sortBy('name')

  const withStock = await Promise.all(
    products.map(async (product) => {
      const txns = await localDb.inventoryTransactions
        .where('productId')
        .equals(product.id)
        .toArray()

      const currentStock = computeStock(txns)
      const isLowStock =
        product.trackInventory && product.reorderLevel > 0 && currentStock <= product.reorderLevel
      const stockValue = Math.round(currentStock * product.costPrice * 100) / 100

      return { ...product, currentStock, isLowStock, stockValue }
    }),
  )

  return withStock
}

export function useProductsWithStock(businessId: string, search?: string) {
  return useLiveQuery(() => queryProductsWithStock(businessId, search), [businessId, search])
}

// ── Dashboard metrics ─────────────────────────────────────────────────────────

export async function queryDashboardMetrics(businessId: string): Promise<DashboardMetrics> {
  const today = todayIso()

  // Today's paid + fulfilled sales
  const todayOrders = await localDb.orders
    .where('businessId')
    .equals(businessId)
    .filter((o) => o.orderDate === today && o.status === 'fulfilled' && o.paymentStatus === 'paid')
    .toArray()

  const todaySales = todayOrders.reduce((s, o) => s + o.totalAmount, 0)
  const todaySalesCount = todayOrders.length

  // Outstanding receivables (unpaid + partial)
  const [unpaidOrders, partialOrders] = await Promise.all([
    localDb.orders.where('[businessId+paymentStatus]').equals([businessId, 'unpaid']).toArray(),
    localDb.orders.where('[businessId+paymentStatus]').equals([businessId, 'partial']).toArray(),
  ])
  const outstandingOrders = [...unpaidOrders, ...partialOrders]
  const outstandingReceivables = outstandingOrders.reduce(
    (s, o) => s + Math.max(0, o.totalAmount - o.amountPaid),
    0,
  )
  const receivablesCount = outstandingOrders.length

  // Cash balance: debit − credit across cash accounts (codes 1001–1005)
  const cashAccounts = await localDb.accounts
    .where('businessId')
    .equals(businessId)
    .filter((a) => ['1001', '1002', '1003', '1004', '1005'].includes(a.code))
    .toArray()

  const cashAccountIds = cashAccounts.map((a) => a.id)
  let cashBalance = 0
  if (cashAccountIds.length > 0) {
    const cashLines = await localDb.journalLines.where('accountId').anyOf(cashAccountIds).toArray()
    cashBalance = cashLines.reduce((s, l) => s + l.debitAmount - l.creditAmount, 0)
  }

  // Low stock count
  const allProducts = await localDb.products
    .where('businessId')
    .equals(businessId)
    .filter((p) => p.isActive && p.trackInventory && p.reorderLevel > 0)
    .toArray()

  let lowStockCount = 0
  for (const product of allProducts) {
    const txns = await localDb.inventoryTransactions.where('productId').equals(product.id).toArray()
    const stock = computeStock(txns)
    if (stock <= product.reorderLevel) lowStockCount++
  }

  return {
    todaySales,
    todaySalesCount,
    outstandingReceivables,
    receivablesCount,
    cashBalance,
    lowStockCount,
  }
}

export function useDashboardMetrics(businessId: string) {
  return useLiveQuery(() => queryDashboardMetrics(businessId), [businessId])
}
