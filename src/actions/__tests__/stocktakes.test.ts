import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Module mocks (hoisted before imports) ──────────────────────────────────

vi.mock('@/lib/session', () => ({
  getServerSession: vi.fn(),
}))

vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: vi.fn(),
}))

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
  },
}))

vi.mock('@/lib/inventory/queries', () => ({
  getProductTransactions: vi.fn(),
}))

vi.mock('@/lib/inventory/fifo', () => ({
  computeFifoInventoryValue: vi.fn(),
}))

vi.mock('@/actions/inventory', () => ({
  adjustStock: vi.fn(),
}))

import { getServerSession } from '@/lib/session'
import { requireRole } from '@/lib/auth/requireRole'
import { db } from '@/db'
import { getProductTransactions } from '@/lib/inventory/queries'
import { computeFifoInventoryValue } from '@/lib/inventory/fifo'
import { adjustStock } from '@/actions/inventory'
import {
  initiateStocktake,
  updateStocktakeCount,
  confirmStocktake,
  cancelStocktake,
  getActiveStocktake,
} from '../stocktakes'
import type { UserRole } from '@/lib/session'

// ─── Test constants ─────────────────────────────────────────────────────────

const BUSINESS_ID = 'biz-test-001'
const USER_ID = 'user-test-001'
const STOCKTAKE_ID = 'stocktake-001'
const PRODUCT_A = 'product-a'
const PRODUCT_B = 'product-b'

// ─── Mock helpers ───────────────────────────────────────────────────────────

function mockUser(role: UserRole = 'owner') {
  const user = {
    id: USER_ID,
    email: `${role}@test.com`,
    businessId: BUSINESS_ID,
    role,
    fullName: `Test ${role}`,
  }
  vi.mocked(requireRole).mockResolvedValue(user)
  vi.mocked(getServerSession).mockResolvedValue({ user })
  return user
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
    innerJoin: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    groupBy: vi.fn(() => chain),
  }
  return chain
}

function makeUpdateChain() {
  const chain: Record<string, unknown> = {
    set: vi.fn(() => chain),
    where: vi.fn(() => ({
      then: (f?: ((v: unknown) => unknown) | null) => Promise.resolve(undefined).then(f),
      catch: (f?: ((e: unknown) => unknown) | null) => Promise.resolve(undefined).catch(f),
      finally: (f?: (() => void) | null) => Promise.resolve(undefined).finally(f),
    })),
  }
  return chain
}

let txInserts: Array<{ data: unknown }> = []

function mockDbTransaction() {
  txInserts = []
  vi.mocked(db.transaction).mockImplementation(async (callback) => {
    const mockTx = {
      insert: vi.fn(() => ({
        values: vi.fn((data: unknown) => {
          txInserts.push({ data })
          const rows = Array.isArray(data) ? data : [data]
          const returnData = rows.map((r: Record<string, unknown>, i: number) => ({
            id: `tx-row-${txInserts.length}-${i}`,
            ...r,
          }))
          return {
            returning: vi.fn().mockResolvedValue(returnData),
            then: (f?: ((v: unknown) => unknown) | null) => Promise.resolve(returnData).then(f),
            catch: (f?: ((e: unknown) => unknown) | null) => Promise.resolve(returnData).catch(f),
            finally: (f?: (() => void) | null) => Promise.resolve(returnData).finally(f),
          }
        }),
      })),
    }
    return callback(mockTx as never)
  })
}

// ─── Tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
})

describe('initiateStocktake', () => {
  it('creates stocktake with lines and correct expectedQuantity snapshots', async () => {
    mockUser('manager')
    mockDbTransaction()

    // No existing in-progress stocktake
    let selectCallCount = 0
    vi.mocked(db.select).mockImplementation(() => {
      selectCallCount++
      if (selectCallCount === 1) {
        // Check for existing in_progress stocktake
        return makeChain([]) as unknown as ReturnType<typeof db.select>
      }
      // Fetch active products
      return makeChain([
        { id: PRODUCT_A, name: 'Widget A' },
        { id: PRODUCT_B, name: 'Widget B' },
      ]) as unknown as ReturnType<typeof db.select>
    })

    vi.mocked(getProductTransactions)
      .mockResolvedValueOnce([
        { id: 't1', transactionType: 'opening', quantity: 50, unitCost: 10, transactionDate: '2025-01-01', createdAt: new Date() },
      ])
      .mockResolvedValueOnce([
        { id: 't2', transactionType: 'opening', quantity: 30, unitCost: 5, transactionDate: '2025-01-01', createdAt: new Date() },
      ])

    vi.mocked(computeFifoInventoryValue)
      .mockReturnValueOnce({ totalValue: 500, totalQuantity: 50, remainingLayers: [] })
      .mockReturnValueOnce({ totalValue: 150, totalQuantity: 30, remainingLayers: [] })

    const result = await initiateStocktake('Test stocktake')

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.stocktakeId).toBeDefined()
    }

    // Should have called transaction with insert for stocktake + lines
    expect(db.transaction).toHaveBeenCalledOnce()
    expect(txInserts.length).toBe(2) // stocktake row + lines array

    // Verify stocktake row
    const stocktakeRow = txInserts[0].data as Record<string, unknown>
    expect(stocktakeRow.status).toBe('in_progress')
    expect(stocktakeRow.businessId).toBe(BUSINESS_ID)

    // Verify lines
    const lineRows = txInserts[1].data as Array<Record<string, unknown>>
    expect(lineRows).toHaveLength(2)
    expect(lineRows[0].expectedQuantity).toBe('50.00')
    expect(lineRows[1].expectedQuantity).toBe('30.00')
  })

  it('blocks when in_progress stocktake already exists', async () => {
    mockUser('owner')

    vi.mocked(db.select).mockImplementation(() => {
      return makeChain([{ id: 'existing-stocktake' }]) as unknown as ReturnType<typeof db.select>
    })

    const result = await initiateStocktake()

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('already in progress')
    }
  })
})

describe('updateStocktakeCount', () => {
  it('updates countedQuantity and computes varianceQuantity correctly', async () => {
    mockUser('accountant')

    let selectCallCount = 0
    vi.mocked(db.select).mockImplementation(() => {
      selectCallCount++
      if (selectCallCount === 1) {
        // Verify stocktake
        return makeChain([{ id: STOCKTAKE_ID, status: 'in_progress' }]) as unknown as ReturnType<typeof db.select>
      }
      if (selectCallCount === 2) {
        // Find line
        return makeChain([{ id: 'line-1', expectedQuantity: '50.00' }]) as unknown as ReturnType<typeof db.select>
      }
      // Fallback (costPrice lookup)
      return makeChain([{ costPrice: '10.00' }]) as unknown as ReturnType<typeof db.select>
    })

    vi.mocked(getProductTransactions).mockResolvedValue([])
    vi.mocked(computeFifoInventoryValue).mockReturnValue({
      totalValue: 500,
      totalQuantity: 50,
      remainingLayers: [],
    })

    vi.mocked(db.update).mockImplementation(() => makeUpdateChain() as unknown as ReturnType<typeof db.update>)

    const result = await updateStocktakeCount(STOCKTAKE_ID, PRODUCT_A, 45)

    expect(result.success).toBe(true)
    expect(db.update).toHaveBeenCalled()

    // Verify the set() call contains the correct variance
    const updateChain = vi.mocked(db.update).mock.results[0].value
    const setCall = updateChain.set.mock.calls[0][0]
    expect(setCall.countedQuantity).toBe('45.00')
    expect(setCall.varianceQuantity).toBe('-5.00')
    // varianceValue = -5 * (500/50) = -5 * 10 = -50
    expect(setCall.varianceValue).toBe('-50.00')
  })

  it('rejects if stocktake is not in_progress', async () => {
    mockUser('owner')

    vi.mocked(db.select).mockImplementation(() => {
      return makeChain([{ id: STOCKTAKE_ID, status: 'confirmed' }]) as unknown as ReturnType<typeof db.select>
    })

    const result = await updateStocktakeCount(STOCKTAKE_ID, PRODUCT_A, 10)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('not in progress')
    }
  })
})

describe('confirmStocktake', () => {
  it('calls adjustStock for each variance line and sets confirmed', async () => {
    mockUser('owner')

    let selectCallCount = 0
    vi.mocked(db.select).mockImplementation(() => {
      selectCallCount++
      if (selectCallCount === 1) {
        // Verify stocktake
        return makeChain([{ id: STOCKTAKE_ID, status: 'in_progress' }]) as unknown as ReturnType<typeof db.select>
      }
      // Fetch lines
      return makeChain([
        {
          id: 'line-1',
          productId: PRODUCT_A,
          countedQuantity: '55.00',
          varianceQuantity: '5.00',
          varianceValue: '50.00',
          adjustmentPosted: false,
        },
        {
          id: 'line-2',
          productId: PRODUCT_B,
          countedQuantity: '25.00',
          varianceQuantity: '-5.00',
          varianceValue: '-25.00',
          adjustmentPosted: false,
        },
      ]) as unknown as ReturnType<typeof db.select>
    })

    vi.mocked(adjustStock).mockResolvedValue({ success: true, transactionId: 'adj-1' })
    vi.mocked(db.update).mockImplementation(() => makeUpdateChain() as unknown as ReturnType<typeof db.update>)

    const result = await confirmStocktake(STOCKTAKE_ID)

    expect(result.success).toBe(true)

    // adjustStock called twice: once for surplus, once for shortage
    expect(adjustStock).toHaveBeenCalledTimes(2)

    // First call: surplus — add 5 units
    const firstCall = vi.mocked(adjustStock).mock.calls[0][0]
    expect(firstCall.productId).toBe(PRODUCT_A)
    expect(firstCall.adjustmentType).toBe('add')
    expect(firstCall.quantity).toBe(5)
    expect(firstCall.unitCost).toBe(10) // 50/5

    // Second call: shortage — remove 5 units
    const secondCall = vi.mocked(adjustStock).mock.calls[1][0]
    expect(secondCall.productId).toBe(PRODUCT_B)
    expect(secondCall.adjustmentType).toBe('remove')
    expect(secondCall.quantity).toBe(5)

    // Stocktake status updated to confirmed
    // db.update is called: 2 times for adjustmentPosted + 1 time for stocktake status = 3
    expect(db.update).toHaveBeenCalledTimes(3)
  })

  it('blocks if any line has null countedQuantity', async () => {
    mockUser('manager')

    let selectCallCount = 0
    vi.mocked(db.select).mockImplementation(() => {
      selectCallCount++
      if (selectCallCount === 1) {
        return makeChain([{ id: STOCKTAKE_ID, status: 'in_progress' }]) as unknown as ReturnType<typeof db.select>
      }
      return makeChain([
        {
          id: 'line-1',
          productId: PRODUCT_A,
          countedQuantity: '10.00',
          varianceQuantity: '0.00',
          varianceValue: '0.00',
          adjustmentPosted: false,
        },
        {
          id: 'line-2',
          productId: PRODUCT_B,
          countedQuantity: null,
          varianceQuantity: null,
          varianceValue: null,
          adjustmentPosted: false,
        },
      ]) as unknown as ReturnType<typeof db.select>
    })

    const result = await confirmStocktake(STOCKTAKE_ID)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('1 product has not been counted yet')
    }
    expect(adjustStock).not.toHaveBeenCalled()
  })

  it('with zero variances: sets confirmed without adjustments', async () => {
    mockUser('owner')

    let selectCallCount = 0
    vi.mocked(db.select).mockImplementation(() => {
      selectCallCount++
      if (selectCallCount === 1) {
        return makeChain([{ id: STOCKTAKE_ID, status: 'in_progress' }]) as unknown as ReturnType<typeof db.select>
      }
      return makeChain([
        {
          id: 'line-1',
          productId: PRODUCT_A,
          countedQuantity: '50.00',
          varianceQuantity: '0.00',
          varianceValue: '0.00',
          adjustmentPosted: false,
        },
      ]) as unknown as ReturnType<typeof db.select>
    })

    vi.mocked(db.update).mockImplementation(() => makeUpdateChain() as unknown as ReturnType<typeof db.update>)

    const result = await confirmStocktake(STOCKTAKE_ID)

    expect(result.success).toBe(true)
    expect(adjustStock).not.toHaveBeenCalled()
    // Only the stocktake status update
    expect(db.update).toHaveBeenCalledTimes(1)
  })
})

describe('cancelStocktake', () => {
  it('sets status to cancelled', async () => {
    mockUser('owner')

    vi.mocked(db.select).mockImplementation(() => {
      return makeChain([{ id: STOCKTAKE_ID, status: 'in_progress' }]) as unknown as ReturnType<typeof db.select>
    })

    vi.mocked(db.update).mockImplementation(() => makeUpdateChain() as unknown as ReturnType<typeof db.update>)

    const result = await cancelStocktake(STOCKTAKE_ID)

    expect(result.success).toBe(true)
    expect(db.update).toHaveBeenCalled()

    const updateChain = vi.mocked(db.update).mock.results[0].value
    const setCall = updateChain.set.mock.calls[0][0]
    expect(setCall.status).toBe('cancelled')
  })
})

describe('getActiveStocktake', () => {
  it('returns null when no in-progress stocktake exists', async () => {
    mockUser('cashier')

    vi.mocked(db.select).mockImplementation(() => {
      return makeChain([]) as unknown as ReturnType<typeof db.select>
    })

    const result = await getActiveStocktake()

    expect(result).toBeNull()
  })
})
