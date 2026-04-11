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

vi.mock('@/lib/expenses/vatReverse', () => ({
  reverseCalculateVat: vi.fn(),
}))

vi.mock('@/lib/ledger', () => ({
  reverseJournalEntry: vi.fn(),
}))

import { getServerSession } from '@/lib/session'
import { db } from '@/db'
import { atomicTransactionWrite } from '@/lib/atomic'
import { reverseCalculateVat } from '@/lib/expenses/vatReverse'
import { reverseJournalEntry } from '@/lib/ledger'
import {
  createExpense,
  approveExpense,
  rejectExpense,
  reverseExpense,
  type CreateExpenseInput,
} from '../expenses'

// ─── Test constants ─────────────────────────────────────────────────────────

const BUSINESS_ID = 'biz-test-001'
const USER_ID = 'user-test-001'
const MANAGER_ID = 'user-manager-001'

const ACCOUNT_IDS: Record<string, string> = {
  '1001': 'acct-cash',
  '1002': 'acct-mtn-momo',
  '1003': 'acct-telecel',
  '1004': 'acct-airteltigo',
  '1005': 'acct-bank',
  '1101': 'acct-input-vat',
  '1500': 'acct-fixed-assets',
  '6001': 'acct-salaries',
  '6002': 'acct-rent',
  '6003': 'acct-utilities',
  '6004': 'acct-transport',
  '6005': 'acct-marketing',
  '6006': 'acct-bank-charges',
  '6007': 'acct-repairs',
  '6008': 'acct-depreciation',
  '6009': 'acct-misc',
}

// ─── Mock helpers ───────────────────────────────────────────────────────────

function mockSession(role: string = 'owner', userId: string = USER_ID) {
  vi.mocked(getServerSession).mockResolvedValue({
    user: {
      id: userId,
      email: `${role}@test.com`,
      businessId: BUSINESS_ID,
      role: role as 'owner' | 'manager' | 'accountant' | 'cashier',
      fullName: `Test ${role}`,
    },
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
    groupBy: vi.fn(() => chain),
  }
  return chain
}

/** Capture journalInput and call writeSourceRecord with mock tx */
let capturedJournalInput: unknown = null
let capturedTxInserts: Array<{ data: unknown }> = []
let capturedTxUpdates: Array<{ data: unknown }> = []

function mockAtomicWrite() {
  capturedJournalInput = null
  capturedTxInserts = []
  capturedTxUpdates = []

  vi.mocked(atomicTransactionWrite).mockImplementation(async (journalInput, writeSourceRecord) => {
    capturedJournalInput = journalInput

    const mockTx = {
      insert: vi.fn(() => ({
        values: vi.fn((data: unknown) => {
          capturedTxInserts.push({ data })
          const rows = Array.isArray(data) ? data : [data]
          const returnData = rows.map((r: Record<string, unknown>) => ({
            ...r,
          }))
          return {
            returning: vi.fn().mockResolvedValue(returnData),
            then: (
              onfulfilled?: ((v: unknown) => unknown) | null,
              onrejected?: ((e: unknown) => unknown) | null,
            ) => Promise.resolve(returnData).then(onfulfilled, onrejected),
            catch: (f?: ((e: unknown) => unknown) | null) => Promise.resolve(returnData).catch(f),
            finally: (f?: (() => void) | null) => Promise.resolve(returnData).finally(f),
          }
        }),
      })),
      update: vi.fn(() => ({
        set: vi.fn((data: unknown) => {
          capturedTxUpdates.push({ data })
          return {
            where: vi.fn().mockResolvedValue(undefined),
            then: (
              onfulfilled?: ((v: unknown) => unknown) | null,
              onrejected?: ((e: unknown) => unknown) | null,
            ) => Promise.resolve(undefined).then(onfulfilled, onrejected),
            catch: (f?: ((e: unknown) => unknown) | null) => Promise.resolve(undefined).catch(f),
            finally: (f?: (() => void) | null) => Promise.resolve(undefined).finally(f),
          }
        }),
      })),
    }

    return writeSourceRecord(mockTx as never, 'journal-entry-001')
  })
}

function mockAccountLookup() {
  const accountRows = Object.entries(ACCOUNT_IDS).map(([code, id]) => ({
    id,
    code,
  }))

  vi.mocked(db.select).mockReturnValue(makeChain(accountRows) as never)
}

function mockBusinessVatCheck(vatRegistered: boolean = false) {
  // This mock needs to return business data on the first select call
  // and account data on subsequent calls
  const businessResult = [{ vatRegistered }]
  const accountRows = Object.entries(ACCOUNT_IDS).map(([code, id]) => ({
    id,
    code,
  }))

  let callCount = 0
  vi.mocked(db.select).mockImplementation(() => {
    callCount++
    if (callCount === 1) {
      return makeChain(businessResult) as never
    }
    return makeChain(accountRows) as never
  })
}

function mockInsertReturning(returnData: unknown = undefined) {
  vi.mocked(db.insert).mockReturnValue({
    values: vi.fn(() => ({
      returning: vi.fn().mockResolvedValue(returnData ? [returnData] : []),
      then: (
        onfulfilled?: ((v: unknown) => unknown) | null,
        onrejected?: ((e: unknown) => unknown) | null,
      ) => Promise.resolve(returnData ? [returnData] : []).then(onfulfilled, onrejected),
      catch: (f?: ((e: unknown) => unknown) | null) =>
        Promise.resolve(returnData ? [returnData] : []).catch(f),
      finally: (f?: (() => void) | null) =>
        Promise.resolve(returnData ? [returnData] : []).finally(f),
    })),
  } as never)
}

function baseInput(overrides?: Partial<CreateExpenseInput>): CreateExpenseInput {
  return {
    expenseDate: '2026-04-10',
    category: 'rent',
    amount: 200,
    paymentMethod: 'cash',
    description: 'Office rent for April',
    ...overrides,
  }
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks()
  capturedJournalInput = null
  capturedTxInserts = []
  capturedTxUpdates = []
})

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('createExpense', () => {
  it('Test 1 — standard expense (cash, owner): correct journal Dr 6002 / Cr 1001', async () => {
    mockSession('owner')
    mockAccountLookup()
    mockAtomicWrite()

    const result = await createExpense(baseInput())

    expect(result.success).toBe(true)
    expect(atomicTransactionWrite).toHaveBeenCalledTimes(1)

    // Verify journal lines
    const journal = capturedJournalInput as {
      sourceType: string
      lines: Array<{ accountId: string; debitAmount: number; creditAmount: number }>
    }
    expect(journal.sourceType).toBe('expense')
    expect(journal.lines).toHaveLength(2)

    // Dr Rent (6002) = 200
    const debitLine = journal.lines.find((l) => l.debitAmount > 0)
    expect(debitLine).toBeDefined()
    expect(debitLine!.accountId).toBe('acct-rent')
    expect(debitLine!.debitAmount).toBeCloseTo(200.0, 2)

    // Cr Cash on Hand (1001) = 200
    const creditLine = journal.lines.find((l) => l.creditAmount > 0)
    expect(creditLine).toBeDefined()
    expect(creditLine!.accountId).toBe('acct-cash')
    expect(creditLine!.creditAmount).toBeCloseTo(200.0, 2)

    // Invariant: SUM(debits) = SUM(credits)
    const totalDebits = journal.lines.reduce((s, l) => s + l.debitAmount, 0)
    const totalCredits = journal.lines.reduce((s, l) => s + l.creditAmount, 0)
    expect(totalDebits).toBeCloseTo(totalCredits, 2)
    expect(totalDebits).toBeCloseTo(200.0, 2)

    // Verify expense was inserted with correct fields
    const expenseInsert = capturedTxInserts[0]?.data as Record<string, unknown>
    expect(expenseInsert).toBeDefined()
    expect(expenseInsert.approvalStatus).toBe('approved')
    expect(expenseInsert.journalEntryId).toBe('journal-entry-001')
  })

  it('Test 2 — cashier creates expense: pending_approval, no journal entry', async () => {
    mockSession('cashier')
    mockAccountLookup()
    mockInsertReturning()

    const result = await createExpense(baseInput())

    expect(result.success).toBe(true)

    // atomicTransactionWrite should NOT have been called
    expect(atomicTransactionWrite).not.toHaveBeenCalled()

    // db.insert should have been called directly (not via tx)
    expect(db.insert).toHaveBeenCalledTimes(1)
  })

  it('Test 3 — VAT-inclusive expense (MoMo, manager): 3 journal lines with VAT split', async () => {
    mockSession('manager')

    // Mock: business is VAT registered (first select), then account lookup (second select)
    mockBusinessVatCheck(true)

    // Mock VAT reverse calculation: gross 121.90 → net 100, VAT 21.90
    vi.mocked(reverseCalculateVat).mockResolvedValue({
      netAmount: 100.0,
      vatAmount: 21.9,
      effectiveRate: 0.219,
    })

    mockAtomicWrite()

    const result = await createExpense(
      baseInput({
        category: 'transport',
        amount: 121.9,
        paymentMethod: 'momo_mtn',
        momoReference: 'MOMO-12345',
        includesVat: true,
        description: 'Fuel for delivery van',
      }),
    )

    expect(result.success).toBe(true)
    expect(reverseCalculateVat).toHaveBeenCalledWith(BUSINESS_ID, 121.9)

    const journal = capturedJournalInput as {
      lines: Array<{ accountId: string; debitAmount: number; creditAmount: number }>
    }

    // 3 lines: expense net, input VAT, payment
    expect(journal.lines).toHaveLength(3)

    // Dr Transport & Fuel (6004) = 100.00 (net)
    const expenseLine = journal.lines.find(
      (l) => l.debitAmount > 0 && l.accountId === 'acct-transport',
    )
    expect(expenseLine).toBeDefined()
    expect(expenseLine!.debitAmount).toBeCloseTo(100.0, 2)

    // Dr Input VAT Recoverable (1101) = 21.90
    const vatLine = journal.lines.find((l) => l.debitAmount > 0 && l.accountId === 'acct-input-vat')
    expect(vatLine).toBeDefined()
    expect(vatLine!.debitAmount).toBeCloseTo(21.9, 2)

    // Cr MTN MoMo (1002) = 121.90 (gross)
    const paymentLine = journal.lines.find((l) => l.creditAmount > 0)
    expect(paymentLine).toBeDefined()
    expect(paymentLine!.accountId).toBe('acct-mtn-momo')
    expect(paymentLine!.creditAmount).toBeCloseTo(121.9, 2)

    // Balance check
    const totalDebits = journal.lines.reduce((s, l) => s + l.debitAmount, 0)
    const totalCredits = journal.lines.reduce((s, l) => s + l.creditAmount, 0)
    expect(totalDebits).toBeCloseTo(totalCredits, 2)
    expect(totalDebits).toBeCloseTo(121.9, 2)
  })

  it('Test 4 — capital expense (Asset Purchase, bank): Dr 1500, no 6xxx account', async () => {
    mockSession('owner')
    mockAccountLookup()
    mockAtomicWrite()

    const result = await createExpense(
      baseInput({
        category: 'asset_purchase',
        amount: 5000,
        paymentMethod: 'bank',
        bankReference: 'BANK-REF-001',
        isCapitalExpense: true,
        description: 'Generator purchase',
      }),
    )

    expect(result.success).toBe(true)

    const journal = capturedJournalInput as {
      lines: Array<{ accountId: string; debitAmount: number; creditAmount: number }>
    }

    expect(journal.lines).toHaveLength(2)

    // Dr Fixed Assets — Cost (1500) = 5000
    const debitLine = journal.lines.find((l) => l.debitAmount > 0)
    expect(debitLine).toBeDefined()
    expect(debitLine!.accountId).toBe('acct-fixed-assets')
    expect(debitLine!.debitAmount).toBeCloseTo(5000.0, 2)

    // Cr Bank Account (1005) = 5000
    const creditLine = journal.lines.find((l) => l.creditAmount > 0)
    expect(creditLine).toBeDefined()
    expect(creditLine!.accountId).toBe('acct-bank')
    expect(creditLine!.creditAmount).toBeCloseTo(5000.0, 2)

    // No expense account (6xxx) in journal lines
    const expenseAcctLine = journal.lines.find(
      (l) =>
        l.accountId.startsWith('acct-salaries') ||
        l.accountId.startsWith('acct-rent') ||
        l.accountId.startsWith('acct-utilities') ||
        l.accountId.startsWith('acct-transport') ||
        l.accountId.startsWith('acct-misc'),
    )
    expect(expenseAcctLine).toBeUndefined()

    // Balance check
    const totalDebits = journal.lines.reduce((s, l) => s + l.debitAmount, 0)
    const totalCredits = journal.lines.reduce((s, l) => s + l.creditAmount, 0)
    expect(totalDebits).toBeCloseTo(totalCredits, 2)

    // Verify isCapitalExpense flag
    const expenseInsert = capturedTxInserts[0]?.data as Record<string, unknown>
    expect(expenseInsert.isCapitalExpense).toBe(true)
  })

  it('Test 5 — MoMo payment without reference: returns validation error', async () => {
    mockSession('owner')

    const result = await createExpense(
      baseInput({
        paymentMethod: 'momo_mtn',
        // no momoReference provided
      }),
    )

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.fieldErrors?.momoReference).toBeDefined()
    }

    expect(atomicTransactionWrite).not.toHaveBeenCalled()
  })
})

describe('approveExpense', () => {
  it('Test 6 — manager approves pending expense: journal posts, status updated', async () => {
    mockSession('manager', MANAGER_ID)

    // First select: fetch expense
    const pendingExpense = {
      id: 'expense-001',
      businessId: BUSINESS_ID,
      expenseDate: '2026-04-10',
      category: 'utilities',
      accountId: 'acct-utilities',
      amount: '150.00',
      paymentMethod: 'cash',
      description: 'Electricity bill',
      approvalStatus: 'pending_approval',
      isCapitalExpense: false,
      includesVat: false,
      journalEntryId: null,
      notes: null,
    }

    let selectCallCount = 0
    const accountRows = Object.entries(ACCOUNT_IDS).map(([code, id]) => ({
      id,
      code,
    }))

    vi.mocked(db.select).mockImplementation(() => {
      selectCallCount++
      if (selectCallCount === 1) {
        // Expense lookup
        return makeChain([pendingExpense]) as never
      }
      if (selectCallCount === 2) {
        // Account code lookup for expense account
        return makeChain([{ code: '6003' }]) as never
      }
      // Account ID resolution
      return makeChain(accountRows) as never
    })

    mockAtomicWrite()

    const result = await approveExpense('expense-001')

    expect(result.success).toBe(true)
    expect(atomicTransactionWrite).toHaveBeenCalledTimes(1)

    // Verify journal was built
    const journal = capturedJournalInput as {
      sourceType: string
      lines: Array<{ accountId: string; debitAmount: number; creditAmount: number }>
    }
    expect(journal.sourceType).toBe('expense')

    // Verify balance
    const totalDebits = journal.lines.reduce((s, l) => s + l.debitAmount, 0)
    const totalCredits = journal.lines.reduce((s, l) => s + l.creditAmount, 0)
    expect(totalDebits).toBeCloseTo(totalCredits, 2)
    expect(totalDebits).toBeCloseTo(150.0, 2)

    // Verify update was called with approval fields
    const updateData = capturedTxUpdates[0]?.data as Record<string, unknown>
    expect(updateData.approvalStatus).toBe('approved')
    expect(updateData.approvedBy).toBe(MANAGER_ID)
    expect(updateData.journalEntryId).toBe('journal-entry-001')
  })

  it('Test 7 — cashier tries to approve: throws Forbidden', async () => {
    mockSession('cashier')

    await expect(approveExpense('expense-001')).rejects.toThrow(
      'Forbidden: insufficient permissions',
    )

    expect(atomicTransactionWrite).not.toHaveBeenCalled()
  })
})

describe('rejectExpense', () => {
  it('Test 8 — reject pending expense: status changes, no journal', async () => {
    mockSession('manager', MANAGER_ID)

    const pendingExpense = {
      id: 'expense-002',
      businessId: BUSINESS_ID,
      approvalStatus: 'pending_approval',
      journalEntryId: null,
      notes: null,
    }

    vi.mocked(db.select).mockReturnValue(makeChain([pendingExpense]) as never)

    const mockUpdateSet = vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    }))
    vi.mocked(db.update).mockReturnValue({
      set: mockUpdateSet,
    } as never)

    const result = await rejectExpense('expense-002', 'Duplicate expense')

    expect(result.success).toBe(true)
    expect(atomicTransactionWrite).not.toHaveBeenCalled()

    // Verify update was called
    expect(db.update).toHaveBeenCalled()
    expect(mockUpdateSet).toHaveBeenCalled()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateArgs = (mockUpdateSet.mock.calls as any)[0]?.[0] as Record<string, unknown>
    expect(updateArgs).toBeDefined()
    expect(updateArgs.approvalStatus).toBe('rejected')
    expect(updateArgs.notes).toContain('Rejected: Duplicate expense')
  })
})

describe('reverseExpense', () => {
  it('Test 9 — reverse approved expense: calls reverseJournalEntry', async () => {
    mockSession('owner')

    const approvedExpense = {
      id: 'expense-003',
      businessId: BUSINESS_ID,
      approvalStatus: 'approved',
      journalEntryId: 'je-original-001',
      notes: 'Original notes',
      description: 'Fuel purchase',
    }

    vi.mocked(db.select).mockReturnValue(makeChain([approvedExpense]) as never)
    vi.mocked(reverseJournalEntry).mockResolvedValue('je-reversal-001')

    const mockTxUpdate = vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    }))

    vi.mocked(db.transaction).mockImplementation(async (callback) => {
      const mockTx = {
        update: mockTxUpdate,
      }
      return callback(mockTx as never)
    })

    const result = await reverseExpense('expense-003', 'Entered wrong amount')

    expect(result.success).toBe(true)

    // Verify reverseJournalEntry was called with correct params
    expect(reverseJournalEntry).toHaveBeenCalledWith(
      expect.anything(), // tx
      'je-original-001',
      BUSINESS_ID,
      USER_ID,
      'Entered wrong amount',
    )
  })
})

describe('createExpense — atomic failure', () => {
  it('Test 10 — atomic write failure: throws, no expense persisted', async () => {
    mockSession('owner')
    mockAccountLookup()

    vi.mocked(atomicTransactionWrite).mockRejectedValue(new Error('Journal entry does not balance'))

    await expect(createExpense(baseInput())).rejects.toThrow('Journal entry does not balance')

    expect(atomicTransactionWrite).toHaveBeenCalledTimes(1)
  })
})
