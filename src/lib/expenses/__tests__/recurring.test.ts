import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    transaction: vi.fn(),
  },
}))

vi.mock('@/lib/session', () => ({
  getServerSession: vi.fn(),
}))

vi.mock('@/lib/atomic', () => ({
  atomicTransactionWrite: vi.fn(),
}))

vi.mock('@/lib/expenses/vatReverse', () => ({
  reverseCalculateVat: vi.fn().mockResolvedValue({ netAmount: 100, vatAmount: 0, effectiveRate: 0 }),
}))

vi.mock('@/lib/tax', () => ({
  calculateTax: vi.fn().mockResolvedValue({ totalTaxAmount: 0 }),
}))

import { getNextDueDate } from '../recurring'
import { db } from '@/db'
import { getServerSession } from '@/lib/session'
import { atomicTransactionWrite } from '@/lib/atomic'
import { processRecurringExpenses } from '@/actions/expenses'

// ── Helpers ───────────────────────────────────────────────────────────────────

const BUSINESS_ID = 'biz-001'
const USER_ID = 'user-001'
const ACCOUNT_ID = 'acc-6002'
const PAYMENT_ACC_ID = 'acc-1001' // cash account code is 1001

function mockSession() {
  vi.mocked(getServerSession).mockResolvedValue({
    user: {
      id: USER_ID,
      email: 'owner@test.com',
      businessId: BUSINESS_ID,
      role: 'owner' as const,
      fullName: 'Test Owner',
    },
  })
}

function makeChain(result: unknown[]) {
  const chain: Record<string, unknown> = {}
  const resolved = Promise.resolve(result)
  chain.then = (f?: ((v: unknown) => unknown) | null) => resolved.then(f)
  chain.catch = (f?: ((e: unknown) => unknown) | null) => resolved.catch(f)
  chain.finally = (f?: (() => void) | null) => resolved.finally(f)
  chain.from = vi.fn(() => chain)
  chain.where = vi.fn(() => chain)
  chain.limit = vi.fn(() => chain)
  chain.orderBy = vi.fn(() => chain)
  return chain
}

const BASE_TEMPLATE = {
  id: 'exp-tmpl-001',
  businessId: BUSINESS_ID,
  expenseDate: '2026-03-01', // monthly → next due 2026-04-01, which is before 2026-04-15
  recurrenceRule: 'monthly',
  category: 'rent',       // category stored as key ('rent'), not label ('Rent')
  accountId: ACCOUNT_ID,
  amount: '1200.00',
  paymentMethod: 'cash',  // cash avoids bankReference/momoReference validation
  description: 'Monthly office rent',
  notes: null,
  supplierId: null,
  isRecurring: true,
  isCapitalExpense: false,
  includesVat: false,
  approvalStatus: 'approved',
  parentExpenseId: null,
  receiptUrl: null,
  approvedBy: null,
  approvedAt: null,
  journalEntryId: null,
  createdBy: USER_ID,
  aiGenerated: false,
  createdAt: new Date(),
  updatedAt: new Date(),
}

beforeEach(() => {
  vi.resetAllMocks()
})

// ── getNextDueDate — pure function tests ──────────────────────────────────────

describe('getNextDueDate', () => {
  it('monthly: advances by one month', () => {
    expect(getNextDueDate('2026-01-15', 'monthly')).toBe('2026-02-15')
  })

  it('monthly: clamps Jan 31 to Feb 28', () => {
    expect(getNextDueDate('2026-01-31', 'monthly')).toBe('2026-02-28')
  })

  it('weekly: advances by 7 days', () => {
    expect(getNextDueDate('2026-01-10', 'weekly')).toBe('2026-01-17')
  })

  it('quarterly: advances by 3 months', () => {
    expect(getNextDueDate('2026-01-15', 'quarterly')).toBe('2026-04-15')
  })
})

// ── processRecurringExpenses ──────────────────────────────────────────────────

describe('processRecurringExpenses', () => {
  it('due template with no existing child: auto-posts expense and returns posted=1', async () => {
    mockSession()

    // Call 1: fetch recurring templates
    const templatesChain = makeChain([BASE_TEMPLATE])
    // Call 2: idempotency check → no child exists
    const childChain = makeChain([])
    // Call 3: businesses VAT check (inside createExpense, includesVat=false so skipped)
    // Call 3: resolveAccountIds → returns account map
    const accountsChain = makeChain([
      { id: ACCOUNT_ID, code: '6002' },
      { id: PAYMENT_ACC_ID, code: '1001' }, // cash account
    ])

    vi.mocked(db.select)
      .mockReturnValueOnce(templatesChain as never)
      .mockReturnValueOnce(childChain as never)
      .mockReturnValueOnce(accountsChain as never)

    // atomicTransactionWrite: call the callback with a mock tx that has insert
    vi.mocked(atomicTransactionWrite).mockImplementation(async (_input, callback) => {
      const mockTx = { insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([]) }) }
      return callback(mockTx as never, 'journal-entry-id-001')
    })

    const result = await processRecurringExpenses()

    expect(result.posted).toBe(1)
    expect(result.skipped).toBe(0)
  })

  it('template not yet due: skipped, returns posted=0 skipped=1', async () => {
    mockSession()

    const futureTemplate = {
      ...BASE_TEMPLATE,
      id: 'exp-tmpl-002',
      // monthly → next due 2026-05-15, which is after 2026-04-15
      expenseDate: '2026-04-15',
    }

    const templatesChain = makeChain([futureTemplate])
    vi.mocked(db.select).mockReturnValueOnce(templatesChain as never)

    const result = await processRecurringExpenses()

    expect(result.posted).toBe(0)
    expect(result.skipped).toBe(1)
    // atomicTransactionWrite should NOT have been called
    expect(vi.mocked(atomicTransactionWrite)).not.toHaveBeenCalled()
  })

  it('child already exists for this period: skipped (idempotent)', async () => {
    mockSession()

    const templatesChain = makeChain([BASE_TEMPLATE])
    // idempotency check returns an existing child
    const childChain = makeChain([{ id: 'exp-child-already-exists' }])

    vi.mocked(db.select)
      .mockReturnValueOnce(templatesChain as never)
      .mockReturnValueOnce(childChain as never)

    const result = await processRecurringExpenses()

    expect(result.posted).toBe(0)
    expect(result.skipped).toBe(1)
    expect(vi.mocked(atomicTransactionWrite)).not.toHaveBeenCalled()
  })
})
