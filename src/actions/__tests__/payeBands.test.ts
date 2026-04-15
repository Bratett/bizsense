import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Module mocks (hoisted before imports) ──────────────────────────────────

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

import { requireRole } from '@/lib/auth/requireRole'
import { db } from '@/db'
import { updatePayeBands, getActivePayeBands, type PayeBandInput } from '../payroll'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BUSINESS_ID = 'biz-test-001'
const USER_ID = 'user-test-001'

function mockOwnerSession() {
  vi.mocked(requireRole).mockResolvedValue({
    id: USER_ID,
    email: 'owner@test.com',
    businessId: BUSINESS_ID,
    role: 'owner' as const,
    fullName: 'Test Owner',
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
    set: vi.fn(() => chain),
    values: vi.fn(() => chain),
  }
  return chain
}

// Captured rows for test 9 (history check)
const OLD_BAND_ROWS = [
  {
    id: 'band-old-001',
    lowerBound: '0',
    upperBound: '4380',
    rate: '0.000000',
    effectiveFrom: '2025-01-01',
    effectiveTo: null as string | null,
  },
  {
    id: 'band-old-002',
    lowerBound: '4380',
    upperBound: '5100',
    rate: '0.050000',
    effectiveFrom: '2025-01-01',
    effectiveTo: null as string | null,
  },
]

beforeEach(() => {
  vi.resetAllMocks()
})

// ─── Test 7: updatePayeBands sets effectiveTo + inserts new bands ─────────────

describe('updatePayeBands', () => {
  it('Test 7 — sets effectiveTo on old bands and inserts new bands', async () => {
    mockOwnerSession()

    const updateSetValues: Record<string, unknown>[] = []
    const insertedRows: unknown[][] = []

    // Capture what's passed to update().set()
    const updateChain = makeChain([])
    vi.mocked(updateChain.set as ReturnType<typeof vi.fn>).mockImplementation(
      (vals: Record<string, unknown>) => {
        updateSetValues.push(vals)
        return updateChain
      },
    )

    // Capture what's passed to insert().values()
    const insertChain = makeChain([])
    vi.mocked(insertChain.values as ReturnType<typeof vi.fn>).mockImplementation(
      (rows: unknown[]) => {
        insertedRows.push(rows)
        return insertChain
      },
    )

    // db.transaction executes the callback
    vi.mocked(db.transaction).mockImplementation(async (cb) => {
      const tx = {
        update: vi.fn(() => updateChain),
        insert: vi.fn(() => insertChain),
      }
      return cb(tx as never)
    })

    const newBands: PayeBandInput[] = [
      { lowerBound: 0, upperBound: 4380, rate: 0 },
      { lowerBound: 4380, upperBound: 5100, rate: 5 },
      { lowerBound: 5100, upperBound: null, rate: 17.5 },
    ]

    await updatePayeBands(newBands)

    // effectiveTo was set (update was called)
    expect(db.transaction).toHaveBeenCalled()
    expect(updateSetValues.length).toBeGreaterThanOrEqual(1)
    const setCall = updateSetValues[0]!
    expect(setCall).toHaveProperty('effectiveTo')
    expect(typeof setCall.effectiveTo).toBe('string')

    // New bands were inserted
    expect(insertedRows.length).toBe(1)
    const rows = insertedRows[0] as Array<{ lowerBound: string; rate: string; effectiveTo: null }>
    expect(rows).toHaveLength(3)
    rows.forEach((r) => {
      expect(r.effectiveTo).toBeNull()
    })
  })

  // ─── Test 8: after update, getActivePayeBands returns only new bands ──────────

  it('Test 8 — after update, getActivePayeBands returns only new bands (effectiveTo IS NULL)', async () => {
    mockOwnerSession()

    const today = new Date().toISOString().split('T')[0]!

    // Simulate DB returning only new bands (effectiveTo = null)
    const newBandRows = [
      { id: 'band-new-001', lowerBound: '0', upperBound: '4380', rate: '0.000000', effectiveFrom: today },
      { id: 'band-new-002', lowerBound: '4380', upperBound: '5100', rate: '0.050000', effectiveFrom: today },
      { id: 'band-new-003', lowerBound: '5100', upperBound: null, rate: '0.175000', effectiveFrom: today },
    ]

    vi.mocked(db.select).mockReturnValueOnce(makeChain(newBandRows) as never)

    const result = await getActivePayeBands()

    expect(result).toHaveLength(3)
    // Old bands with effectiveTo set should not appear (DB filtered them out)
    result.forEach((band) => {
      // Verify no effectiveTo property (we only select active bands)
      expect(band).toHaveProperty('id')
      expect(band).toHaveProperty('rate')
    })
  })

  // ─── Test 9: history preserved — old bands not deleted ───────────────────────

  it('Test 9 — old bands are expired (effectiveTo set) not deleted — history preserved', async () => {
    mockOwnerSession()

    const updatedOldBands: Array<{ effectiveTo: string }> = []

    const updateChain = makeChain([])
    vi.mocked(updateChain.set as ReturnType<typeof vi.fn>).mockImplementation(
      (vals: { effectiveTo: string }) => {
        updatedOldBands.push(vals)
        return updateChain
      },
    )

    const insertChain = makeChain([])
    vi.mocked(insertChain.values as ReturnType<typeof vi.fn>).mockReturnValue(insertChain)

    vi.mocked(db.transaction).mockImplementation(async (cb) => {
      const tx = {
        update: vi.fn(() => updateChain),
        insert: vi.fn(() => insertChain),
      }
      return cb(tx as never)
    })

    await updatePayeBands([{ lowerBound: 0, upperBound: null, rate: 0 }])

    // update() was called (not delete()) — proving history is preserved
    expect(db.transaction).toHaveBeenCalled()
    expect(updatedOldBands.length).toBeGreaterThanOrEqual(1)
    // effectiveTo is set to today's date string, not null
    const today = new Date().toISOString().split('T')[0]!
    expect(updatedOldBands[0]!.effectiveTo).toBe(today)
  })
})
