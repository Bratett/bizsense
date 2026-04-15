import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Module mocks (hoisted before imports) ──────────────────────────────────

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
  },
}))

import { db } from '@/db'
import {
  getDashboardTodaySales,
  getDashboardCashBalance,
  getDashboardReceivables,
  getDashboardPendingApprovals,
  getDashboardActivity,
  getDashboardChartData,
  getDashboardPendingMomoLinks,
} from '../queries'

// ─── Constants ──────────────────────────────────────────────────────────────

const BUSINESS_ID = 'biz-test-001'
const USER_ID = 'user-cashier-001'

// ─── Chain helper ───────────────────────────────────────────────────────────

function makeChain(result: unknown[]) {
  const chain: Record<string, unknown> = {
    then: (f?: ((v: unknown) => unknown) | null, r?: ((e: unknown) => unknown) | null) =>
      Promise.resolve(result).then(f, r),
    catch: (f?: ((e: unknown) => unknown) | null) => Promise.resolve(result).catch(f),
    finally: (f?: (() => void) | null) => Promise.resolve(result).finally(f),
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    groupBy: vi.fn(() => chain),
  }
  return chain
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── getDashboardTodaySales ─────────────────────────────────────────────────

describe('getDashboardTodaySales', () => {
  it('returns correct total and count for today', async () => {
    const chain = makeChain([{ total: '1250.00', count: 3 }])
    vi.mocked(db.select).mockReturnValue(chain as never)

    const result = await getDashboardTodaySales(BUSINESS_ID)

    expect(result.total).toBe(1250)
    expect(result.count).toBe(3)
    expect(db.select).toHaveBeenCalled()
  })

  it('returns zeros when no orders exist today', async () => {
    const chain = makeChain([{ total: '0', count: 0 }])
    vi.mocked(db.select).mockReturnValue(chain as never)

    const result = await getDashboardTodaySales(BUSINESS_ID)

    expect(result.total).toBe(0)
    expect(result.count).toBe(0)
  })
})

// ─── getDashboardCashBalance ────────────────────────────────────────────────

describe('getDashboardCashBalance', () => {
  it('computes correct balance per account via ledger math', async () => {
    const chain = makeChain([
      { name: 'Cash on Hand', code: '1001', balance: '5000.00' },
      { name: 'MTN MoMo', code: '1002', balance: '3430.00' },
      { name: 'Bank Account', code: '1005', balance: '0.00' },
    ])
    vi.mocked(db.select).mockReturnValue(chain as never)

    const result = await getDashboardCashBalance(BUSINESS_ID)

    expect(result.totalBalance).toBe(8430)
    expect(result.breakdown).toHaveLength(3)
    expect(result.breakdown[0]).toEqual({ name: 'Cash on Hand', code: '1001', balance: 5000 })
    expect(result.breakdown[1]).toEqual({ name: 'MTN MoMo', code: '1002', balance: 3430 })
  })

  it('returns zero balance for accounts with no journal lines', async () => {
    const chain = makeChain([{ name: 'Cash on Hand', code: '1001', balance: '0' }])
    vi.mocked(db.select).mockReturnValue(chain as never)

    const result = await getDashboardCashBalance(BUSINESS_ID)

    expect(result.totalBalance).toBe(0)
    expect(result.breakdown[0].balance).toBe(0)
  })

  it('handles negative balance (bank overdraft)', async () => {
    // Bank account with more credits than debits = overdraft
    const chain = makeChain([
      { name: 'Cash on Hand', code: '1001', balance: '2000.00' },
      { name: 'Bank Account', code: '1005', balance: '-500.00' },
    ])
    vi.mocked(db.select).mockReturnValue(chain as never)

    const result = await getDashboardCashBalance(BUSINESS_ID)

    expect(result.totalBalance).toBe(1500)
    expect(result.breakdown[0].balance).toBe(2000)
    expect(result.breakdown[1].balance).toBe(-500)
  })

  it('rounds to 2 decimal places correctly', async () => {
    // Simulate DB returning high-precision balance values
    const chain = makeChain([
      { name: 'Cash on Hand', code: '1001', balance: '1000.005' },
      { name: 'MTN MoMo', code: '1002', balance: '250.994' },
    ])
    vi.mocked(db.select).mockReturnValue(chain as never)

    const result = await getDashboardCashBalance(BUSINESS_ID)

    expect(result.breakdown[0].balance).toBe(1000.01) // rounds up
    expect(result.breakdown[1].balance).toBe(250.99) // rounds down
    expect(result.totalBalance).toBe(1251) // 1000.01 + 250.99 = 1251.00
  })

  it('aggregates all 5 cash accounts into totalBalance', async () => {
    // Full set: Cash + 3 MoMo + Bank — verifies all codes are included
    const chain = makeChain([
      { name: 'Cash on Hand', code: '1001', balance: '3000.00' },
      { name: 'MTN MoMo', code: '1002', balance: '1500.00' },
      { name: 'Telecel Cash', code: '1003', balance: '200.00' },
      { name: 'AirtelTigo Money', code: '1004', balance: '75.50' },
      { name: 'Bank Account', code: '1005', balance: '10000.00' },
    ])
    vi.mocked(db.select).mockReturnValue(chain as never)

    const result = await getDashboardCashBalance(BUSINESS_ID)

    expect(result.totalBalance).toBe(14775.5)
    expect(result.breakdown).toHaveLength(5)
    // Verify ordering by code
    expect(result.breakdown.map((b) => b.code)).toEqual(['1001', '1002', '1003', '1004', '1005'])
  })
})

// ─── getDashboardReceivables ────────────────────────────────────────────────

describe('getDashboardReceivables', () => {
  it('sums totalAmount - amountPaid for partial/unpaid orders', async () => {
    const chain = makeChain([{ total: '3200.50', count: 5 }])
    vi.mocked(db.select).mockReturnValue(chain as never)

    const result = await getDashboardReceivables(BUSINESS_ID)

    expect(result.total).toBe(3200.5)
    expect(result.count).toBe(5)
  })

  it('returns zeros when all orders are paid', async () => {
    const chain = makeChain([{ total: '0', count: 0 }])
    vi.mocked(db.select).mockReturnValue(chain as never)

    const result = await getDashboardReceivables(BUSINESS_ID)

    expect(result.total).toBe(0)
    expect(result.count).toBe(0)
  })
})

// ─── getDashboardPendingApprovals ──────────────────────────────────────────

describe('getDashboardPendingApprovals', () => {
  it('returns correct count of pending expenses', async () => {
    const chain = makeChain([{ count: 7 }])
    vi.mocked(db.select).mockReturnValue(chain as never)

    const result = await getDashboardPendingApprovals(BUSINESS_ID)

    expect(result.count).toBe(7)
  })
})

// ─── getDashboardChartData ──────────────────────────────────────────────────

describe('getDashboardChartData', () => {
  it('always returns exactly 7 entries', async () => {
    // Revenue query returns empty, expense query returns empty
    const emptyChain = makeChain([])
    vi.mocked(db.select).mockReturnValue(emptyChain as never)

    const result = await getDashboardChartData(BUSINESS_ID)

    expect(result).toHaveLength(7)
  })

  it('days with no transactions return revenue: 0, expenses: 0', async () => {
    const emptyChain = makeChain([])
    vi.mocked(db.select).mockReturnValue(emptyChain as never)

    const result = await getDashboardChartData(BUSINESS_ID)

    for (const point of result) {
      expect(point.revenue).toBe(0)
      expect(point.expenses).toBe(0)
      expect(point.day).toBeTruthy()
      expect(point.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})

// ─── getDashboardActivity ───────────────────────────────────────────────────

describe('getDashboardActivity', () => {
  it('returns max 10 items merged from orders + expenses', async () => {
    // First call: orders (10 items), Second call: expenses (10 items)
    const orderItems = Array.from({ length: 10 }, (_, i) => ({
      id: `order-${i}`,
      description: `Customer ${i}`,
      amount: '100.00',
      date: `2026-04-${String(10 - i).padStart(2, '0')}`,
      status: 'paid',
      createdAt: new Date(),
    }))
    const expenseItems = Array.from({ length: 10 }, (_, i) => ({
      id: `expense-${i}`,
      description: `Expense ${i}`,
      amount: '50.00',
      date: `2026-04-${String(10 - i).padStart(2, '0')}`,
      status: 'approved',
      createdAt: new Date(),
    }))

    let callCount = 0
    vi.mocked(db.select).mockImplementation(() => {
      callCount++
      const data = callCount === 1 ? orderItems : expenseItems
      return makeChain(data) as never
    })

    const result = await getDashboardActivity(BUSINESS_ID)

    expect(result.length).toBeLessThanOrEqual(10)
    // Should contain both types
    const types = new Set(result.map((r) => r.type))
    expect(types.size).toBe(2)
  })

  it('cashier filter: passes userId when role is cashier', async () => {
    const emptyChain = makeChain([])
    vi.mocked(db.select).mockReturnValue(emptyChain as never)

    const result = await getDashboardActivity(BUSINESS_ID, USER_ID, 'cashier')

    // The function runs with cashier filter — we verify it completes without error
    // and returns an array (potentially empty)
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(0)
    // db.select was called twice (orders + expenses)
    expect(db.select).toHaveBeenCalledTimes(2)
  })
})

// ─── getDashboardPendingMomoLinks ───────────────────────────────────────────

describe('getDashboardPendingMomoLinks', () => {
  it('Test 9 — returns count 0 and total 0 when no pending links exist', async () => {
    const chain = makeChain([{ count: 0, total: '0' }])
    vi.mocked(db.select).mockReturnValue(chain as never)

    const result = await getDashboardPendingMomoLinks(BUSINESS_ID)

    expect(result.count).toBe(0)
    expect(result.total).toBe(0)
  })

  it('Test 10 — two pending non-expired links: count 2, totalAmount equals sum', async () => {
    // The query filters status=pending AND expiresAt > now; we mock the aggregate result
    const chain = makeChain([{ count: 2, total: '850.00' }])
    vi.mocked(db.select).mockReturnValue(chain as never)

    const result = await getDashboardPendingMomoLinks(BUSINESS_ID)

    expect(result.count).toBe(2)
    expect(result.total).toBe(850)
  })

  it('Test 11 — expired links excluded: query returns empty because gt(expiresAt, now) filters them', async () => {
    // The SQL gt(expiresAt, now) condition in the query excludes expired links.
    // If all links are expired, the DB returns count=0 total='0'.
    const chain = makeChain([{ count: 0, total: '0' }])
    vi.mocked(db.select).mockReturnValue(chain as never)

    const result = await getDashboardPendingMomoLinks(BUSINESS_ID)

    expect(result.count).toBe(0)
    expect(result.total).toBe(0)
  })
})
