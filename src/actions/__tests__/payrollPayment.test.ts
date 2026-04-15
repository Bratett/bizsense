import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Module mocks (hoisted before imports) ───────────────────────────────────

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
import { recordPayrollPayment, recordBatchPayrollPayment } from '../payroll'

// ─── Constants ────────────────────────────────────────────────────────────────

const BUSINESS_ID = 'biz-001'
const USER_ID = 'user-001'
const RUN_ID = 'run-001'
const LINE_ID_1 = 'line-001'
const LINE_ID_2 = 'line-002'
const STAFF_ID = 'staff-001'
const ACCT_2500 = 'acct-2500'
const ACCT_1001 = 'acct-1001' // cash
const JE_ID = 'je-001'

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function mockUser() {
  vi.mocked(requireRole).mockResolvedValue({
    id: USER_ID,
    email: 'owner@test.com',
    businessId: BUSINESS_ID,
    role: 'owner',
    fullName: 'Test Owner',
  })
}

/** Drizzle-style chainable select that resolves to `result` */
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

function makeUpdateChain() {
  return {
    set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
  }
}

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const APPROVED_LINE = {
  lineId: LINE_ID_1,
  netSalary: '1619.62',
  staffId: STAFF_ID,
  runId: RUN_ID,
  periodStart: '2026-04-01',
}

const ACCOUNT_CASH = { id: ACCT_1001, code: '1001' }
const ACCOUNT_2500 = { id: ACCT_2500, code: '2500' }
const STAFF_ROW = { fullName: 'Ama Asante' }

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── recordPayrollPayment ────────────────────────────────────────────────────

describe('recordPayrollPayment', () => {
  it('1. posts Dr Net Salaries Payable / Cr Cash — balanced journal entry', async () => {
    mockUser()

    let selectCall = 0
    vi.mocked(db.select).mockImplementation(() => {
      selectCall++
      if (selectCall === 1) return makeChain([APPROVED_LINE]) as never // line+run lookup
      if (selectCall === 2) return makeChain([ACCOUNT_CASH]) as never // fetchAccountByCode payAcct
      if (selectCall === 3) return makeChain([ACCOUNT_2500]) as never // fetchAccountByCode 2500
      if (selectCall === 4) return makeChain([STAFF_ROW]) as never // staff name
      return makeChain([{ cnt: 1 }]) as never // unpaid count
    })

    let capturedJournalInput: unknown = null

    vi.mocked(atomicTransactionWrite).mockImplementation(async (journalInput, callback) => {
      capturedJournalInput = journalInput
      const tx = {
        update: vi.fn(() => makeUpdateChain()),
      }
      await callback(tx as never, JE_ID)
    })

    await recordPayrollPayment({
      payrollLineId: LINE_ID_1,
      paymentMethod: 'cash',
      paymentDate: '2026-04-30',
    })

    const ji = capturedJournalInput as Record<string, unknown>
    expect(ji.sourceType).toBe('payment')
    expect(ji.sourceId).toBe(LINE_ID_1)

    const jiLines = ji.lines as Array<Record<string, unknown>>
    expect(jiLines).toHaveLength(2)

    const debitLine = jiLines.find((l) => Number(l.debitAmount) > 0)
    const creditLine = jiLines.find((l) => Number(l.creditAmount) > 0)

    expect(debitLine).toBeDefined()
    expect(creditLine).toBeDefined()

    // Dr 2500
    expect(debitLine!.accountId).toBe(ACCT_2500)
    expect(Number(debitLine!.debitAmount)).toBeCloseTo(1619.62, 2)
    expect(Number(debitLine!.creditAmount)).toBe(0)

    // Cr cash (1001)
    expect(creditLine!.accountId).toBe(ACCT_1001)
    expect(Number(creditLine!.creditAmount)).toBeCloseTo(1619.62, 2)
    expect(Number(creditLine!.debitAmount)).toBe(0)

    // Journal must be balanced
    const totalDr = jiLines.reduce((s, l) => s + Number(l.debitAmount), 0)
    const totalCr = jiLines.reduce((s, l) => s + Number(l.creditAmount), 0)
    expect(Math.abs(totalDr - totalCr)).toBeLessThan(0.01)
  })

  it('2. updates payrollLine.isPaid = true and paidAt is set', async () => {
    mockUser()

    let selectCall = 0
    vi.mocked(db.select).mockImplementation(() => {
      selectCall++
      if (selectCall === 1) return makeChain([APPROVED_LINE]) as never
      if (selectCall === 2) return makeChain([ACCOUNT_CASH]) as never
      if (selectCall === 3) return makeChain([ACCOUNT_2500]) as never
      if (selectCall === 4) return makeChain([STAFF_ROW]) as never
      return makeChain([{ cnt: 0 }]) as never
    })

    let capturedLineUpdate: unknown = null

    vi.mocked(atomicTransactionWrite).mockImplementation(async (_ji, callback) => {
      const tx = {
        update: vi.fn(() => ({
          set: vi.fn((data: unknown) => {
            capturedLineUpdate = data
            return { where: vi.fn().mockResolvedValue([]) }
          }),
        })),
      }
      await callback(tx as never, JE_ID)
    })

    vi.mocked(db.update).mockReturnValue(makeUpdateChain() as never)

    await recordPayrollPayment({
      payrollLineId: LINE_ID_1,
      paymentMethod: 'cash',
      paymentDate: '2026-04-30',
      reference: 'CASH-001',
    })

    const update = capturedLineUpdate as Record<string, unknown>
    expect(update.isPaid).toBe(true)
    expect(update.paidAt).toBeInstanceOf(Date)
    expect(update.paymentMethod).toBe('cash')
    expect(update.paymentReference).toBe('CASH-001')
    expect(update.paymentJournalEntryId).toBe(JE_ID)
  })

  it('3. throws when line is already paid (isPaid = true)', async () => {
    mockUser()

    // Line+run lookup returns empty — query filters isPaid=false, so already-paid returns []
    vi.mocked(db.select).mockReturnValue(makeChain([]) as never)

    await expect(
      recordPayrollPayment({
        payrollLineId: LINE_ID_1,
        paymentMethod: 'cash',
        paymentDate: '2026-04-30',
      }),
    ).rejects.toThrow('Payroll line not found, run not approved, or already paid.')
  })

  it('4. throws when run is not in approved status', async () => {
    mockUser()

    // Same: query requires run.status='approved' — if draft or paid, returns []
    vi.mocked(db.select).mockReturnValue(makeChain([]) as never)

    await expect(
      recordPayrollPayment({
        payrollLineId: LINE_ID_1,
        paymentMethod: 'mtn_momo',
        paymentDate: '2026-04-30',
      }),
    ).rejects.toThrow('Payroll line not found, run not approved, or already paid.')
  })

  it('5. atomic: journal failure leaves payrollLine.isPaid unchanged', async () => {
    mockUser()

    let selectCall = 0
    vi.mocked(db.select).mockImplementation(() => {
      selectCall++
      if (selectCall === 1) return makeChain([APPROVED_LINE]) as never
      if (selectCall === 2) return makeChain([ACCOUNT_CASH]) as never
      if (selectCall === 3) return makeChain([ACCOUNT_2500]) as never
      return makeChain([STAFF_ROW]) as never
    })

    // atomicTransactionWrite throws — simulates journal insert failure
    vi.mocked(atomicTransactionWrite).mockRejectedValue(new Error('DB insert failed'))

    await expect(
      recordPayrollPayment({
        payrollLineId: LINE_ID_1,
        paymentMethod: 'cash',
        paymentDate: '2026-04-30',
      }),
    ).rejects.toThrow('DB insert failed')

    // db.update must NOT have been called directly (the line update lives inside atomicTransactionWrite callback)
    expect(db.update).not.toHaveBeenCalled()
  })
})

// ─── recordBatchPayrollPayment ────────────────────────────────────────────────

describe('recordBatchPayrollPayment', () => {
  it('6. pays all unpaid lines and returns { paid: N, skipped: 0 }', async () => {
    mockUser()

    // Batch fetch returns two unpaid lines
    vi.mocked(db.select).mockReturnValue(makeChain([{ id: LINE_ID_1 }, { id: LINE_ID_2 }]) as never)

    // recordPayrollPayment is called internally — mock db responses for each call
    // Since we're calling the real recordPayrollPayment, we need to set up full mocks.
    // Simpler: spy on recordPayrollPayment via atomicTransactionWrite mock.

    let paidCount = 0
    vi.mocked(atomicTransactionWrite).mockImplementation(async (_ji, callback) => {
      paidCount++
      const tx = {
        update: vi.fn(() => makeUpdateChain()),
      }
      await callback(tx as never, `je-00${paidCount}`)
    })

    // For each recordPayrollPayment call within the batch, db.select will be
    // called for: line+run, payAcct, 2500, staff, unpaid count
    const innerSelectCall = 0
    const mockLineData = [
      { ...APPROVED_LINE, lineId: LINE_ID_1 },
      { ...APPROVED_LINE, lineId: LINE_ID_2 },
    ]
    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain([{ id: LINE_ID_1 }, { id: LINE_ID_2 }]) as never) // batch fetch
      // line 1 payment: line+run, payAcct, 2500, staff, unpaid-count
      .mockReturnValueOnce(makeChain([mockLineData[0]]) as never)
      .mockReturnValueOnce(makeChain([ACCOUNT_CASH]) as never)
      .mockReturnValueOnce(makeChain([ACCOUNT_2500]) as never)
      .mockReturnValueOnce(makeChain([STAFF_ROW]) as never)
      .mockReturnValueOnce(makeChain([{ cnt: 1 }]) as never) // still 1 unpaid after line 1
      // line 2 payment: line+run, payAcct, 2500, staff, unpaid-count
      .mockReturnValueOnce(makeChain([mockLineData[1]]) as never)
      .mockReturnValueOnce(makeChain([ACCOUNT_CASH]) as never)
      .mockReturnValueOnce(makeChain([ACCOUNT_2500]) as never)
      .mockReturnValueOnce(makeChain([STAFF_ROW]) as never)
      .mockReturnValueOnce(makeChain([{ cnt: 0 }]) as never) // 0 unpaid after line 2

    vi.mocked(db.update).mockReturnValue(makeUpdateChain() as never)

    const result = await recordBatchPayrollPayment({
      payrollRunId: RUN_ID,
      paymentMethod: 'cash',
      paymentDate: '2026-04-30',
    })

    expect(result.paid).toBe(2)
    expect(result.skipped).toBe(0)
  })

  it('7. after all lines paid, payrollRuns.status is set to paid', async () => {
    mockUser()

    // Batch fetch: one unpaid line
    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain([{ id: LINE_ID_1 }]) as never) // batch fetch
      .mockReturnValueOnce(makeChain([APPROVED_LINE]) as never) // line+run
      .mockReturnValueOnce(makeChain([ACCOUNT_CASH]) as never) // payAcct
      .mockReturnValueOnce(makeChain([ACCOUNT_2500]) as never) // 2500
      .mockReturnValueOnce(makeChain([STAFF_ROW]) as never) // staff
      .mockReturnValueOnce(makeChain([{ cnt: 0 }]) as never) // unpaid count = 0

    vi.mocked(atomicTransactionWrite).mockImplementation(async (_ji, callback) => {
      const tx = { update: vi.fn(() => makeUpdateChain()) }
      await callback(tx as never, JE_ID)
    })

    let capturedRunUpdate: unknown = null
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn((data: unknown) => {
        capturedRunUpdate = data
        return { where: vi.fn().mockResolvedValue([]) }
      }),
    } as never)

    await recordBatchPayrollPayment({
      payrollRunId: RUN_ID,
      paymentMethod: 'cash',
      paymentDate: '2026-04-30',
    })

    // db.update (outside atomicTransactionWrite) should set status='paid'
    const update = capturedRunUpdate as Record<string, unknown>
    expect(update?.status).toBe('paid')
  })

  it('8. partial payment: payrollRuns.status remains approved when lines still unpaid', async () => {
    mockUser()

    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain([{ id: LINE_ID_1 }]) as never) // batch fetch
      .mockReturnValueOnce(makeChain([APPROVED_LINE]) as never) // line+run
      .mockReturnValueOnce(makeChain([ACCOUNT_CASH]) as never)
      .mockReturnValueOnce(makeChain([ACCOUNT_2500]) as never)
      .mockReturnValueOnce(makeChain([STAFF_ROW]) as never)
      .mockReturnValueOnce(makeChain([{ cnt: 1 }]) as never) // still 1 unpaid → don't update run

    vi.mocked(atomicTransactionWrite).mockImplementation(async (_ji, callback) => {
      const tx = { update: vi.fn(() => makeUpdateChain()) }
      await callback(tx as never, JE_ID)
    })

    let runUpdateCalled = false
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn((data: unknown) => {
        if ((data as Record<string, unknown>).status === 'paid') runUpdateCalled = true
        return { where: vi.fn().mockResolvedValue([]) }
      }),
    } as never)

    await recordBatchPayrollPayment({
      payrollRunId: RUN_ID,
      paymentMethod: 'cash',
      paymentDate: '2026-04-30',
    })

    // Run status should NOT be updated to 'paid' since cnt > 0
    expect(runUpdateCalled).toBe(false)
  })
})
