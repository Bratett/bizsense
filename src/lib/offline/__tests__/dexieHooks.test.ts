// Tests for the raw Dexie query functions exported from dexieHooks.ts.
// Uses fake-indexeddb (injected via src/test/setup-dexie.ts) — no real browser needed.
// Calls the underlying query* functions directly; useLiveQuery wrappers are not tested
// here since they require a React environment.

import { describe, it, expect, beforeEach } from 'vitest'
import { localDb } from '@/db/local/dexie'
import {
  queryCustomers,
  queryOrders,
  queryProductsWithStock,
  queryDashboardMetrics,
} from '@/lib/offline/dexieHooks'

// ── Helpers ────────────────────────────────────────────────────────────────────

const BIZ = 'biz-001'
const OTHER_BIZ = 'biz-999'
const TODAY = new Date().toISOString().slice(0, 10)
const YESTERDAY = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

function customer(overrides: Partial<Parameters<typeof localDb.customers.put>[0]> = {}) {
  return {
    id: crypto.randomUUID(),
    businessId: BIZ,
    name: 'Test Customer',
    phone: '0241000000',
    email: null,
    location: 'Accra',
    momoNumber: null,
    creditLimit: 0,
    paymentTermsDays: 0,
    isActive: true,
    syncStatus: 'synced' as const,
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function order(overrides: Partial<Parameters<typeof localDb.orders.put>[0]> = {}) {
  return {
    id: crypto.randomUUID(),
    businessId: BIZ,
    orderNumber: 'ORD-0001',
    localOrderNumber: null,
    customerId: null,
    orderDate: TODAY,
    status: 'fulfilled',
    paymentStatus: 'paid',
    subtotal: 100,
    discountAmount: 0,
    taxAmount: 0,
    totalAmount: 100,
    amountPaid: 100,
    paymentMethod: 'cash',
    fxRate: null,
    notes: null,
    journalEntryId: null,
    aiGenerated: false,
    syncStatus: 'synced' as const,
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function product(overrides: Partial<Parameters<typeof localDb.products.put>[0]> = {}) {
  return {
    id: crypto.randomUUID(),
    businessId: BIZ,
    sku: null,
    name: 'Product A',
    category: null,
    unit: 'units',
    costPrice: 10,
    sellingPrice: 15,
    sellingPriceUsd: null,
    trackInventory: true,
    reorderLevel: 5,
    isActive: true,
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function inventoryTxn(
  productId: string,
  transactionType: string,
  quantity: number,
  overrides: Partial<Parameters<typeof localDb.inventoryTransactions.put>[0]> = {},
) {
  return {
    id: crypto.randomUUID(),
    businessId: BIZ,
    productId,
    transactionType,
    quantity,
    unitCost: 10,
    referenceId: null,
    transactionDate: TODAY,
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function account(
  code: string,
  overrides: Partial<Parameters<typeof localDb.accounts.put>[0]> = {},
) {
  return {
    id: crypto.randomUUID(),
    businessId: BIZ,
    code,
    name: `Account ${code}`,
    type: 'asset',
    subtype: null,
    cashFlowActivity: 'operating',
    isSystem: true,
    ...overrides,
  }
}

function journalLine(
  accountId: string,
  debitAmount: number,
  creditAmount: number,
  overrides: Partial<Parameters<typeof localDb.journalLines.put>[0]> = {},
) {
  return {
    id: crypto.randomUUID(),
    journalEntryId: crypto.randomUUID(),
    accountId,
    debitAmount,
    creditAmount,
    currency: 'GHS',
    fxRate: 1,
    memo: null,
    ...overrides,
  }
}

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  // Clear all tables before each test for isolation
  await Promise.all([
    localDb.customers.clear(),
    localDb.orders.clear(),
    localDb.products.clear(),
    localDb.inventoryTransactions.clear(),
    localDb.accounts.clear(),
    localDb.journalLines.clear(),
    localDb.expenses.clear(),
  ])
})

// ── Test 1: queryCustomers — returns active customers for businessId ───────────

describe('queryCustomers', () => {
  it('returns only active customers for the given businessId', async () => {
    await localDb.customers.bulkPut([
      customer({ id: 'c1', name: 'Ama Owusu', businessId: BIZ, isActive: true }),
      customer({ id: 'c2', name: 'Kofi Mensah', businessId: BIZ, isActive: false }), // inactive
      customer({ id: 'c3', name: 'Other Biz', businessId: OTHER_BIZ, isActive: true }), // wrong biz
    ])

    const result = await queryCustomers(BIZ)
    expect(result.map((c) => c.id)).toEqual(['c1'])
  })

  // ── Test 2: queryCustomers — search by name and phone ──────────────────────

  it('filters by name case-insensitively and by phone', async () => {
    await localDb.customers.bulkPut([
      customer({ id: 'c1', name: 'Ama Owusu', phone: '0241000001' }),
      customer({ id: 'c2', name: 'Kofi Mensah', phone: '0551234567' }),
      customer({ id: 'c3', name: 'Abena Asante', phone: '0271111111' }),
    ])

    // Search by name (partial, case-insensitive)
    const byName = await queryCustomers(BIZ, 'ama')
    expect(byName.map((c) => c.id)).toContain('c1')
    expect(byName.map((c) => c.id)).not.toContain('c2')

    // Search by phone
    const byPhone = await queryCustomers(BIZ, '0551234567')
    expect(byPhone.map((c) => c.id)).toContain('c2')
  })
})

// ── Test 3: queryOrders — today tab ──────────────────────────────────────────

describe('queryOrders', () => {
  it("tab='today' returns only today's orders", async () => {
    await localDb.orders.bulkPut([
      order({ id: 'o1', orderDate: TODAY }),
      order({ id: 'o2', orderDate: YESTERDAY }),
    ])

    const result = await queryOrders(BIZ, { tab: 'today' })
    expect(result.map((o) => o.id)).toEqual(['o1'])
  })
})

// ── Tests 4–5: queryProductsWithStock ────────────────────────────────────────

describe('queryProductsWithStock', () => {
  it('computes currentStock from inventoryTransactions', async () => {
    const p = product({ id: 'p1' })
    await localDb.products.put(p)
    await localDb.inventoryTransactions.bulkPut([
      inventoryTxn('p1', 'purchase', 20),
      inventoryTxn('p1', 'sale', 7),
    ])

    const [result] = await queryProductsWithStock(BIZ)
    expect(result.currentStock).toBe(13) // 20 - 7
  })

  it('sets isLowStock=true when currentStock <= reorderLevel', async () => {
    const p = product({ id: 'p2', reorderLevel: 10 })
    await localDb.products.put(p)
    await localDb.inventoryTransactions.bulkPut([
      inventoryTxn('p2', 'purchase', 10),
      inventoryTxn('p2', 'sale', 5), // stock = 5, reorderLevel = 10 → low
    ])

    const [result] = await queryProductsWithStock(BIZ)
    expect(result.isLowStock).toBe(true)
    expect(result.currentStock).toBe(5)
  })
})

// ── Tests 6–9: queryDashboardMetrics ─────────────────────────────────────────

describe('queryDashboardMetrics', () => {
  it('todaySales: counts only fulfilled+paid orders placed today', async () => {
    await localDb.orders.bulkPut([
      order({
        id: 'o1',
        orderDate: TODAY,
        status: 'fulfilled',
        paymentStatus: 'paid',
        totalAmount: 200,
      }),
      order({
        id: 'o2',
        orderDate: TODAY,
        status: 'fulfilled',
        paymentStatus: 'unpaid',
        totalAmount: 100,
      }), // not paid
      order({
        id: 'o3',
        orderDate: YESTERDAY,
        status: 'fulfilled',
        paymentStatus: 'paid',
        totalAmount: 50,
      }), // yesterday
    ])

    const m = await queryDashboardMetrics(BIZ)
    expect(m.todaySales).toBe(200)
    expect(m.todaySalesCount).toBe(1)
  })

  it('outstandingReceivables: sums (totalAmount - amountPaid) for unpaid/partial orders', async () => {
    await localDb.orders.bulkPut([
      order({ id: 'o1', paymentStatus: 'unpaid', totalAmount: 300, amountPaid: 0 }),
      order({ id: 'o2', paymentStatus: 'partial', totalAmount: 200, amountPaid: 80 }),
      order({ id: 'o3', paymentStatus: 'paid', totalAmount: 500, amountPaid: 500 }), // not outstanding
    ])

    const m = await queryDashboardMetrics(BIZ)
    // 300 + (200 - 80) = 420
    expect(m.outstandingReceivables).toBe(420)
    expect(m.receivablesCount).toBe(2)
  })

  it('cashBalance: debit minus credit across cash accounts (1001–1005)', async () => {
    const cashAcc = account('1001', { id: 'acc-cash' })
    const revenueAcc = account('4001', { id: 'acc-rev' }) // not a cash account
    await localDb.accounts.bulkPut([cashAcc, revenueAcc])
    await localDb.journalLines.bulkPut([
      journalLine('acc-cash', 500, 0), // debit cash 500
      journalLine('acc-cash', 0, 150), // credit cash 150
      journalLine('acc-rev', 0, 500), // revenue credit — excluded
    ])

    const m = await queryDashboardMetrics(BIZ)
    expect(m.cashBalance).toBe(350) // 500 - 150
  })

  it('lowStockCount: counts products at or below reorderLevel', async () => {
    const p1 = product({ id: 'p1', reorderLevel: 10 })
    const p2 = product({ id: 'p2', reorderLevel: 5 })
    const p3 = product({ id: 'p3', reorderLevel: 0 }) // no reorder threshold → not counted
    await localDb.products.bulkPut([p1, p2, p3])
    await localDb.inventoryTransactions.bulkPut([
      inventoryTxn('p1', 'purchase', 8), // stock=8 <= reorder=10 → low
      inventoryTxn('p2', 'purchase', 20), // stock=20 > reorder=5 → fine
      inventoryTxn('p3', 'purchase', 3), // reorderLevel=0 → not tracked
    ])

    const m = await queryDashboardMetrics(BIZ)
    expect(m.lowStockCount).toBe(1) // only p1
  })
})
