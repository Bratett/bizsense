import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Module mocks (hoisted before imports) ──────────────────────────────────

vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: vi.fn(),
}))

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    transaction: vi.fn(),
  },
}))

vi.mock('@/lib/suppliers/apBalance', () => ({
  getSupplierApBalance: vi.fn(),
}))

vi.mock('@/lib/atomic', () => ({
  atomicTransactionWrite: vi.fn(),
}))

import { requireRole } from '@/lib/auth/requireRole'
import { db } from '@/db'
import { getSupplierApBalance } from '@/lib/suppliers/apBalance'
import { atomicTransactionWrite } from '@/lib/atomic'
import { recordSupplierPayment, listSupplierPayments } from '../supplierPayments'

// ─── Constants ───────────────────────────────────────────────────────────────

const BUSINESS_ID = 'biz-001'
const USER_ID = 'user-001'
const SUPPLIER_ID = 'sup-001'
const AP_ACCOUNT_ID = 'acc-2001'
const CASH_ACCOUNT_ID = 'acc-1001'
const MOMO_MTN_ACCOUNT_ID = 'acc-1002'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockRole(role = 'owner') {
  vi.mocked(requireRole).mockResolvedValue({
    id: USER_ID,
    email: 'owner@test.com',
    businessId: BUSINESS_ID,
    role: role as 'owner',
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
    leftJoin: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
  }
  return chain
}

// Captures journal input and source record from atomicTransactionWrite
type CapturedAtomicCall = {
  journalInput: Parameters<typeof atomicTransactionWrite>[0]
  payment: Record<string, unknown>
}

function mockAtomicWrite(paymentId = 'pay-001'): CapturedAtomicCall {
  const captured: CapturedAtomicCall = { journalInput: null as never, payment: {} }
  const mockPayment = {
    id: paymentId,
    businessId: BUSINESS_ID,
    supplierId: SUPPLIER_ID,
    amount: '500.00',
    paymentMethod: 'cash',
    paymentDate: '2026-01-15',
    journalEntryId: 'je-001',
    createdBy: USER_ID,
    grnId: null,
    momoReference: null,
    bankReference: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  vi.mocked(atomicTransactionWrite).mockImplementationOnce(
    async (journalInput, writeSourceRecord) => {
      captured.journalInput = journalInput
      const tx: Record<string, unknown> = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([mockPayment]),
          }),
        }),
      }
      const result = await writeSourceRecord(tx as never, 'je-001')
      captured.payment = result as Record<string, unknown>
      return result
    },
  )
  return captured
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks()
  mockRole()
})

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('recordSupplierPayment', () => {
  it('1. posts correct journal entry Dr 2001 / Cr 1001 for cash, SUM(dr) = SUM(cr)', async () => {
    // Supplier exists
    vi.mocked(db.select).mockReturnValueOnce(makeChain([{ id: SUPPLIER_ID }]) as never)
    vi.mocked(getSupplierApBalance).mockResolvedValue(1000)
    // Resolve accounts: AP (2001) and cash (1001)
    vi.mocked(db.select).mockReturnValueOnce(
      makeChain([
        { id: AP_ACCOUNT_ID, code: '2001' },
        { id: CASH_ACCOUNT_ID, code: '1001' },
      ]) as never,
    )

    const captured = mockAtomicWrite()

    await recordSupplierPayment({
      supplierId: SUPPLIER_ID,
      amount: 500,
      paymentMethod: 'cash',
      paymentDate: '2026-01-15',
    })

    const lines = captured.journalInput.lines
    const totalDebits = lines.reduce((s, l) => s + (l.debitAmount ?? 0), 0)
    const totalCredits = lines.reduce((s, l) => s + (l.creditAmount ?? 0), 0)

    expect(totalDebits).toBe(500)
    expect(totalCredits).toBe(500)
    expect(Math.abs(totalDebits - totalCredits)).toBeLessThanOrEqual(0.001)
  })

  it('2. cash payment: Cr account is 1001', async () => {
    vi.mocked(db.select).mockReturnValueOnce(makeChain([{ id: SUPPLIER_ID }]) as never)
    vi.mocked(getSupplierApBalance).mockResolvedValue(1000)
    vi.mocked(db.select).mockReturnValueOnce(
      makeChain([
        { id: AP_ACCOUNT_ID, code: '2001' },
        { id: CASH_ACCOUNT_ID, code: '1001' },
      ]) as never,
    )

    const captured = mockAtomicWrite()

    await recordSupplierPayment({
      supplierId: SUPPLIER_ID,
      amount: 500,
      paymentMethod: 'cash',
      paymentDate: '2026-01-15',
    })

    const creditLine = captured.journalInput.lines.find((l) => (l.creditAmount ?? 0) > 0)
    expect(creditLine?.accountId).toBe(CASH_ACCOUNT_ID)

    const debitLine = captured.journalInput.lines.find((l) => (l.debitAmount ?? 0) > 0)
    expect(debitLine?.accountId).toBe(AP_ACCOUNT_ID)
  })

  it('3. MoMo MTN payment: Cr account is 1002', async () => {
    vi.mocked(db.select).mockReturnValueOnce(makeChain([{ id: SUPPLIER_ID }]) as never)
    vi.mocked(getSupplierApBalance).mockResolvedValue(1000)
    vi.mocked(db.select).mockReturnValueOnce(
      makeChain([
        { id: AP_ACCOUNT_ID, code: '2001' },
        { id: MOMO_MTN_ACCOUNT_ID, code: '1002' },
      ]) as never,
    )

    const captured = mockAtomicWrite()

    await recordSupplierPayment({
      supplierId: SUPPLIER_ID,
      amount: 300,
      paymentMethod: 'momo_mtn',
      paymentDate: '2026-01-15',
    })

    const creditLine = captured.journalInput.lines.find((l) => (l.creditAmount ?? 0) > 0)
    expect(creditLine?.accountId).toBe(MOMO_MTN_ACCOUNT_ID)
  })

  it('4. amount > outstanding: proceeds but returns warningOverpayment=true', async () => {
    vi.mocked(db.select).mockReturnValueOnce(makeChain([{ id: SUPPLIER_ID }]) as never)
    vi.mocked(getSupplierApBalance).mockResolvedValue(200) // outstanding is only 200
    vi.mocked(db.select).mockReturnValueOnce(
      makeChain([
        { id: AP_ACCOUNT_ID, code: '2001' },
        { id: CASH_ACCOUNT_ID, code: '1001' },
      ]) as never,
    )

    mockAtomicWrite()

    const result = await recordSupplierPayment({
      supplierId: SUPPLIER_ID,
      amount: 500, // paying 500 when only 200 is owed
      paymentMethod: 'cash',
      paymentDate: '2026-01-15',
    })

    expect(result.warningOverpayment).toBe(true)
    expect(result.payment).toBeDefined()
  })

  it('5. source type is "payment" on the journal entry', async () => {
    vi.mocked(db.select).mockReturnValueOnce(makeChain([{ id: SUPPLIER_ID }]) as never)
    vi.mocked(getSupplierApBalance).mockResolvedValue(1000)
    vi.mocked(db.select).mockReturnValueOnce(
      makeChain([
        { id: AP_ACCOUNT_ID, code: '2001' },
        { id: CASH_ACCOUNT_ID, code: '1001' },
      ]) as never,
    )

    const captured = mockAtomicWrite()

    await recordSupplierPayment({
      supplierId: SUPPLIER_ID,
      amount: 400,
      paymentMethod: 'cash',
      paymentDate: '2026-01-15',
    })

    expect(captured.journalInput.sourceType).toBe('payment')
    expect(captured.journalInput.reference).toMatch(/^SPAY-/)
  })
})

describe('listSupplierPayments', () => {
  it('6. requires role and scopes to businessId', async () => {
    const mockPaymentRow = {
      id: 'pay-001',
      businessId: BUSINESS_ID,
      supplierId: SUPPLIER_ID,
      amount: '500.00',
      paymentMethod: 'cash',
      paymentDate: '2026-01-15',
    }

    // Supplier exists
    vi.mocked(db.select).mockReturnValueOnce(makeChain([{ id: SUPPLIER_ID }]) as never)
    // Payments query
    vi.mocked(db.select).mockReturnValueOnce(makeChain([mockPaymentRow]) as never)

    const results = await listSupplierPayments(SUPPLIER_ID)

    expect(results).toHaveLength(1)
    expect(results[0].supplierId).toBe(SUPPLIER_ID)
    expect(requireRole).toHaveBeenCalledWith(['owner', 'manager', 'accountant'])
  })
})
