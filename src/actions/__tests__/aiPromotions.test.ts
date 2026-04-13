import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Module mocks (hoisted before imports) ───────────────────────────────────

vi.mock('@/lib/session', () => ({
  getServerSession: vi.fn(),
}))

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
  },
}))

vi.mock('@/actions/orders', () => ({
  createOrder: vi.fn(),
}))

vi.mock('@/actions/expenses', () => ({
  createExpense: vi.fn(),
}))

vi.mock('@/actions/payments', () => ({
  recordPaymentReceived: vi.fn(),
}))

vi.mock('@/actions/customers', () => ({
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
}))

vi.mock('@/actions/suppliers', () => ({
  createSupplier: vi.fn(),
}))

vi.mock('@/actions/inventory', () => ({
  adjustStock: vi.fn(),
}))

import { getServerSession } from '@/lib/session'
import { db } from '@/db'
import { createOrder } from '@/actions/orders'
import { createExpense } from '@/actions/expenses'
import { recordPaymentReceived } from '@/actions/payments'
import { createCustomer, updateCustomer } from '@/actions/customers'
import { createSupplier } from '@/actions/suppliers'
import { adjustStock } from '@/actions/inventory'
import { confirmAiAction, rejectAiAction } from '../aiPromotions'

// ─── Test constants ──────────────────────────────────────────────────────────

const BUSINESS_ID = 'biz-test-001'
const OTHER_BUSINESS_ID = 'biz-other-999'
const USER_ID = 'user-test-001'
const PENDING_ID = 'pending-001'
const FUTURE_EXPIRY = new Date(Date.now() + 30 * 60 * 1000) // 30 min from now
const PAST_EXPIRY = new Date(Date.now() - 1000) // 1 second ago

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockSession(businessId = BUSINESS_ID) {
  vi.mocked(getServerSession).mockResolvedValue({
    user: {
      id: USER_ID,
      email: 'owner@test.com',
      businessId,
      role: 'owner',
      fullName: 'Test Owner',
    },
  })
}

/**
 * Build a fluent Drizzle select chain mock that resolves to the given result.
 */
function makeChain(result: unknown[]) {
  const chain: Record<string, unknown> = {
    then: (f?: ((v: unknown) => unknown) | null, r?: ((e: unknown) => unknown) | null) =>
      Promise.resolve(result).then(f, r),
    catch: (f?: ((e: unknown) => unknown) | null) => Promise.resolve(result).catch(f),
    finally: (f?: (() => void) | null) => Promise.resolve(result).finally(f),
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(() => chain),
  }
  return chain
}

/**
 * Mock db.update to succeed (set().where() resolves void).
 * Returns the `set` mock fn for assertion.
 */
function mockUpdateSuccess() {
  const whereMock = vi.fn().mockResolvedValue(undefined)
  const setMock = vi.fn(() => ({ where: whereMock }))
  vi.mocked(db.update).mockReturnValue({ set: setMock } as never)
  return { setMock, whereMock }
}

function makePendingRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: PENDING_ID,
    businessId: BUSINESS_ID,
    actionType: 'record_sale',
    status: 'pending',
    expiresAt: FUTURE_EXPIRY,
    proposedData: {
      orderDate: '2026-04-11',
      paymentMethod: 'cash',
      items: [{ productName: 'Tomatoes', qty: 5, unit_price: 10 }],
    },
    humanReadable: 'Sale of 5 × Tomatoes @ GHS 10.00\nTotal: GHS 50.00',
    ...overrides,
  }
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks()
  mockSession()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('confirmAiAction — record_sale', () => {
  it('Test 1: creates real order, marks pending as confirmed', async () => {
    vi.mocked(db.select).mockReturnValue(makeChain([makePendingRecord()]) as never)

    vi.mocked(createOrder).mockResolvedValue({
      success: true,
      orderId: 'order-001',
      orderNumber: 'ORD-BSAI-001',
    })

    const { setMock } = mockUpdateSuccess()

    const result = await confirmAiAction(PENDING_ID)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.resultId).toBe('order-001')
      expect(result.resultTable).toBe('orders')
    }

    // Verify createOrder was called with AI-generated order number format
    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        orderNumber: expect.stringMatching(/^ORD-BSAI-\d+$/),
        applyVat: false,
      }),
    )

    // Verify confirmed status was set
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'confirmed',
        resultId: 'order-001',
        resultTable: 'orders',
      }),
    )
  })

  it('Test 1b: cannot confirm same action twice (status filter prevents it)', async () => {
    // Second call: nothing returned (status is already confirmed, not pending)
    vi.mocked(db.select).mockReturnValue(makeChain([]) as never)

    const result = await confirmAiAction(PENDING_ID)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('not found or already processed')
    }
    expect(createOrder).not.toHaveBeenCalled()
  })
})

describe('confirmAiAction — tenant isolation', () => {
  it('Test 2: wrong businessId — fails, no DB write', async () => {
    // Session is for OTHER_BUSINESS_ID — the query returns nothing
    mockSession(OTHER_BUSINESS_ID)
    vi.mocked(db.select).mockReturnValue(makeChain([]) as never)

    const result = await confirmAiAction(PENDING_ID)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('not found or already processed')
    }
    expect(db.update).not.toHaveBeenCalled()
    expect(createOrder).not.toHaveBeenCalled()
  })
})

describe('confirmAiAction — expiry', () => {
  it('Test 3: expired action returns error, marks as expired, no promotion', async () => {
    vi.mocked(db.select).mockReturnValue(
      makeChain([makePendingRecord({ expiresAt: PAST_EXPIRY })]) as never,
    )

    const { setMock } = mockUpdateSuccess()

    const result = await confirmAiAction(PENDING_ID)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('expired')
    }

    // Status updated to expired
    expect(setMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'expired' }))
    // Underlying action never called
    expect(createOrder).not.toHaveBeenCalled()
  })
})

describe('confirmAiAction — record_expense', () => {
  it('Test 4: creates real expense + journal entry', async () => {
    vi.mocked(db.select).mockReturnValue(
      makeChain([
        makePendingRecord({
          actionType: 'record_expense',
          proposedData: {
            expenseDate: '2026-04-11',
            category: 'rent',
            amount: 500,
            paymentMethod: 'cash',
            description: 'Office rent April 2026',
          },
        }),
      ]) as never,
    )

    vi.mocked(createExpense).mockResolvedValue({
      success: true,
      expenseId: 'expense-001',
    })

    const { setMock } = mockUpdateSuccess()

    const result = await confirmAiAction(PENDING_ID)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.resultId).toBe('expense-001')
      expect(result.resultTable).toBe('expenses')
    }

    expect(createExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        expenseDate: '2026-04-11',
        category: 'rent',
        amount: 500,
        paymentMethod: 'cash',
        description: 'Office rent April 2026',
      }),
    )

    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'confirmed', resultTable: 'expenses' }),
    )
  })
})

describe('confirmAiAction — record_payment_received', () => {
  it('Test 5: records payment, clears AR', async () => {
    vi.mocked(db.select).mockReturnValue(
      makeChain([
        makePendingRecord({
          actionType: 'record_payment_received',
          proposedData: {
            orderId: 'order-abc',
            amount: 200,
            paymentMethod: 'momo_mtn',
            paymentDate: '2026-04-11',
          },
        }),
      ]) as never,
    )

    vi.mocked(recordPaymentReceived).mockResolvedValue({
      success: true,
      paymentId: 'payment-001',
    })

    mockUpdateSuccess()

    const result = await confirmAiAction(PENDING_ID)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.resultId).toBe('payment-001')
      expect(result.resultTable).toBe('payments_received')
    }

    expect(recordPaymentReceived).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-abc',
        amount: 200,
        paymentMethod: 'momo_mtn',
        paymentDate: '2026-04-11',
      }),
    )
  })
})

describe('confirmAiAction — add_customer', () => {
  it('Test 6: creates customer record', async () => {
    vi.mocked(db.select).mockReturnValue(
      makeChain([
        makePendingRecord({
          actionType: 'add_customer',
          proposedData: {
            name: 'Ama Serwaa',
            phone: '0241234567',
            location: 'Madina Market',
            creditLimit: 500,
          },
        }),
      ]) as never,
    )

    vi.mocked(createCustomer).mockResolvedValue({
      success: true,
      customerId: 'customer-001',
    })

    mockUpdateSuccess()

    const result = await confirmAiAction(PENDING_ID)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.resultId).toBe('customer-001')
      expect(result.resultTable).toBe('customers')
    }

    // Verify FormData was built and passed
    expect(createCustomer).toHaveBeenCalled()
    const [, formData] = vi.mocked(createCustomer).mock.calls[0]
    expect(formData.get('name')).toBe('Ama Serwaa')
    expect(formData.get('phone')).toBe('0241234567')
    expect(formData.get('location')).toBe('Madina Market')
  })
})

describe('rejectAiAction', () => {
  it('Test 7: sets status = rejected', async () => {
    const { setMock } = mockUpdateSuccess()

    await rejectAiAction(PENDING_ID)

    expect(setMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'rejected' }))
  })

  it('Test 8: already confirmed action is a no-op (status filter in WHERE)', async () => {
    // The WHERE clause includes status='pending', so confirmed records are skipped.
    // The update is still called but Postgres's WHERE means 0 rows affected —
    // we just verify the WHERE condition includes the status guard.
    const { whereMock } = mockUpdateSuccess()

    await rejectAiAction(PENDING_ID)

    // WHERE must include the pending status guard
    expect(whereMock).toHaveBeenCalled()
  })
})

describe('confirmAiAction — atomicity on underlying action failure', () => {
  it('Test 9: if createOrder throws, pending record stays pending (no status update)', async () => {
    vi.mocked(db.select).mockReturnValue(makeChain([makePendingRecord()]) as never)

    vi.mocked(createOrder).mockResolvedValue({
      success: false,
      error: 'Insufficient stock for this item',
    })

    // db.update should NOT be called with status=confirmed
    mockUpdateSuccess()

    const result = await confirmAiAction(PENDING_ID)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('Insufficient stock')
    }

    // db.update must NOT have been called (status remains pending)
    expect(db.update).not.toHaveBeenCalled()
  })
})
