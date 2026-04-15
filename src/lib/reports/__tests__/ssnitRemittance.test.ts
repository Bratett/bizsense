import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Hoisted mock handles ─────────────────────────────────────────────────────

const { mockWhere, mockInnerJoin, mockFrom, mockSelect } = vi.hoisted(() => {
  const mockWhere = vi.fn()
  const mockInnerJoin = vi.fn(() => ({ where: mockWhere }))
  const mockFrom = vi.fn(() => ({ innerJoin: mockInnerJoin, where: mockWhere }))
  const mockSelect = vi.fn(() => ({ from: mockFrom }))
  return { mockWhere, mockInnerJoin, mockFrom, mockSelect }
})

vi.mock('@/db', () => ({
  db: { select: mockSelect },
}))

vi.mock('@/db/schema', () => ({
  payrollRuns: {},
  payrollLines: {},
  staff: {},
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  eq: vi.fn(),
}))

import { getSsnitRemittanceReport } from '../ssnitRemittance'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BIZ_ID = 'biz-1'
const RUN_ID = 'run-1'

const PAYROLL_RUN = {
  id: RUN_ID,
  businessId: BIZ_ID,
  periodStart: '2026-04-01',
  periodEnd: '2026-04-30',
  status: 'approved',
}

// Two staff members
const LINE_1 = {
  staffId: 'staff-1',
  staffName: 'Ama Owusu',
  ssnitNumber: 'SSNIT-001',
  grossSalary: '3000.00',
  ssnitEmployee: '165.00', // 3000 × 5.5%
  ssnitEmployer: '390.00', // 3000 × 13%
}

const LINE_2 = {
  staffId: 'staff-2',
  staffName: 'Kofi Mensah',
  ssnitNumber: null,
  grossSalary: '2000.00',
  ssnitEmployee: '110.00', // 2000 × 5.5%
  ssnitEmployer: '260.00', // 2000 × 13%
}

// ─── Helper: reset chain implementations ─────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockWhere.mockImplementation(() => ({ orderBy: vi.fn(), groupBy: vi.fn() }))
  mockInnerJoin.mockImplementation(() => ({ where: mockWhere }))
  mockFrom.mockImplementation(() => ({ innerJoin: mockInnerJoin, where: mockWhere }))
  mockSelect.mockImplementation(() => ({ from: mockFrom }))
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getSsnitRemittanceReport', () => {
  it('Test 1 — totalRemittable equals sum of all ssnitEmployee + ssnitEmployer', async () => {
    // Call 1: payrollRuns lookup
    mockWhere.mockResolvedValueOnce([PAYROLL_RUN] as never)
    // Call 2: payrollLines + staff join
    mockWhere.mockResolvedValueOnce([LINE_1, LINE_2] as never)

    const report = await getSsnitRemittanceReport(BIZ_ID, RUN_ID)

    // LINE_1: 165 + 390 = 555; LINE_2: 110 + 260 = 370; total = 925
    expect(report.totalRemittable).toBe(925)
    expect(report.totalEmployee).toBe(275) // 165 + 110
    expect(report.totalEmployer).toBe(650) // 390 + 260
  })

  it('Test 2 — dueDate is 15th of month after periodEnd (Apr 30 → May 15)', async () => {
    mockWhere.mockResolvedValueOnce([PAYROLL_RUN] as never)
    mockWhere.mockResolvedValueOnce([LINE_1, LINE_2] as never)

    const report = await getSsnitRemittanceReport(BIZ_ID, RUN_ID)

    expect(report.dueDate).toBe('2026-05-15')
  })

  it('Test 3 — wrong businessId throws "Payroll run not found."', async () => {
    // Lookup returns empty array — no matching run for this businessId
    mockWhere.mockResolvedValueOnce([] as never)

    await expect(getSsnitRemittanceReport('wrong-biz', RUN_ID)).rejects.toThrow(
      'Payroll run not found.',
    )
  })

  it('Test 4 — draft status run returns data without throwing', async () => {
    const draftRun = { ...PAYROLL_RUN, status: 'draft' }
    mockWhere.mockResolvedValueOnce([draftRun] as never)
    mockWhere.mockResolvedValueOnce([LINE_1] as never)

    const report = await getSsnitRemittanceReport(BIZ_ID, RUN_ID)

    expect(report.lines).toHaveLength(1)
    expect(report.lines[0].staffName).toBe('Ama Owusu')
  })

  it('Test 4b — paid status run also returns data without throwing', async () => {
    const paidRun = { ...PAYROLL_RUN, status: 'paid' }
    mockWhere.mockResolvedValueOnce([paidRun] as never)
    mockWhere.mockResolvedValueOnce([LINE_1, LINE_2] as never)

    const report = await getSsnitRemittanceReport(BIZ_ID, RUN_ID)

    expect(report.lines).toHaveLength(2)
  })

  it('Test 5 — period start/end and payrollRunId are passed through correctly', async () => {
    mockWhere.mockResolvedValueOnce([PAYROLL_RUN] as never)
    mockWhere.mockResolvedValueOnce([LINE_1] as never)

    const report = await getSsnitRemittanceReport(BIZ_ID, RUN_ID)

    expect(report.period.start).toBe('2026-04-01')
    expect(report.period.end).toBe('2026-04-30')
    expect(report.payrollRunId).toBe(RUN_ID)
  })

  it('Test 6 — totalSsnit per line = ssnitEmployee + ssnitEmployer', async () => {
    mockWhere.mockResolvedValueOnce([PAYROLL_RUN] as never)
    mockWhere.mockResolvedValueOnce([LINE_1, LINE_2] as never)

    const report = await getSsnitRemittanceReport(BIZ_ID, RUN_ID)

    expect(report.lines[0].totalSsnit).toBe(555) // 165 + 390
    expect(report.lines[1].totalSsnit).toBe(370) // 110 + 260
  })
})
