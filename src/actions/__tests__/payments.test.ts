import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Module mocks (hoisted before imports) ──────────────────────────────────

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

import { getServerSession } from '@/lib/session'
import { db } from '@/db'
import { atomicTransactionWrite } from '@/lib/atomic'
import { recordPaymentReceived } from '../payments'

// ─── Constants ───────────────────────────────────────────────────────────────

const BUSINESS_ID = 'biz-test-001'
const USER_ID = 'user-test-001'
const ORDER_ID = 'order-001'
const ORDER_NUMBER = 'ORD-X7KQ-0001'

const ACCOUNT_IDS: Record<string, string> = {
  '1001': 'acct-cash',
  '1002': 'acct-mtn-momo',
  '1100': 'acct-ar',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function mockSession() {
  vi.mocked(getServerSession).mockResolvedValue({
    user: {
      id: USER_ID,
      email: 'owner@test.com',
      businessId: BUSINESS_ID,
      role: 'owner',
      fullName: 'Test Owner',
    },
  })
}

type MockOrder = {
  id?: string
  businessId?: string
  orderNumber?: string
  status?: string
  paymentStatus?: string
  totalAmount?: string
  amountPaid?: string
  customerId?: string | null
  fxRate?: string | null
}

function makeOrder(overrides: MockOrder = {}) {
  return {
    id: ORDER_ID,
    businessId: BUSINESS_ID,
    orderNumber: ORDER_NUMBER,
    status: 'fulfilled',
    paymentStatus: 'unpaid',
    totalAmount: '200.00',
    amountPaid: '0.00',
    customerId: null,
    fxRate: null,
    ...overrides,
  }
}

function mockAccountLookup() {
  const accountRows = Object.entries(ACCOUNT_IDS).map(([code, id]) => ({ id, code }))
  vi.mocked(db.select).mockReturnValueOnce(makeChain(accountRows) as never)
}

type CapturedPayment = {
  journalInput: unknown
  txInserts: { field: string; data: unknown }[]
  txUpdates: { data: unknown }[]
}

function mockAtomicWrite(): CapturedPayment {
  const captured: CapturedPayment = { journalInput: null, txInserts: [], txUpdates: [] }

  vi.mocked(atomicTransactionWrite).mockImplementationOnce(
    async (journalInput, writeSourceRecord) => {
      captured.journalInput = journalInput

      const mockTx = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn((data: unknown) => {
            captured.txInserts.push({ field: 'paymentsReceived', data })
            return {
              returning: vi.fn().mockResolvedValue([data]),
              then: (f?: ((v: unknown) => unknown) | null) => Promise.resolve([data]).then(f),
              catch: (f?: ((e: unknown) => unknown) | null) => Promise.resolve([data]).catch(f),
              finally: (f?: (() => void) | null) => Promise.resolve([data]).finally(f),
            }
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn((data: unknown) => {
            captured.txUpdates.push({ data })
            return {
              where: vi.fn().mockResolvedValue(undefined),
            }
          }),
        }),
      }

      return writeSourceRecord(mockTx as never, 'je-payment-001')
    },
  )

  return captured
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks()
  mockSession()
})

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('recordPaymentReceived', () => {
  it('Test 7 — full payment on unpaid order: Dr Cash / Cr AR, order becomes paid', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain([makeOrder()]) as never)  // order fetch
      .mockReturnValueOnce(makeChain(Object.entries(ACCOUNT_IDS).map(([code, id]) => ({ id, code }))) as never)  // accounts

    const captured = mockAtomicWrite()

    const result = await recordPaymentReceived({
      orderId: ORDER_ID,
      amount: 200,
      paymentMethod: 'cash',
      paymentDate: '2026-04-10',
    })

    expect(result.success).toBe(true)
    expect(atomicTransactionWrite).toHaveBeenCalledTimes(1)

    const journal = captured.journalInput as {
      sourceType: string
      lines: Array<{ accountId: string; debitAmount: number; creditAmount: number }>
    }
    expect(journal.sourceType).toBe('payment')
    expect(journal.lines).toHaveLength(2)

    // Dr Cash = 200
    const debitLine = journal.lines.find((l) => l.debitAmount > 0)
    expect(debitLine!.accountId).toBe('acct-cash')
    expect(debitLine!.debitAmount).toBeCloseTo(200, 2)

    // Cr AR = 200
    const creditLine = journal.lines.find((l) => l.creditAmount > 0)
    expect(creditLine!.accountId).toBe('acct-ar')
    expect(creditLine!.creditAmount).toBeCloseTo(200, 2)

    // Balanced
    const totalDebits = journal.lines.reduce((s, l) => s + l.debitAmount, 0)
    const totalCredits = journal.lines.reduce((s, l) => s + l.creditAmount, 0)
    expect(totalDebits).toBeCloseTo(totalCredits, 2)

    // Order update: paymentStatus = 'paid', amountPaid = '200.00'
    expect(captured.txUpdates).toHaveLength(1)
    const updateData = captured.txUpdates[0].data as Record<string, unknown>
    expect(updateData.paymentStatus).toBe('paid')
    expect(updateData.amountPaid).toBe('200.00')
  })

  it('Test 8 — partial payment on unpaid order: order becomes partial', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain([makeOrder({ totalAmount: '500.00', amountPaid: '0.00' })]) as never)
      .mockReturnValueOnce(makeChain(Object.entries(ACCOUNT_IDS).map(([code, id]) => ({ id, code }))) as never)

    const captured = mockAtomicWrite()

    const result = await recordPaymentReceived({
      orderId: ORDER_ID,
      amount: 200,
      paymentMethod: 'cash',
      paymentDate: '2026-04-10',
    })

    expect(result.success).toBe(true)

    const updateData = captured.txUpdates[0].data as Record<string, unknown>
    expect(updateData.paymentStatus).toBe('partial')
    expect(updateData.amountPaid).toBe('200.00')
  })

  it('Test 9 — second payment exactly settles the balance: status becomes paid', async () => {
    // total=500, already paid=300, paying 200 → fully paid
    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain([makeOrder({ totalAmount: '500.00', amountPaid: '300.00', paymentStatus: 'partial' })]) as never)
      .mockReturnValueOnce(makeChain(Object.entries(ACCOUNT_IDS).map(([code, id]) => ({ id, code }))) as never)

    const captured = mockAtomicWrite()

    const result = await recordPaymentReceived({
      orderId: ORDER_ID,
      amount: 200,
      paymentMethod: 'cash',
      paymentDate: '2026-04-10',
    })

    expect(result.success).toBe(true)

    const updateData = captured.txUpdates[0].data as Record<string, unknown>
    expect(updateData.paymentStatus).toBe('paid')
    expect(updateData.amountPaid).toBe('500.00')
  })

  it('Test 10 — amount > remaining balance: returns error, no write', async () => {
    // total=200, paid=150, remaining=50, trying to pay 100
    vi.mocked(db.select).mockReturnValueOnce(
      makeChain([makeOrder({ totalAmount: '200.00', amountPaid: '150.00', paymentStatus: 'partial' })]) as never,
    )

    const result = await recordPaymentReceived({
      orderId: ORDER_ID,
      amount: 100,
      paymentMethod: 'cash',
      paymentDate: '2026-04-10',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toMatch(/exceeds remaining balance/i)
    }
    expect(atomicTransactionWrite).not.toHaveBeenCalled()
  })

  it('Test 11 — order already paid: returns "already fully paid"', async () => {
    vi.mocked(db.select).mockReturnValueOnce(
      makeChain([makeOrder({ paymentStatus: 'paid', amountPaid: '200.00' })]) as never,
    )

    const result = await recordPaymentReceived({
      orderId: ORDER_ID,
      amount: 50,
      paymentMethod: 'cash',
      paymentDate: '2026-04-10',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toMatch(/already fully paid/i)
    }
    expect(atomicTransactionWrite).not.toHaveBeenCalled()
  })

  it('Test 12 — order belongs to different business: returns not found', async () => {
    // db.select returns empty array (no order found for this businessId)
    vi.mocked(db.select).mockReturnValueOnce(makeChain([]) as never)

    const result = await recordPaymentReceived({
      orderId: 'other-order-id',
      amount: 100,
      paymentMethod: 'cash',
      paymentDate: '2026-04-10',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toMatch(/not found/i)
    }
    expect(atomicTransactionWrite).not.toHaveBeenCalled()
  })

  it('Test 13 — MoMo payment without reference: returns fieldError', async () => {
    const result = await recordPaymentReceived({
      orderId: ORDER_ID,
      amount: 100,
      paymentMethod: 'momo_mtn',
      paymentDate: '2026-04-10',
      // no momoReference
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.fieldErrors?.momoReference).toBeDefined()
    }
    expect(atomicTransactionWrite).not.toHaveBeenCalled()
  })
})
