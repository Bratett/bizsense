import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock generateOrderNumber before any imports that use it — device.ts throws in Node
vi.mock('@/lib/orderNumber', () => ({
  generateOrderNumber: vi.fn().mockResolvedValue('ORD-TEST-0001'),
  isValidOrderNumber: vi.fn().mockReturnValue(true),
}))

import { localDb } from '@/db/local/dexie'
import { writeOrderOffline, type OfflineOrderInput } from '@/lib/offline/offlineOrders'
import { isNetworkAvailable } from '@/lib/offline/network'

// ── Reset Dexie between tests ────────────────────────────────────────────────
beforeEach(async () => {
  await localDb.orders.clear()
  await localDb.orderLines.clear()
  await localDb.inventoryTransactions.clear()
  await localDb.syncQueue.clear()
  await localDb.deferredJournals.clear()
  await localDb.meta.clear()
})

// ── Shared test input factory ─────────────────────────────────────────────────

function makeOrderInput(overrides: Partial<OfflineOrderInput> = {}): OfflineOrderInput {
  return {
    orderNumber: 'ORD-TEST-0001', // will be overwritten by generateOrderNumber
    businessId: 'biz-001',
    userId: 'user-001',
    orderDate: '2026-04-14',
    applyVat: false,
    paymentStatus: 'paid',
    paymentMethod: 'cash',
    subtotal: 100,
    discountAmount: 0,
    taxAmount: 0,
    totalAmount: 100,
    amountPaid: 100,
    lines: [
      {
        description: 'Consulting service',
        quantity: 1,
        unitPrice: 100,
        unitPriceCurrency: 'GHS',
      },
    ],
    ...overrides,
  }
}

// ── Test 1: Creates order in Dexie with syncStatus='pending' ─────────────────

describe('writeOrderOffline', () => {
  it('creates order in Dexie with syncStatus pending', async () => {
    const orderId = await writeOrderOffline(makeOrderInput())

    const order = await localDb.orders.get(orderId)
    expect(order).toBeDefined()
    expect(order!.syncStatus).toBe('pending')
    expect(order!.businessId).toBe('biz-001')
    expect(order!.paymentStatus).toBe('paid')
    expect(order!.totalAmount).toBe(100)
  })

  // ── Test 2: Creates orderLines in Dexie ────────────────────────────────────

  it('creates orderLines with correct orderId', async () => {
    const orderId = await writeOrderOffline(makeOrderInput())

    const lines = await localDb.orderLines.where('orderId').equals(orderId).toArray()
    expect(lines).toHaveLength(1)
    expect(lines[0].description).toBe('Consulting service')
    expect(lines[0].quantity).toBe(1)
  })

  // ── Test 3: Generates order number matching ORD-XXXX-NNNN ─────────────────

  it('generates order number in ORD-XXXX-NNNN format', async () => {
    const orderId = await writeOrderOffline(makeOrderInput())

    const order = await localDb.orders.get(orderId)
    expect(order!.orderNumber).toMatch(/^ORD-[A-Z2-9]{4}-\d{4,}$/)
  })

  // ── Test 4: Enqueues sync item for order ───────────────────────────────────

  it('enqueues sync item for order with status pending', async () => {
    const orderId = await writeOrderOffline(makeOrderInput())

    const queueItems = await localDb.syncQueue
      .where('tableName')
      .equals('orders')
      .and((item) => item.recordId === orderId)
      .toArray()

    expect(queueItems).toHaveLength(1)
    expect(queueItems[0].status).toBe('pending')
    expect(queueItems[0].operation).toBe('upsert')
  })

  // ── Test 5: With product line, creates inventory_transaction in Dexie ──────

  it('creates inventory_transaction when product line is present', async () => {
    // Pre-populate a purchase layer for FIFO
    await localDb.inventoryTransactions.add({
      id: 'inv-purchase-001',
      businessId: 'biz-001',
      productId: 'prod-001',
      transactionType: 'purchase',
      quantity: 10,
      unitCost: 5,
      referenceId: null,
      transactionDate: '2026-01-01',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })

    const input = makeOrderInput({
      lines: [
        {
          description: 'Widget',
          productId: 'prod-001',
          quantity: 3,
          unitPrice: 20,
          unitPriceCurrency: 'GHS',
        },
      ],
    })

    await writeOrderOffline(input)

    // Should have the original purchase + new sale transaction
    const allTxns = await localDb.inventoryTransactions
      .where('productId')
      .equals('prod-001')
      .toArray()
    expect(allTxns).toHaveLength(2)

    const saleTxn = allTxns.find((t) => t.transactionType === 'sale')
    expect(saleTxn).toBeDefined()
    expect(saleTxn!.quantity).toBe(-3) // outbound
  })

  // ── Test 6: Enqueues sync item for inventory_transaction ──────────────────

  it('enqueues sync item for inventory_transaction when product line present', async () => {
    await localDb.inventoryTransactions.add({
      id: 'inv-purchase-002',
      businessId: 'biz-001',
      productId: 'prod-002',
      transactionType: 'purchase',
      quantity: 10,
      unitCost: 8,
      referenceId: null,
      transactionDate: '2026-01-01',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })

    const input = makeOrderInput({
      lines: [
        {
          description: 'Gadget',
          productId: 'prod-002',
          quantity: 2,
          unitPrice: 30,
          unitPriceCurrency: 'GHS',
        },
      ],
    })

    await writeOrderOffline(input)

    const invSyncItems = await localDb.syncQueue
      .where('tableName')
      .equals('inventory_transactions')
      .toArray()
    expect(invSyncItems).toHaveLength(1)
    expect(invSyncItems[0].status).toBe('pending')
  })

  // ── Test 7: Deferred journal lines balance (SUM debits = SUM credits) ──────

  it('produces balanced deferred journal lines for a cash sale with tax', async () => {
    const input = makeOrderInput({
      subtotal: 100,
      discountAmount: 0,
      taxAmount: 21.9,
      totalAmount: 121.9,
      amountPaid: 121.9,
      paymentMethod: 'cash',
    })

    const orderId = await writeOrderOffline(input)

    const journal = await localDb.deferredJournals.where('sourceId').equals(orderId).first()

    expect(journal).toBeDefined()

    const lines = journal!.proposedEntry.lines
    const totalDebits = lines.reduce((s, l) => s + l.debitAmount, 0)
    const totalCredits = lines.reduce((s, l) => s + l.creditAmount, 0)

    expect(Math.abs(totalDebits - totalCredits)).toBeLessThan(0.01)
  })

  // ── Test 8: Service line — deferred journal has no COGS lines ─────────────

  it('does not include COGS lines in deferred journal for service-only sale', async () => {
    // No product id on the line — service/non-inventory item
    const input = makeOrderInput({
      lines: [
        {
          description: 'Consulting',
          quantity: 1,
          unitPrice: 100,
          unitPriceCurrency: 'GHS',
          // no productId
        },
      ],
    })

    const orderId = await writeOrderOffline(input)

    const journal = await localDb.deferredJournals.where('sourceId').equals(orderId).first()

    expect(journal).toBeDefined()
    const codes = journal!.proposedEntry.lines.map((l) => l.accountCode)
    expect(codes).not.toContain('5001') // no COGS
    expect(codes).not.toContain('1200') // no Inventory
  })

  // ── Test 9: Credit sale debits AR (1100), not cash (1001) ─────────────────

  it('debits AR account for credit sales', async () => {
    const input = makeOrderInput({
      paymentStatus: 'unpaid',
      paymentMethod: undefined,
      amountPaid: 0,
      customerId: 'cust-001',
    })

    const orderId = await writeOrderOffline(input)

    const journal = await localDb.deferredJournals.where('sourceId').equals(orderId).first()

    expect(journal).toBeDefined()
    const debitLines = journal!.proposedEntry.lines.filter((l) => l.debitAmount > 0)
    const codes = debitLines.map((l) => l.accountCode)

    expect(codes).toContain('1100') // AR
    expect(codes).not.toContain('1001') // no cash debit
  })

  // ── Test 10: Multiple calls produce sequential sync queue IDs ─────────────

  it('produces sequential auto-increment sync queue IDs across multiple writes', async () => {
    await writeOrderOffline(makeOrderInput())
    await writeOrderOffline(makeOrderInput())

    const allItems = await localDb.syncQueue.where('tableName').equals('orders').toArray()
    expect(allItems).toHaveLength(2)

    const ids = allItems.map((i) => i.id!).sort((a, b) => a - b)
    expect(ids[1]).toBeGreaterThan(ids[0])
  })
})

// ── isNetworkAvailable — returns false on AbortError ─────────────────────────

describe('isNetworkAvailable', () => {
  it('returns false when fetch throws AbortError', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(abortError))
    vi.stubGlobal('navigator', { onLine: true })

    const result = await isNetworkAvailable()
    expect(result).toBe(false)

    vi.unstubAllGlobals()
  })
})
