import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Module mocks ───────────────────────────────────────────────────────────

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
  },
}))

vi.mock('@/lib/inventory/queries', () => ({
  getProductTransactions: vi.fn(),
}))

vi.mock('@/lib/inventory/fifo', () => ({
  computeFifoInventoryValue: vi.fn(),
}))

import { db } from '@/db'
import { getProductTransactions } from '@/lib/inventory/queries'
import { computeFifoInventoryValue } from '@/lib/inventory/fifo'
import { computeInventoryValuation } from '../valuation'

// ─── Constants ──────────────────────────────────────────────────────────────

const BUSINESS_ID = 'biz-test-001'

// ─── Helpers ────────────────────────────────────────────────────────────────

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
    groupBy: vi.fn(() => chain),
  }
  return chain
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('computeInventoryValuation', () => {
  it('grandTotalValue matches sum of line totalValues', async () => {
    let selectCallCount = 0
    vi.mocked(db.select).mockImplementation(() => {
      selectCallCount++
      if (selectCallCount === 1) {
        // Fetch products
        return makeChain([
          {
            id: 'p1',
            name: 'Widget A',
            sku: 'WDG-001',
            category: 'Parts',
            unit: 'pcs',
            reorderLevel: 10,
          },
          {
            id: 'p2',
            name: 'Widget B',
            sku: 'WDG-002',
            category: 'Parts',
            unit: 'pcs',
            reorderLevel: 5,
          },
          {
            id: 'p3',
            name: 'Widget C',
            sku: 'WDG-003',
            category: 'Tools',
            unit: 'pcs',
            reorderLevel: 0,
          },
        ]) as unknown as ReturnType<typeof db.select>
      }
      // GL balance query
      return makeChain([{ balance: '1650.00' }]) as unknown as ReturnType<typeof db.select>
    })

    vi.mocked(getProductTransactions)
      .mockResolvedValueOnce([]) // p1
      .mockResolvedValueOnce([]) // p2
      .mockResolvedValueOnce([]) // p3

    vi.mocked(computeFifoInventoryValue)
      .mockReturnValueOnce({ totalValue: 500, totalQuantity: 50, remainingLayers: [] }) // p1
      .mockReturnValueOnce({ totalValue: 150, totalQuantity: 30, remainingLayers: [] }) // p2
      .mockReturnValueOnce({ totalValue: 1000, totalQuantity: 100, remainingLayers: [] }) // p3

    const report = await computeInventoryValuation(BUSINESS_ID)

    expect(report.lines).toHaveLength(3)
    expect(report.lines[0].totalValue).toBe(500)
    expect(report.lines[1].totalValue).toBe(150)
    expect(report.lines[2].totalValue).toBe(1000)

    const sumOfLines = report.lines.reduce((s, l) => s + l.totalValue, 0)
    expect(report.grandTotalValue).toBe(sumOfLines)
    expect(report.grandTotalValue).toBe(1650)

    // fifoUnitCost checks
    expect(report.lines[0].fifoUnitCost).toBe(10) // 500/50
    expect(report.lines[1].fifoUnitCost).toBe(5) // 150/30
    expect(report.lines[2].fifoUnitCost).toBe(10) // 1000/100
  })

  it('product with zero stock: totalValue = 0, fifoUnitCost = 0', async () => {
    let selectCallCount = 0
    vi.mocked(db.select).mockImplementation(() => {
      selectCallCount++
      if (selectCallCount === 1) {
        return makeChain([
          {
            id: 'p1',
            name: 'Empty Widget',
            sku: 'EMP-001',
            category: null,
            unit: 'pcs',
            reorderLevel: 5,
          },
        ]) as unknown as ReturnType<typeof db.select>
      }
      return makeChain([{ balance: '0' }]) as unknown as ReturnType<typeof db.select>
    })

    vi.mocked(getProductTransactions).mockResolvedValue([])
    vi.mocked(computeFifoInventoryValue).mockReturnValue({
      totalValue: 0,
      totalQuantity: 0,
      remainingLayers: [],
    })

    const report = await computeInventoryValuation(BUSINESS_ID)

    expect(report.lines).toHaveLength(1)
    expect(report.lines[0].currentQuantity).toBe(0)
    expect(report.lines[0].totalValue).toBe(0)
    expect(report.lines[0].fifoUnitCost).toBe(0)
    expect(report.grandTotalValue).toBe(0)
  })

  it('grandTotalValue matches account 1200 balance (reconciled)', async () => {
    let selectCallCount = 0
    vi.mocked(db.select).mockImplementation(() => {
      selectCallCount++
      if (selectCallCount === 1) {
        return makeChain([
          {
            id: 'p1',
            name: 'Widget',
            sku: 'W-001',
            category: 'Parts',
            unit: 'pcs',
            reorderLevel: 0,
          },
        ]) as unknown as ReturnType<typeof db.select>
      }
      // GL balance = 750 which matches the FIFO value
      return makeChain([{ balance: '750.00' }]) as unknown as ReturnType<typeof db.select>
    })

    vi.mocked(getProductTransactions).mockResolvedValue([])
    vi.mocked(computeFifoInventoryValue).mockReturnValue({
      totalValue: 750,
      totalQuantity: 50,
      remainingLayers: [],
    })

    const report = await computeInventoryValuation(BUSINESS_ID)

    expect(report.grandTotalValue).toBe(750)
    expect(report.glAccountBalance).toBe(750)
    expect(report.isReconciled).toBe(true)
    expect(report.discrepancy).toBe(0)
  })
})
