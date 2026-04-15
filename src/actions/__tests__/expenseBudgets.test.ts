import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/session', () => ({
  getServerSession: vi.fn(),
}))

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}))

import { getServerSession } from '@/lib/session'
import { db } from '@/db'
import { getExpenseBudgetStatus } from '../expenseBudgets'

// ── Helpers ───────────────────────────────────────────────────────────────────

const BUSINESS_ID = 'biz-test-001'
const ACCOUNT_ID = 'acct-rent-001'

function mockSession() {
  vi.mocked(getServerSession).mockResolvedValue({
    user: {
      id: 'user-001',
      email: 'owner@test.com',
      businessId: BUSINESS_ID,
      role: 'owner' as const,
      fullName: 'Test Owner',
    },
  })
}

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
  }
  return chain
}

const BUDGET_ROW = {
  id: 'budget-001',
  accountId: ACCOUNT_ID,
  accountName: 'Rent',
  category: 'Rent',
  monthlyBudget: '1000.00',
  alertThreshold: '0.80',
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('getExpenseBudgetStatus', () => {
  // ── Test 16: spent < threshold × budget → isNearLimit = false ────────────
  it('spent below alert threshold: isNearLimit is false', async () => {
    mockSession()

    // listExpenseBudgets → returns budget row
    const budgetsChain = makeChain([BUDGET_ROW])
    // SUM expenses for the month → 500 (50% of 1000 budget, below 80% threshold)
    const sumChain = makeChain([{ total: '500.00' }])

    vi.mocked(db.select)
      .mockReturnValueOnce(budgetsChain as never)
      .mockReturnValueOnce(sumChain as never)

    const result = await getExpenseBudgetStatus('2026-04')

    expect(result).toHaveLength(1)
    expect(result[0]?.isNearLimit).toBe(false)
    expect(result[0]?.isOverBudget).toBe(false)
    expect(result[0]?.spentThisMonth).toBe(500)
    expect(result[0]?.percentUsed).toBe(50)
  })

  // ── Test 17: spent >= 80% AND <= budget → isNearLimit = true ─────────────
  it('spent at or above alert threshold but not over budget: isNearLimit is true', async () => {
    mockSession()

    const budgetsChain = makeChain([BUDGET_ROW])
    // 850 = 85% of 1000 — above 80% threshold, below 100%
    const sumChain = makeChain([{ total: '850.00' }])

    vi.mocked(db.select)
      .mockReturnValueOnce(budgetsChain as never)
      .mockReturnValueOnce(sumChain as never)

    const result = await getExpenseBudgetStatus('2026-04')

    expect(result[0]?.isNearLimit).toBe(true)
    expect(result[0]?.isOverBudget).toBe(false)
    expect(result[0]?.percentUsed).toBe(85)
  })

  // ── Test 18: spent > budget → isOverBudget = true ────────────────────────
  it('spent exceeds monthly budget: isOverBudget is true', async () => {
    mockSession()

    const budgetsChain = makeChain([BUDGET_ROW])
    // 1350 > 1000 budget
    const sumChain = makeChain([{ total: '1350.00' }])

    vi.mocked(db.select)
      .mockReturnValueOnce(budgetsChain as never)
      .mockReturnValueOnce(sumChain as never)

    const result = await getExpenseBudgetStatus('2026-04')

    expect(result[0]?.isOverBudget).toBe(true)
    expect(result[0]?.isNearLimit).toBe(false) // over budget overrides near-limit
    expect(result[0]?.spentThisMonth).toBe(1350)
    expect(result[0]?.remainingBudget).toBe(0) // capped at 0
  })

  // ── Test 19: no expenses this month → spentThisMonth = 0 ────────────────
  it('no expenses recorded this month: spentThisMonth is 0', async () => {
    mockSession()

    const budgetsChain = makeChain([BUDGET_ROW])
    // COALESCE returns '0' when no rows
    const sumChain = makeChain([{ total: '0' }])

    vi.mocked(db.select)
      .mockReturnValueOnce(budgetsChain as never)
      .mockReturnValueOnce(sumChain as never)

    const result = await getExpenseBudgetStatus('2026-04')

    expect(result[0]?.spentThisMonth).toBe(0)
    expect(result[0]?.isNearLimit).toBe(false)
    expect(result[0]?.isOverBudget).toBe(false)
    expect(result[0]?.remainingBudget).toBe(1000)
    expect(result[0]?.percentUsed).toBe(0)
  })

  it('no budgets configured: returns empty array', async () => {
    mockSession()

    const budgetsChain = makeChain([])
    vi.mocked(db.select).mockReturnValueOnce(budgetsChain as never)

    const result = await getExpenseBudgetStatus('2026-04')
    expect(result).toHaveLength(0)
  })
})
