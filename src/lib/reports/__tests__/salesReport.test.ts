import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/db', () => ({
  db: { select: vi.fn() },
}))

import { db } from '@/db'
import { getSalesReport } from '../sales'

// ─── Chain mock factory ───────────────────────────────────────────────────────
// sales.ts queries use: db.select().from().where() — 3-level chain

function mockQuery(rows: unknown[]) {
  const where_ = vi.fn().mockResolvedValue(rows)
  const from_ = vi.fn().mockReturnValue({ where: where_ })
  vi.mocked(db.select).mockReturnValueOnce({
    from: from_,
  } as unknown as ReturnType<typeof db.select>)
}

const JAN = { from: '2026-01-01', to: '2026-01-31' }

// Minimal fulfilled order row
const ORDER = {
  id: 'order-1',
  customerId: 'cust-1',
  orderDate: '2026-01-15',
}

// Minimal orderLine row
function makeLine(
  overrides: Partial<{
    id: string
    orderId: string
    productId: string | null
    description: string | null
    quantity: string
    lineTotal: string
  }>,
) {
  return {
    id: overrides.id ?? 'line-1',
    orderId: overrides.orderId ?? 'order-1',
    productId: overrides.productId ?? 'prod-1',
    description: overrides.description ?? 'Widget',
    quantity: overrides.quantity ?? '1',
    lineTotal: overrides.lineTotal ?? '100',
  }
}

beforeEach(() => vi.resetAllMocks())

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getSalesReport', () => {
  it('Test 13 — groupBy=product: quantitySold and revenue are correct', async () => {
    // Queue 5 mock calls in order: orders, orderLines, customers, inventoryTxns, products
    mockQuery([ORDER]) // orders
    mockQuery([makeLine({ quantity: '3', lineTotal: '150' })]) // orderLines
    mockQuery([{ id: 'cust-1', name: 'Ama Serwaa', phone: '020' }]) // customers
    mockQuery([]) // inventoryTransactions (no COGS)
    mockQuery([{ id: 'prod-1', name: 'Widget', sku: 'WGT-01' }]) // products

    const report = await getSalesReport('biz-1', JAN, 'product')

    expect(report.lines).toHaveLength(1)
    expect(report.lines[0].quantitySold).toBe(3)
    expect(report.lines[0].revenue).toBe(150)
    expect(report.lines[0].cogsTotal).toBe(0)
  })

  it('Test 14 — groupBy=customer: walk-in orders (customerId=null) grouped as Walk-in', async () => {
    const walkInOrder = { id: 'order-2', customerId: null, orderDate: '2026-01-20' }

    mockQuery([walkInOrder]) // orders
    mockQuery([makeLine({ orderId: 'order-2' })]) // orderLines
    mockQuery([]) // customers (customerIds empty → returns [])
    mockQuery([]) // inventoryTransactions
    mockQuery([{ id: 'prod-1', name: 'Widget', sku: null }]) // products

    const report = await getSalesReport('biz-1', JAN, 'customer')

    expect(report.lines).toHaveLength(1)
    expect(report.lines[0].label).toBe('Walk-in')
    expect(report.lines[0].groupKey).toBe('walk-in')
    expect(report.lines[0].entityId).toBeNull()
  })

  it('Test 15 — returns empty report when no fulfilled orders exist', async () => {
    // Orders query returns empty → early return, no further DB calls
    mockQuery([]) // orders

    const report = await getSalesReport('biz-1', JAN, 'product')

    expect(report.lines).toHaveLength(0)
    expect(report.totals.orderCount).toBe(0)
    expect(report.totals.revenue).toBe(0)
  })

  it('Test 16 — grossMargin=0 when COGS equals revenue', async () => {
    // revenue = 200, COGS = 200 → grossProfit = 0 → grossMargin = 0
    mockQuery([ORDER])
    mockQuery([makeLine({ quantity: '1', lineTotal: '200', productId: 'prod-1' })])
    mockQuery([{ id: 'cust-1', name: 'Ama', phone: null }])
    mockQuery([
      // inventory transaction: qty negative for sale, unitCost × abs(qty) = 200
      { referenceId: 'order-1', productId: 'prod-1', quantity: '-1', unitCost: '200' },
    ])
    mockQuery([{ id: 'prod-1', name: 'Widget', sku: null }])

    const report = await getSalesReport('biz-1', JAN, 'product')

    expect(report.lines[0].grossMargin).toBe(0)
    expect(report.lines[0].grossProfit).toBe(0)
    expect(report.lines[0].cogsTotal).toBe(200)
  })
})
