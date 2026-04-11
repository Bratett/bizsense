import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Hoisted mock handles ─────────────────────────────────────────────────────
// vi.hoisted ensures these are initialized before vi.mock factories run.

const { mockWhere, mockLeftJoin, mockFrom, mockSelect } = vi.hoisted(() => {
  const mockWhere = vi.fn()
  const mockLeftJoin = vi.fn(() => ({ where: mockWhere }))
  const mockFrom = vi.fn(() => ({ leftJoin: mockLeftJoin }))
  const mockSelect = vi.fn(() => ({ from: mockFrom }))
  return { mockWhere, mockLeftJoin, mockFrom, mockSelect }
})

vi.mock('@/db', () => ({
  db: { select: mockSelect },
}))

vi.mock('@/db/schema', () => ({
  orders: {},
  customers: {},
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
  lte: vi.fn(),
}))

import { getArAging, computeReconciliationStatus } from '../arAging'

// ─── Factory ──────────────────────────────────────────────────────────────────

type RawRow = {
  orderId: string
  orderNumber: string
  orderDate: string
  totalAmount: string
  amountPaid: string
  customerId: string | null
  customerName: string | null
  customerPhone: string | null
  paymentTermsDays: number | null
}

function makeRow(overrides: Partial<RawRow> & { orderId: string }): RawRow {
  return {
    orderId: overrides.orderId,
    orderNumber: overrides.orderNumber ?? 'ORD-0001',
    orderDate: overrides.orderDate ?? '2026-01-01',
    totalAmount: overrides.totalAmount ?? '500.00',
    amountPaid: overrides.amountPaid ?? '0.00',
    customerId: overrides.customerId !== undefined ? overrides.customerId : 'cust-a',
    customerName: overrides.customerName !== undefined ? overrides.customerName : 'Customer A',
    customerPhone: overrides.customerPhone !== undefined ? overrides.customerPhone : null,
    paymentTermsDays: overrides.paymentTermsDays !== undefined ? overrides.paymentTermsDays : 30,
  }
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

const TODAY = '2026-04-11'

function daysAgo(n: number): string {
  const d = new Date(TODAY)
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

// ─── Reset chain refs each test ───────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockLeftJoin.mockReturnValue({ where: mockWhere })
  mockFrom.mockReturnValue({ leftJoin: mockLeftJoin })
  mockSelect.mockReturnValue({ from: mockFrom })
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getArAging', () => {
  it('Test 1 — Customer A (due today, terms 30) is in current bucket', async () => {
    // Order placed today → dueDate = today + 30 days → ageDays = 0 → 'current'
    mockWhere.mockResolvedValueOnce([
      makeRow({ orderId: 'ord-a', orderDate: TODAY, totalAmount: '500.00', paymentTermsDays: 30 }),
    ])
    const report = await getArAging('biz-1', TODAY)
    expect(report.customers[0].invoices[0].bucket).toBe('current')
    expect(report.customers[0].invoices[0].ageDays).toBe(0)
  })

  it('Test 2 — Customer B (order 40 days ago, terms 30 → 10 days past due) is in current bucket', async () => {
    // dueDate = 40 days ago + 30 days = 10 days ago → ageDays = 10 → still 'current' (0–30)
    mockWhere.mockResolvedValueOnce([
      makeRow({
        orderId: 'ord-b',
        customerId: 'cust-b',
        customerName: 'Customer B',
        orderDate: daysAgo(40),
        totalAmount: '800.00',
        paymentTermsDays: 30,
      }),
    ])
    const report = await getArAging('biz-1', TODAY)
    const inv = report.customers[0].invoices[0]
    expect(inv.bucket).toBe('current')
    expect(inv.ageDays).toBe(10)
  })

  it('Test 3 — Customer C (order 70 days ago, terms 0 → 70 days past due, outstanding 1000) is in 61-90 bucket', async () => {
    // dueDate = 70 days ago + 0 = 70 days ago → ageDays = 70 → '61-90'
    // outstanding = 1200 - 200 = 1000
    mockWhere.mockResolvedValueOnce([
      makeRow({
        orderId: 'ord-c',
        customerId: 'cust-c',
        customerName: 'Customer C',
        orderDate: daysAgo(70),
        totalAmount: '1200.00',
        amountPaid: '200.00',
        paymentTermsDays: 0,
      }),
    ])
    const report = await getArAging('biz-1', TODAY)
    const inv = report.customers[0].invoices[0]
    expect(inv.bucket).toBe('61-90')
    expect(inv.outstanding).toBe(1000)
    expect(inv.ageDays).toBe(70)
  })

  it('Test 4 — grandTotals.total = 500 + 800 + 1000 = 2300 across 3 customers', async () => {
    mockWhere.mockResolvedValueOnce([
      makeRow({
        orderId: 'ord-a',
        customerId: 'cust-a',
        customerName: 'A',
        orderDate: TODAY,
        totalAmount: '500.00',
        paymentTermsDays: 30,
      }),
      makeRow({
        orderId: 'ord-b',
        customerId: 'cust-b',
        customerName: 'B',
        orderDate: daysAgo(40),
        totalAmount: '800.00',
        paymentTermsDays: 30,
      }),
      makeRow({
        orderId: 'ord-c',
        customerId: 'cust-c',
        customerName: 'C',
        orderDate: daysAgo(70),
        totalAmount: '1200.00',
        amountPaid: '200.00',
        paymentTermsDays: 0,
      }),
    ])
    const report = await getArAging('biz-1', TODAY)
    expect(report.grandTotals.total).toBe(2300)
    expect(report.totalCustomersWithBalance).toBe(3)
  })

  it('Test 5 — computeReconciliationStatus is reconciled when aging total equals AR ledger balance', () => {
    const { isReconciled, diff } = computeReconciliationStatus(2300, 2300)
    expect(isReconciled).toBe(true)
    expect(diff).toBe(0)
  })

  it('Test 6 — fully paid orders excluded (query returns empty, no customers in report)', async () => {
    // The DB filter (paymentStatus IN unpaid|partial) excludes paid orders.
    // Simulate query returning nothing.
    mockWhere.mockResolvedValueOnce([])
    const report = await getArAging('biz-1', TODAY)
    expect(report.customers).toHaveLength(0)
    expect(report.grandTotals.total).toBe(0)
  })

  it('Test 7 — cancelled orders excluded (query returns empty, no customers in report)', async () => {
    // The DB filter (status=fulfilled) excludes cancelled orders.
    mockWhere.mockResolvedValueOnce([])
    const report = await getArAging('biz-1', TODAY)
    expect(report.customers).toHaveLength(0)
  })

  it('Test 8 — walk-in customer (no customerId) is grouped as "Walk-in"', async () => {
    mockWhere.mockResolvedValueOnce([
      makeRow({
        orderId: 'ord-w',
        customerId: null,
        customerName: null,
        orderDate: TODAY,
        totalAmount: '300.00',
        paymentTermsDays: 30,
      }),
    ])
    const report = await getArAging('biz-1', TODAY)
    expect(report.customers).toHaveLength(1)
    expect(report.customers[0].customerId).toBeNull()
    expect(report.customers[0].customerName).toBe('Walk-in')
  })

  it('Test 9 — null paymentTermsDays defaults to 30 days', async () => {
    // Order 50 days ago, terms null (defaults to 30) → dueDate = 20 days ago → ageDays = 20 → 'current'
    mockWhere.mockResolvedValueOnce([
      makeRow({
        orderId: 'ord-x',
        customerId: null,
        customerName: null,
        orderDate: daysAgo(50),
        totalAmount: '400.00',
        paymentTermsDays: null,
      }),
    ])
    const report = await getArAging('biz-1', TODAY)
    const inv = report.customers[0].invoices[0]
    expect(inv.ageDays).toBe(20)
    expect(inv.bucket).toBe('current')
  })
})
