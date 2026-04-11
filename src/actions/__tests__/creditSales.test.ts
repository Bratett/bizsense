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

vi.mock('@/lib/tax', () => ({
  calculateTax: vi.fn(),
}))

vi.mock('@/lib/orderNumber', () => ({
  isValidOrderNumber: vi.fn((n: string) => /^ORD-[A-Z2-9]{4}-\d{4,}$/.test(n)),
}))

vi.mock('@/lib/inventory/queries', () => ({
  getProductTransactions: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/inventory/settings', () => ({
  getAllowNegativeStock: vi.fn(() => false),
}))

import { getServerSession } from '@/lib/session'
import { db } from '@/db'
import { atomicTransactionWrite } from '@/lib/atomic'
import { calculateTax } from '@/lib/tax'
import { createOrder } from '../orders'

// ─── Constants ───────────────────────────────────────────────────────────────

const BUSINESS_ID = 'biz-test-001'
const USER_ID = 'user-test-001'
const CUSTOMER_ID = 'cust-test-001'

const ACCOUNT_IDS: Record<string, string> = {
  '1001': 'acct-cash',
  '1002': 'acct-mtn-momo',
  '1100': 'acct-ar',
  '4001': 'acct-revenue',
  '2100': 'acct-vat-payable',
  '5001': 'acct-cogs',
  '1200': 'acct-inventory',
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

let capturedJournalInput: unknown = null
let capturedTxInserts: Array<{ table: string; data: unknown }> = []

function mockAtomicWrite(orderId = 'order-001') {
  capturedJournalInput = null
  capturedTxInserts = []

  vi.mocked(atomicTransactionWrite).mockImplementation(
    async (journalInput, writeSourceRecord) => {
      capturedJournalInput = journalInput
      let insertCounter = 0

      const mockTx = {
        insert: vi.fn((table: unknown) => ({
          values: vi.fn((data: unknown) => {
            const tableName =
              insertCounter === 0 ? 'orders' : insertCounter === 1 ? 'orderLines' : 'paymentsReceived'
            capturedTxInserts.push({ table: tableName, data })
            insertCounter++

            const rows = Array.isArray(data) ? data : [data]
            const returnData = rows.map((r: Record<string, unknown>) => ({ id: orderId, ...r }))
            return {
              returning: vi.fn().mockResolvedValue(returnData),
              then: (f?: ((v: unknown) => unknown) | null, r?: ((e: unknown) => unknown) | null) =>
                Promise.resolve(returnData).then(f, r),
              catch: (f?: ((e: unknown) => unknown) | null) => Promise.resolve(returnData).catch(f),
              finally: (f?: (() => void) | null) => Promise.resolve(returnData).finally(f),
            }
          }),
        })),
      }

      return writeSourceRecord(mockTx as never, 'journal-entry-001')
    },
  )
}

function mockSession(role: 'owner' | 'manager' | 'cashier' = 'owner') {
  vi.mocked(getServerSession).mockResolvedValue({
    user: {
      id: USER_ID,
      email: 'owner@test.com',
      businessId: BUSINESS_ID,
      role,
      fullName: 'Test Owner',
    },
  })
}

function mockAccountLookup() {
  const accountRows = Object.entries(ACCOUNT_IDS).map(([code, id]) => ({ id, code }))
  vi.mocked(db.select).mockReturnValue(makeChain(accountRows) as never)
}

/** Sets up db.select mock for credit sale: customer → outstanding → accounts */
function mockCreditLookups({
  creditLimit = '500.00',
  outstanding = '0.00',
}: {
  creditLimit?: string
  outstanding?: string
} = {}) {
  const accountRows = Object.entries(ACCOUNT_IDS).map(([code, id]) => ({ id, code }))
  vi.mocked(db.select)
    .mockReturnValueOnce(makeChain([{ creditLimit }]) as never)  // customer
    .mockReturnValueOnce(makeChain([{ outstanding }]) as never)   // outstanding query
    .mockReturnValueOnce(makeChain(accountRows) as never)          // accounts
}

function mockTaxResult(totalTaxAmount: number, supplyAmount: number) {
  vi.mocked(calculateTax).mockResolvedValue({
    supplyAmount,
    breakdown: totalTaxAmount > 0
      ? [
          { componentCode: 'NHIL', componentName: 'NHIL', baseAmount: supplyAmount, rate: 0.025, taxAmount: Math.round(supplyAmount * 0.025 * 100) / 100 },
          { componentCode: 'GETFUND', componentName: 'GETFund', baseAmount: supplyAmount, rate: 0.025, taxAmount: Math.round(supplyAmount * 0.025 * 100) / 100 },
          { componentCode: 'COVID', componentName: 'COVID Levy', baseAmount: supplyAmount, rate: 0.01, taxAmount: Math.round(supplyAmount * 0.01 * 100) / 100 },
          { componentCode: 'VAT', componentName: 'VAT', baseAmount: supplyAmount, rate: 0.15, taxAmount: Math.round(supplyAmount * 0.15 * 100) / 100 },
        ]
      : [],
    totalTaxAmount,
    totalAmount: supplyAmount + totalTaxAmount,
    effectiveRate: totalTaxAmount > 0 ? Math.round((totalTaxAmount / supplyAmount) * 10000) / 10000 : 0,
  })
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks()
  mockSession()
  capturedJournalInput = null
  capturedTxInserts = []
})

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('createOrder — credit sales', () => {
  it('Test 1 — credit sale unpaid, no customer: returns error "customer is required"', async () => {
    const result = await createOrder({
      orderNumber: 'ORD-X7KQ-0001',
      orderDate: '2026-04-10',
      lines: [{ description: 'Widget', quantity: 1, unitPrice: 100, unitPriceCurrency: 'GHS' }],
      paymentStatus: 'unpaid',
      // no customerId
      applyVat: false,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toMatch(/customer is required/i)
    }
    expect(atomicTransactionWrite).not.toHaveBeenCalled()
  })

  it('Test 2 — credit sale, creditLimit = 0: returns "no credit facility"', async () => {
    mockTaxResult(0, 100)
    // customer with creditLimit = 0
    vi.mocked(db.select).mockReturnValueOnce(makeChain([{ creditLimit: '0.00' }]) as never)

    const result = await createOrder({
      orderNumber: 'ORD-X7KQ-0001',
      orderDate: '2026-04-10',
      customerId: CUSTOMER_ID,
      lines: [{ description: 'Widget', quantity: 1, unitPrice: 100, unitPriceCurrency: 'GHS' }],
      paymentStatus: 'unpaid',
      applyVat: false,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toMatch(/no credit facility/i)
    }
    expect(atomicTransactionWrite).not.toHaveBeenCalled()
  })

  it('Test 3 — credit sale, would exceed limit, cashier role: throws "Credit limit exceeded"', async () => {
    mockSession('cashier')
    mockTaxResult(0, 200)
    // creditLimit=500, outstanding=400, new order=200 → 600 > 500
    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain([{ creditLimit: '500.00' }]) as never)
      .mockReturnValueOnce(makeChain([{ outstanding: '400.00' }]) as never)

    const result = await createOrder({
      orderNumber: 'ORD-X7KQ-0001',
      orderDate: '2026-04-10',
      customerId: CUSTOMER_ID,
      lines: [{ description: 'Widget', quantity: 2, unitPrice: 100, unitPriceCurrency: 'GHS' }],
      paymentStatus: 'unpaid',
      applyVat: false,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toMatch(/credit limit exceeded/i)
    }
    expect(atomicTransactionWrite).not.toHaveBeenCalled()
  })

  it('Test 4 — credit sale, would exceed limit, owner role: succeeds with creditWarning', async () => {
    mockSession('owner')
    mockTaxResult(0, 200)
    mockCreditLookups({ creditLimit: '500.00', outstanding: '400.00' })
    mockAtomicWrite()

    const result = await createOrder({
      orderNumber: 'ORD-X7KQ-0001',
      orderDate: '2026-04-10',
      customerId: CUSTOMER_ID,
      lines: [{ description: 'Widget', quantity: 2, unitPrice: 100, unitPriceCurrency: 'GHS' }],
      paymentStatus: 'unpaid',
      applyVat: false,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.creditWarning).toBeDefined()
      expect(result.creditWarning).toMatch(/exceeded/i)
    }

    // Journal should use AR (1100), not a payment account
    const journal = capturedJournalInput as {
      lines: Array<{ accountId: string; debitAmount: number; creditAmount: number }>
    }
    const debitLines = journal.lines.filter((l) => l.debitAmount > 0)
    expect(debitLines).toHaveLength(1)
    expect(debitLines[0].accountId).toBe('acct-ar')
  })

  it('Test 5 — unpaid credit sale journal: Dr 1100 / Cr 4001 + Cr 2100, balanced, no paymentsReceived', async () => {
    // Supply GHS 100, VAT ≈ 21.90
    mockTaxResult(21.90, 100)
    mockCreditLookups({ creditLimit: '1000.00', outstanding: '0.00' })
    mockAtomicWrite()

    const result = await createOrder({
      orderNumber: 'ORD-X7KQ-0001',
      orderDate: '2026-04-10',
      customerId: CUSTOMER_ID,
      lines: [{ description: 'Widget', quantity: 1, unitPrice: 100, unitPriceCurrency: 'GHS' }],
      paymentStatus: 'unpaid',
      applyVat: true,
    })

    expect(result.success).toBe(true)
    expect(atomicTransactionWrite).toHaveBeenCalledTimes(1)

    const journal = capturedJournalInput as {
      sourceType: string
      lines: Array<{ accountId: string; debitAmount: number; creditAmount: number }>
    }

    // 3 lines: Dr AR, Cr Revenue, Cr VAT
    expect(journal.lines).toHaveLength(3)
    expect(journal.sourceType).toBe('order')

    // Dr 1100 AR = 121.90
    const arLine = journal.lines.find((l) => l.debitAmount > 0)
    expect(arLine).toBeDefined()
    expect(arLine!.accountId).toBe('acct-ar')
    expect(arLine!.debitAmount).toBeCloseTo(121.90, 2)

    // Cr 4001 Revenue = 100.00
    const revLine = journal.lines.find((l) => l.accountId === 'acct-revenue')
    expect(revLine).toBeDefined()
    expect(revLine!.creditAmount).toBeCloseTo(100.0, 2)

    // Cr 2100 VAT Payable = 21.90
    const vatLine = journal.lines.find((l) => l.accountId === 'acct-vat-payable')
    expect(vatLine).toBeDefined()
    expect(vatLine!.creditAmount).toBeCloseTo(21.90, 2)

    // Invariant
    const totalDebits = journal.lines.reduce((s, l) => s + l.debitAmount, 0)
    const totalCredits = journal.lines.reduce((s, l) => s + l.creditAmount, 0)
    expect(totalDebits).toBeCloseTo(totalCredits, 2)
    expect(totalDebits).toBeCloseTo(121.90, 2)

    // Order insert: amountPaid = 0.00, paymentStatus = unpaid
    const orderInsert = capturedTxInserts.find((i) => i.table === 'orders')
    expect(orderInsert).toBeDefined()
    const orderData = orderInsert!.data as Record<string, unknown>
    expect(orderData.paymentStatus).toBe('unpaid')
    expect(orderData.amountPaid).toBe('0.00')
    expect(orderData.journalEntryId).toBe('journal-entry-001')

    // No paymentsReceived insert
    const paymentInsert = capturedTxInserts.find((i) => i.table === 'paymentsReceived')
    expect(paymentInsert).toBeUndefined()
  })

  it('Test 6 — partial payment sale journal: Dr 1100 AR + Dr 1001 Cash / Cr 4001 + Cr 2100, balanced', async () => {
    // Total = 121.90, amountPaid = 50, AR = 71.90
    mockTaxResult(21.90, 100)
    mockCreditLookups({ creditLimit: '1000.00', outstanding: '0.00' })
    mockAtomicWrite()

    const result = await createOrder({
      orderNumber: 'ORD-X7KQ-0001',
      orderDate: '2026-04-10',
      customerId: CUSTOMER_ID,
      lines: [{ description: 'Widget', quantity: 1, unitPrice: 100, unitPriceCurrency: 'GHS' }],
      paymentStatus: 'partial',
      paymentMethod: 'cash',
      amountPaid: 50,
      applyVat: true,
    })

    expect(result.success).toBe(true)
    expect(atomicTransactionWrite).toHaveBeenCalledTimes(1)

    const journal = capturedJournalInput as {
      lines: Array<{ accountId: string; debitAmount: number; creditAmount: number }>
    }

    // 4 lines: Dr AR, Dr Cash, Cr Revenue, Cr VAT
    expect(journal.lines).toHaveLength(4)

    // Dr AR = 71.90
    const arLine = journal.lines.find(
      (l) => l.debitAmount > 0 && l.accountId === 'acct-ar',
    )
    expect(arLine).toBeDefined()
    expect(arLine!.debitAmount).toBeCloseTo(71.90, 2)

    // Dr Cash = 50.00
    const cashLine = journal.lines.find(
      (l) => l.debitAmount > 0 && l.accountId === 'acct-cash',
    )
    expect(cashLine).toBeDefined()
    expect(cashLine!.debitAmount).toBeCloseTo(50.0, 2)

    // Invariant: SUM(dr) = SUM(cr) = 121.90
    const totalDebits = journal.lines.reduce((s, l) => s + l.debitAmount, 0)
    const totalCredits = journal.lines.reduce((s, l) => s + l.creditAmount, 0)
    expect(totalDebits).toBeCloseTo(totalCredits, 2)
    expect(totalDebits).toBeCloseTo(121.90, 2)

    // Order insert
    const orderInsert = capturedTxInserts.find((i) => i.table === 'orders')
    expect(orderInsert).toBeDefined()
    const orderData = orderInsert!.data as Record<string, unknown>
    expect(orderData.paymentStatus).toBe('partial')
    expect(orderData.amountPaid).toBe('50.00')

    // paymentsReceived IS inserted with amount = 50
    const paymentInsert = capturedTxInserts.find((i) => i.table === 'paymentsReceived')
    expect(paymentInsert).toBeDefined()
    const payData = paymentInsert!.data as Record<string, unknown>
    expect(payData.amount).toBe('50.00')
    expect(payData.paymentMethod).toBe('cash')
  })
})
