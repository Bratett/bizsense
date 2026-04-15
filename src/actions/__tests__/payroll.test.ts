import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Module mocks (hoisted before imports) ──────────────────────────────────

vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: vi.fn(),
}))

vi.mock('@/lib/session', () => ({
  getServerSession: vi.fn(),
}))

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
  },
}))

vi.mock('@/lib/atomic', () => ({
  atomicTransactionWrite: vi.fn(),
}))

import { requireRole } from '@/lib/auth/requireRole'
import { db } from '@/db'
import { atomicTransactionWrite } from '@/lib/atomic'
import { initiatePayrollRun, updatePayrollLine, approvePayrollRun } from '../payroll'

// ─── Constants ────────────────────────────────────────────────────────────────

const BUSINESS_ID = 'biz-001'
const USER_ID = 'user-001'
const OTHER_USER_ID = 'user-002'
const RUN_ID = 'run-001'
const LINE_ID = 'line-001'
const STAFF_ID_1 = 'staff-001'
const STAFF_ID_2 = 'staff-002'
const ACCT_6001 = 'acct-6001'
const ACCT_2200 = 'acct-2200'
const ACCT_2300 = 'acct-2300'
const ACCT_2500 = 'acct-2500'

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function mockUser(id = USER_ID) {
  vi.mocked(requireRole).mockResolvedValue({
    id,
    email: 'owner@test.com',
    businessId: BUSINESS_ID,
    role: 'owner',
    fullName: 'Test Owner',
  })
}

/** Drizzle-style chainable query that resolves to `result` */
function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {}
  const promise = Promise.resolve(result)
  chain['then'] = (f?: ((v: unknown) => unknown) | null, r?: ((e: unknown) => unknown) | null) =>
    promise.then(f, r)
  chain['catch'] = (f?: ((e: unknown) => unknown) | null) => promise.catch(f)
  chain['finally'] = (f?: (() => void) | null) => promise.finally(f)
  chain['from'] = vi.fn(() => chain)
  chain['where'] = vi.fn(() => chain)
  chain['limit'] = vi.fn(() => chain)
  chain['orderBy'] = vi.fn(() => chain)
  chain['innerJoin'] = vi.fn(() => chain)
  chain['groupBy'] = vi.fn(() => chain)
  return chain
}

/** Insert chain that captures values and returns id */
function makeInsertChain(returnedId = RUN_ID) {
  let capturedValues: unknown = null
  return {
    values: vi.fn((data: unknown) => {
      capturedValues = data
      const rows = Array.isArray(data) ? data : [data]
      const returnData = rows.map((r: Record<string, unknown>) => ({ id: returnedId, ...r }))
      return {
        returning: vi.fn().mockResolvedValue(returnData),
      }
    }),
    _getCaptured: () => capturedValues,
  }
}

/** Update chain that captures set values */
function makeUpdateChain() {
  let capturedSet: unknown = null
  return {
    set: vi.fn((data: unknown) => {
      capturedSet = data
      return { where: vi.fn().mockResolvedValue([]) }
    }),
    _getCaptured: () => capturedSet,
  }
}

// Active PAYE bands (GRA 2024) — used across multiple tests
const PAYE_BANDS = [
  {
    lowerBound: '0',
    upperBound: '4380',
    rate: '0.000000',
    effectiveFrom: '2024-01-01',
    effectiveTo: null,
    id: 'b1',
    businessId: BUSINESS_ID,
    createdAt: new Date(),
  },
  {
    lowerBound: '4380',
    upperBound: '5100',
    rate: '0.050000',
    effectiveFrom: '2024-01-01',
    effectiveTo: null,
    id: 'b2',
    businessId: BUSINESS_ID,
    createdAt: new Date(),
  },
  {
    lowerBound: '5100',
    upperBound: '6420',
    rate: '0.100000',
    effectiveFrom: '2024-01-01',
    effectiveTo: null,
    id: 'b3',
    businessId: BUSINESS_ID,
    createdAt: new Date(),
  },
  {
    lowerBound: '6420',
    upperBound: '47880',
    rate: '0.175000',
    effectiveFrom: '2024-01-01',
    effectiveTo: null,
    id: 'b4',
    businessId: BUSINESS_ID,
    createdAt: new Date(),
  },
  {
    lowerBound: '47880',
    upperBound: '240000',
    rate: '0.250000',
    effectiveFrom: '2024-01-01',
    effectiveTo: null,
    id: 'b5',
    businessId: BUSINESS_ID,
    createdAt: new Date(),
  },
  {
    lowerBound: '240000',
    upperBound: null,
    rate: '0.300000',
    effectiveFrom: '2024-01-01',
    effectiveTo: null,
    id: 'b6',
    businessId: BUSINESS_ID,
    createdAt: new Date(),
  },
]

// Sample active staff (monthly, GHS 2,000 / month)
const ACTIVE_STAFF = [
  {
    id: STAFF_ID_1,
    businessId: BUSINESS_ID,
    fullName: 'Ama Asante',
    baseSalary: '2000',
    salaryType: 'monthly',
    isActive: true,
    phone: null,
    roleTitle: null,
    ssnitNumber: null,
    tin: null,
    bankName: null,
    bankAccount: null,
    momoNumber: null,
    startDate: null,
    userId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: STAFF_ID_2,
    businessId: BUSINESS_ID,
    fullName: 'Kwame Mensah',
    baseSalary: '2000',
    salaryType: 'monthly',
    isActive: true,
    phone: null,
    roleTitle: null,
    ssnitNumber: null,
    tin: null,
    bankName: null,
    bankAccount: null,
    momoNumber: null,
    startDate: null,
    userId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── initiatePayrollRun ───────────────────────────────────────────────────────

describe('initiatePayrollRun', () => {
  it('1. creates run with status=draft and lines for all active staff', async () => {
    mockUser()

    let callCount = 0
    vi.mocked(db.select).mockImplementation(() => {
      callCount++
      // Call 1: duplicate-period check → empty
      if (callCount === 1) return makeChain([]) as never
      // Call 2: active staff
      if (callCount === 2) return makeChain(ACTIVE_STAFF) as never
      // Call 3: PAYE bands
      return makeChain(PAYE_BANDS) as never
    })

    let capturedRunValues: unknown = null
    let capturedLineValues: unknown = null

    vi.mocked(db.transaction).mockImplementation(async (fn) => {
      const tx = {
        insert: vi.fn((table: unknown) => {
          const isLineTable = table === undefined // we can't easily check table identity, check by call order
          return {
            values: vi.fn((data: unknown) => {
              if (!capturedRunValues) {
                capturedRunValues = data
                return { returning: vi.fn().mockResolvedValue([{ id: RUN_ID }]) }
              } else {
                capturedLineValues = data
                return { returning: vi.fn().mockResolvedValue([]) }
              }
            }),
          }
        }),
      }
      return fn(tx as never)
    })

    const result = await initiatePayrollRun({
      periodStart: '2026-04-01',
      periodEnd: '2026-04-30',
    })

    expect(result.runId).toBe(RUN_ID)

    const run = capturedRunValues as Record<string, unknown>
    expect(run.status).toBe('draft')
    expect(run.businessId).toBe(BUSINESS_ID)
    expect(run.createdBy).toBe(USER_ID)
    expect(run.periodStart).toBe('2026-04-01')

    const lines = capturedLineValues as Array<Record<string, unknown>>
    expect(lines).toHaveLength(2)
    expect(lines[0].staffId).toBe(STAFF_ID_1)
    expect(lines[1].staffId).toBe(STAFF_ID_2)
    expect(lines[0].payrollRunId).toBe(RUN_ID)
  })

  it('2. throws when no active staff exist', async () => {
    mockUser()

    let callCount = 0
    vi.mocked(db.select).mockImplementation(() => {
      callCount++
      if (callCount === 1) return makeChain([]) as never // no existing run
      return makeChain([]) as never // no active staff
    })

    await expect(
      initiatePayrollRun({ periodStart: '2026-04-01', periodEnd: '2026-04-30' }),
    ).rejects.toThrow('No active staff members found.')
  })

  it('3. throws when a run already exists for this period', async () => {
    mockUser()

    vi.mocked(db.select).mockReturnValue(makeChain([{ id: 'existing-run' }]) as never)

    await expect(
      initiatePayrollRun({ periodStart: '2026-04-01', periodEnd: '2026-04-30' }),
    ).rejects.toThrow('A payroll run already exists for this period.')
  })
})

// ─── updatePayrollLine ────────────────────────────────────────────────────────

describe('updatePayrollLine', () => {
  it('4. recomputes netSalary correctly after bonus (negative otherDeductions)', async () => {
    mockUser()

    // Line+run lookup
    vi.mocked(db.select).mockReturnValue(
      makeChain([
        {
          lineId: LINE_ID,
          runId: RUN_ID,
          grossSalary: '2000',
          currentOtherDeductions: '0',
        },
      ]) as never,
    )

    // PAYE bands for recompute
    vi.mocked(db.select)
      .mockReturnValueOnce(
        makeChain([
          { lineId: LINE_ID, runId: RUN_ID, grossSalary: '2000', currentOtherDeductions: '0' },
        ]) as never,
      )
      .mockReturnValueOnce(makeChain(PAYE_BANDS) as never)

    let capturedLineSet: unknown = null
    vi.mocked(db.transaction).mockImplementation(async (fn) => {
      const tx = {
        update: vi.fn(() => ({
          set: vi.fn((data: unknown) => {
            if (!capturedLineSet) capturedLineSet = data
            return { where: vi.fn().mockResolvedValue([]) }
          }),
        })),
        select: vi.fn(() =>
          makeChain([
            { grossSalary: '2000', ssnitEmployee: '110.00', payeTax: '0.00', netSalary: '1990.00' },
          ]),
        ),
      }
      return fn(tx as never)
    })

    // otherDeductions = -200 means a bonus of GHS 200 (reduces deductions, increases net)
    await updatePayrollLine(LINE_ID, { otherDeductions: -200 })

    const setData = capturedLineSet as Record<string, unknown>
    expect(setData.otherDeductions).toBe('-200')
    // netSalary = gross - ssnitEmployee - paye - otherDeductions
    // gross=2000, ssnit=110, paye≈270.38 (2000/mo hits 17.5% band), other=-200
    // net = 2000 - 110 - 270.38 - (-200) = 1819.62
    expect(Number(setData.netSalary)).toBeCloseTo(1819.62, 1)
  })

  it('5. throws when run is not in draft status', async () => {
    mockUser()

    // Line+run lookup returns empty (no draft run found)
    vi.mocked(db.select).mockReturnValue(makeChain([]) as never)

    await expect(updatePayrollLine(LINE_ID, { otherDeductions: 100 })).rejects.toThrow(
      'Payroll line not found or run is not in draft status.',
    )
  })
})

// ─── approvePayrollRun ────────────────────────────────────────────────────────

describe('approvePayrollRun', () => {
  // Two staff @ GHS 2,000: verify the full debit/credit chain
  const DRAFT_RUN = {
    id: RUN_ID,
    businessId: BUSINESS_ID,
    periodStart: '2026-04-01',
    periodEnd: '2026-04-30',
    status: 'draft',
    createdBy: OTHER_USER_ID, // different user → no segregation issue
    totalGross: '4000',
    totalDeductions: '220',
    totalNet: '3670',
    journalEntryId: null,
    approvedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  // Lines for two staff @ GHS 2,000
  // ssnit_employee = 110, ssnit_employer = 260, paye = 0 (below first taxable band annualised)
  // Actually let me compute: gross 2000/mo → annual 24000. Bands: 0-4380@0%, 4380-5100@5%, 5100-6420@10%, 6420-47880@17.5%
  // Annual paye: (5100-4380)*0.05 + (6420-5100)*0.10 + (24000-6420)*0.175 = 36 + 132 + 3076.5 = 3244.5 / 12 = 270.38
  // ssnit_employee = 2000 * 0.055 = 110
  // ssnit_employer = 2000 * 0.13 = 260
  // net = 2000 - 110 - 270.38 - 0 = 1619.62
  // totalCostToEmployer = (2000 - 0) + 260 = 2260
  const LINES = [
    {
      id: 'line-001',
      payrollRunId: RUN_ID,
      staffId: STAFF_ID_1,
      grossSalary: '2000',
      ssnitEmployee: '110.00',
      ssnitEmployer: '260.00',
      payeTax: '270.38',
      otherDeductions: '0',
      netSalary: '1619.62',
      paymentMethod: null,
      isPaid: false,
      paidAt: null,
      paymentJournalEntryId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'line-002',
      payrollRunId: RUN_ID,
      staffId: STAFF_ID_2,
      grossSalary: '2000',
      ssnitEmployee: '110.00',
      ssnitEmployer: '260.00',
      payeTax: '270.38',
      otherDeductions: '0',
      netSalary: '1619.62',
      paymentMethod: null,
      isPaid: false,
      paidAt: null,
      paymentJournalEntryId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]

  const ACCOUNT_ROWS = [
    { id: ACCT_6001, code: '6001' },
    { id: ACCT_2200, code: '2200' },
    { id: ACCT_2300, code: '2300' },
    { id: ACCT_2500, code: '2500' },
  ]

  it('6. posts balanced journal entry and sets status=approved', async () => {
    // Approver is USER_ID; DRAFT_RUN.createdBy is OTHER_USER_ID → different users, no segregation block
    mockUser(USER_ID)

    let selectCall = 0
    vi.mocked(db.select).mockImplementation(() => {
      selectCall++
      if (selectCall === 1) return makeChain([DRAFT_RUN]) as never // fetch run
      if (selectCall === 2) return makeChain(LINES) as never // fetch lines
      return makeChain(ACCOUNT_ROWS) as never // fetch accounts
    })

    let capturedJournalInput: unknown = null
    let capturedUpdateSet: unknown = null

    vi.mocked(atomicTransactionWrite).mockImplementation(async (journalInput, callback) => {
      capturedJournalInput = journalInput
      const tx = {
        update: vi.fn(() => ({
          set: vi.fn((data: unknown) => {
            capturedUpdateSet = data
            return { where: vi.fn().mockResolvedValue([]) }
          }),
        })),
      }
      await callback(tx as never, 'je-001')
    })

    const result = await approvePayrollRun(RUN_ID)

    expect(result.isSingleUser).toBe(false)

    // Verify the journal input was passed to atomicTransactionWrite
    const ji = capturedJournalInput as Record<string, unknown>
    expect(ji.sourceType).toBe('payroll')
    expect(ji.sourceId).toBe(RUN_ID)

    const jiLines = ji.lines as Array<Record<string, unknown>>
    expect(jiLines).toHaveLength(4)

    const debitLine = jiLines.find((l) => Number(l.debitAmount) > 0)
    const creditLines = jiLines.filter((l) => Number(l.creditAmount) > 0)
    expect(debitLine).toBeDefined()
    expect(creditLines).toHaveLength(3)

    // Verify balance: debits = credits (2-cent tolerance)
    const totalDebits = jiLines.reduce((s, l) => s + Number(l.debitAmount), 0)
    const totalCredits = jiLines.reduce((s, l) => s + Number(l.creditAmount), 0)
    expect(Math.abs(totalDebits - totalCredits)).toBeLessThan(0.02)

    // Verify status update
    const update = capturedUpdateSet as Record<string, unknown>
    expect(update.status).toBe('approved')
    expect(update.journalEntryId).toBe('je-001')
    expect(update.approvedBy).toBe(USER_ID)
  })

  it('7. throws when run is not in draft status', async () => {
    mockUser()

    vi.mocked(db.select).mockReturnValue(makeChain([]) as never)

    await expect(approvePayrollRun(RUN_ID)).rejects.toThrow(
      'Payroll run not found or not in draft status.',
    )
  })

  it('8. throws segregation error when creator approves in multi-user business', async () => {
    // User ID matches run.createdBy → triggers segregation check
    mockUser(USER_ID)

    let selectCall = 0
    vi.mocked(db.select).mockImplementation(() => {
      selectCall++
      if (selectCall === 1) {
        // Fetch run — createdBy = USER_ID (same as approver)
        return makeChain([{ ...DRAFT_RUN, createdBy: USER_ID }]) as never
      }
      // Count users → 2 (multi-user)
      return makeChain([{ userCount: 2 }]) as never
    })

    await expect(approvePayrollRun(RUN_ID)).rejects.toThrow(
      'You cannot approve a payroll run you created.',
    )
  })

  it('9. allows self-approval in a single-user business (returns isSingleUser=true)', async () => {
    mockUser(USER_ID)

    let selectCall = 0
    vi.mocked(db.select).mockImplementation(() => {
      selectCall++
      if (selectCall === 1) return makeChain([{ ...DRAFT_RUN, createdBy: USER_ID }]) as never
      if (selectCall === 2) return makeChain([{ userCount: 1 }]) as never // single user
      if (selectCall === 3) return makeChain(LINES) as never
      return makeChain(ACCOUNT_ROWS) as never
    })

    vi.mocked(atomicTransactionWrite).mockImplementation(async (_ji, callback) => {
      const tx = {
        update: vi.fn(() => ({
          set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
        })),
      }
      await callback(tx as never, 'je-002')
    })

    const result = await approvePayrollRun(RUN_ID)

    expect(result.isSingleUser).toBe(true)
  })

  it('10. atomicity: journal failure keeps payrollRun status as draft', async () => {
    // Approver is USER_ID; creator is OTHER_USER_ID → no segregation check
    mockUser(USER_ID)

    let selectCall = 0
    vi.mocked(db.select).mockImplementation(() => {
      selectCall++
      if (selectCall === 1) return makeChain([DRAFT_RUN]) as never
      if (selectCall === 2) return makeChain(LINES) as never
      return makeChain(ACCOUNT_ROWS) as never
    })

    // atomicTransactionWrite throws → simulates journal insert failure
    vi.mocked(atomicTransactionWrite).mockRejectedValue(new Error('Journal entry insert failed'))

    await expect(approvePayrollRun(RUN_ID)).rejects.toThrow('Journal entry insert failed')

    // db.update must NOT have been called directly — status stays draft
    expect(db.update).not.toHaveBeenCalled()
  })
})
