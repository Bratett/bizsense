import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
  },
}))

import { db } from '@/db'
import { allocatePaymentsToGrns, computePayablesAging } from '../payablesAging'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BUSINESS_ID = 'biz-001'
const SUP_A = 'sup-a'
const GRN_1 = 'grn-001'
const GRN_2 = 'grn-002'
const GRN_3 = 'grn-003'

function makeChain(result: unknown[]) {
  const chain: Record<string, unknown> = {
    then: (f?: ((v: unknown) => unknown) | null, r?: ((e: unknown) => unknown) | null) =>
      Promise.resolve(result).then(f, r),
    catch: (f?: ((e: unknown) => unknown) | null) => Promise.resolve(result).catch(f),
    finally: (f?: (() => void) | null) => Promise.resolve(result).finally(f),
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
  }
  return chain
}

// Build a date string N days ago from today
function daysAgo(n: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().split('T')[0]
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks()
})

// ─── allocatePaymentsToGrns ───────────────────────────────────────────────────

describe('allocatePaymentsToGrns', () => {
  it('6. payment with grnId: applied to that specific GRN', () => {
    const grns = [
      {
        id: GRN_1,
        grnNumber: 'GRN-001',
        receivedDate: '2026-01-01',
        originalAmount: 1000,
        supplierId: SUP_A,
      },
      {
        id: GRN_2,
        grnNumber: 'GRN-002',
        receivedDate: '2026-01-15',
        originalAmount: 500,
        supplierId: SUP_A,
      },
    ]
    const payments = [{ id: 'pay-1', grnId: GRN_2, amount: 200, paymentDate: '2026-01-20' }]

    const result = allocatePaymentsToGrns(grns, payments)

    const g1 = result.find((r) => r.id === GRN_1)!
    const g2 = result.find((r) => r.id === GRN_2)!

    expect(g1.amountPaid).toBe(0) // GRN_1 untouched
    expect(g2.amountPaid).toBe(200) // payment went to specified GRN_2
  })

  it('7. payment without grnId: applied to oldest GRN first (FIFO)', () => {
    const grns = [
      {
        id: GRN_1,
        grnNumber: 'GRN-001',
        receivedDate: '2026-01-01',
        originalAmount: 1000,
        supplierId: SUP_A,
      },
      {
        id: GRN_2,
        grnNumber: 'GRN-002',
        receivedDate: '2026-01-15',
        originalAmount: 500,
        supplierId: SUP_A,
      },
    ]
    const payments = [{ id: 'pay-1', grnId: null, amount: 300, paymentDate: '2026-01-20' }]

    const result = allocatePaymentsToGrns(grns, payments)

    const g1 = result.find((r) => r.id === GRN_1)!
    const g2 = result.find((r) => r.id === GRN_2)!

    expect(g1.amountPaid).toBe(300) // oldest GRN gets payment first
    expect(g2.amountPaid).toBe(0) // newer GRN untouched
  })

  it('8. payment covering multiple GRNs: oldest fully settled first', () => {
    const grns = [
      {
        id: GRN_1,
        grnNumber: 'GRN-001',
        receivedDate: '2026-01-01',
        originalAmount: 400,
        supplierId: SUP_A,
      },
      {
        id: GRN_2,
        grnNumber: 'GRN-002',
        receivedDate: '2026-01-15',
        originalAmount: 600,
        supplierId: SUP_A,
      },
    ]
    const payments = [{ id: 'pay-1', grnId: null, amount: 700, paymentDate: '2026-01-20' }]

    const result = allocatePaymentsToGrns(grns, payments)

    const g1 = result.find((r) => r.id === GRN_1)!
    const g2 = result.find((r) => r.id === GRN_2)!

    expect(g1.amountPaid).toBe(400) // GRN_1 fully settled (400/400)
    expect(g2.amountPaid).toBe(300) // remaining 300 applied to GRN_2
  })
})

// ─── computePayablesAging ─────────────────────────────────────────────────────

describe('computePayablesAging', () => {
  it('9. GRN received today, 0 credit terms: age=0, bucket "current"', async () => {
    const today = new Date().toISOString().split('T')[0]

    vi.mocked(db.select)
      .mockReturnValueOnce(
        makeChain([
          {
            id: GRN_1,
            grnNumber: 'GRN-001',
            receivedDate: today,
            totalCost: '500.00',
            supplierId: SUP_A,
            supplierName: 'Agro Ltd',
            supplierPhone: '+233241234567',
            creditTermsDays: 0,
          },
        ]) as never,
      )
      .mockReturnValueOnce(makeChain([]) as never) // no payments

    const report = await computePayablesAging(BUSINESS_ID)

    expect(report.suppliers).toHaveLength(1)
    const grnRow = report.suppliers[0].grns[0]
    expect(grnRow.ageInDays).toBe(0)
    expect(grnRow.bucket).toBe('current')
  })

  it('10. GRN due 45 days ago: bucket "31-60"', async () => {
    // GRN received 45 days ago, 0 credit terms → due date was 45 days ago → age = 45
    const receivedDate = daysAgo(45)

    vi.mocked(db.select)
      .mockReturnValueOnce(
        makeChain([
          {
            id: GRN_1,
            grnNumber: 'GRN-001',
            receivedDate,
            totalCost: '1000.00',
            supplierId: SUP_A,
            supplierName: 'Agro Ltd',
            supplierPhone: null,
            creditTermsDays: 0,
          },
        ]) as never,
      )
      .mockReturnValueOnce(makeChain([]) as never)

    const report = await computePayablesAging(BUSINESS_ID)

    expect(report.suppliers).toHaveLength(1)
    const grnRow = report.suppliers[0].grns[0]
    expect(grnRow.ageInDays).toBeGreaterThanOrEqual(44) // allow ±1 for timezone
    expect(grnRow.ageInDays).toBeLessThanOrEqual(46)
    expect(grnRow.bucket).toBe('31-60')
  })

  it('11. fully paid GRN: outstanding=0, does not appear in report', async () => {
    const receivedDate = daysAgo(10)

    vi.mocked(db.select)
      .mockReturnValueOnce(
        makeChain([
          {
            id: GRN_1,
            grnNumber: 'GRN-001',
            receivedDate,
            totalCost: '800.00',
            supplierId: SUP_A,
            supplierName: 'Agro Ltd',
            supplierPhone: null,
            creditTermsDays: 0,
          },
        ]) as never,
      )
      .mockReturnValueOnce(
        makeChain([
          {
            id: 'pay-001',
            supplierId: SUP_A,
            grnId: GRN_1,
            amount: '800.00', // fully paid
            paymentDate: daysAgo(5),
          },
        ]) as never,
      )

    const report = await computePayablesAging(BUSINESS_ID)

    // No suppliers with outstanding balances
    expect(report.suppliers).toHaveLength(0)
    expect(report.grandTotals.total).toBe(0)
  })

  it('12. grandTotals match sum of all supplier totals', async () => {
    const receivedDate = daysAgo(10)

    vi.mocked(db.select)
      .mockReturnValueOnce(
        makeChain([
          {
            id: GRN_1,
            grnNumber: 'GRN-001',
            receivedDate,
            totalCost: '400.00',
            supplierId: 'sup-a',
            supplierName: 'Supplier A',
            supplierPhone: null,
            creditTermsDays: 0,
          },
          {
            id: GRN_2,
            grnNumber: 'GRN-002',
            receivedDate,
            totalCost: '600.00',
            supplierId: 'sup-b',
            supplierName: 'Supplier B',
            supplierPhone: null,
            creditTermsDays: 0,
          },
        ]) as never,
      )
      .mockReturnValueOnce(makeChain([]) as never) // no payments

    const report = await computePayablesAging(BUSINESS_ID)

    const sumOfSupplierTotals = report.suppliers.reduce((s, sup) => s + sup.totals.total, 0)
    expect(report.grandTotals.total).toBeCloseTo(sumOfSupplierTotals, 2)
    expect(report.grandTotals.total).toBeCloseTo(1000, 2)
  })
})
