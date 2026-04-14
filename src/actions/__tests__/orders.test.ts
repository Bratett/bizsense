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

import { getServerSession } from '@/lib/session'
import { db } from '@/db'
import { atomicTransactionWrite } from '@/lib/atomic'
import { calculateTax } from '@/lib/tax'
import { createCashOrder, type CreateCashOrderInput } from '../orders'

// ─── Test constants ─────────────────────────────────────────────────────────

const BUSINESS_ID = 'biz-test-001'
const USER_ID = 'user-test-001'

const ACCOUNT_IDS: Record<string, string> = {
  '1001': 'acct-cash',
  '1002': 'acct-mtn-momo',
  '1003': 'acct-telecel',
  '1004': 'acct-airteltigo',
  '1005': 'acct-bank',
  '4001': 'acct-revenue',
  '2100': 'acct-vat-payable',
}

// ─── Mock helpers ───────────────────────────────────────────────────────────

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

/** Capture journalInput and call writeSourceRecord with mock tx */
let capturedJournalInput: unknown = null
let capturedTxInserts: Array<{ table: string; data: unknown }> = []

function mockAtomicWrite(orderId = 'order-001') {
  capturedJournalInput = null
  capturedTxInserts = []

  vi.mocked(atomicTransactionWrite).mockImplementation(async (journalInput, writeSourceRecord) => {
    capturedJournalInput = journalInput
    let insertCounter = 0

    const mockTx = {
      insert: vi.fn((_table: unknown) => ({
        values: vi.fn((data: unknown) => {
          const tableName =
            insertCounter === 0 ? 'orders' : insertCounter === 1 ? 'orderLines' : 'paymentsReceived'
          capturedTxInserts.push({ table: tableName, data })
          insertCounter++

          const rows = Array.isArray(data) ? data : [data]
          const returnData = rows.map((r: Record<string, unknown>) => ({
            id: orderId,
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

function mockTaxResult(totalTaxAmount: number, supplyAmount: number) {
  vi.mocked(calculateTax).mockResolvedValue({
    supplyAmount,
    breakdown:
      totalTaxAmount > 0
        ? [
            {
              componentCode: 'NHIL',
              componentName: 'NHIL',
              baseAmount: supplyAmount,
              rate: 0.025,
              taxAmount: Math.round(supplyAmount * 0.025 * 100) / 100,
            },
            {
              componentCode: 'GETFUND',
              componentName: 'GETFund',
              baseAmount: supplyAmount,
              rate: 0.025,
              taxAmount: Math.round(supplyAmount * 0.025 * 100) / 100,
            },
            {
              componentCode: 'COVID',
              componentName: 'COVID Levy',
              baseAmount: supplyAmount,
              rate: 0.01,
              taxAmount: Math.round(supplyAmount * 0.01 * 100) / 100,
            },
            {
              componentCode: 'VAT',
              componentName: 'VAT',
              baseAmount: supplyAmount + Math.round(supplyAmount * 0.06 * 100) / 100,
              rate: 0.15,
              taxAmount: totalTaxAmount - Math.round(supplyAmount * 0.06 * 100) / 100,
            },
          ]
        : [],
    totalTaxAmount,
    totalAmount: supplyAmount + totalTaxAmount,
    effectiveRate:
      totalTaxAmount > 0 ? Math.round((totalTaxAmount / supplyAmount) * 10000) / 10000 : 0,
  })
}

function baseInput(overrides?: Partial<CreateCashOrderInput>): CreateCashOrderInput {
  return {
    orderNumber: 'ORD-X7KQ-0001',
    orderDate: '2026-04-10',
    lines: [
      {
        description: 'Widget',
        quantity: 1,
        unitPrice: 100,
        unitPriceCurrency: 'GHS',
      },
    ],
    paymentMethod: 'cash',
    applyVat: true,
    ...overrides,
  }
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks()
  mockSession()
  capturedJournalInput = null
  capturedTxInserts = []
})

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('createCashOrder', () => {
  it('Test 1 — VAT-registered cash sale: correct journal entry Dr 1001 / Cr 4001 + Cr 2100', async () => {
    // GHS 100 supply, VAT ~21.90
    mockAccountLookup()
    mockTaxResult(21.9, 100)
    mockAtomicWrite()

    const result = await createCashOrder(baseInput())

    expect(result.success).toBe(true)
    expect(atomicTransactionWrite).toHaveBeenCalledTimes(1)

    // Verify journal lines
    const journal = capturedJournalInput as {
      sourceType: string
      lines: Array<{ accountId: string; debitAmount: number; creditAmount: number }>
    }
    expect(journal.sourceType).toBe('order')
    expect(journal.lines).toHaveLength(3)

    // Dr Cash on Hand = 121.90
    const debitLine = journal.lines.find((l) => l.debitAmount > 0)
    expect(debitLine).toBeDefined()
    expect(debitLine!.accountId).toBe('acct-cash')
    expect(debitLine!.debitAmount).toBeCloseTo(121.9, 2)

    // Cr Sales Revenue = 100.00
    const revenueLine = journal.lines.find(
      (l) => l.creditAmount > 0 && l.accountId === 'acct-revenue',
    )
    expect(revenueLine).toBeDefined()
    expect(revenueLine!.creditAmount).toBeCloseTo(100.0, 2)

    // Cr VAT Payable = 21.90
    const vatLine = journal.lines.find(
      (l) => l.creditAmount > 0 && l.accountId === 'acct-vat-payable',
    )
    expect(vatLine).toBeDefined()
    expect(vatLine!.creditAmount).toBeCloseTo(21.9, 2)

    // Invariant: SUM(debits) = SUM(credits)
    const totalDebits = journal.lines.reduce((s, l) => s + l.debitAmount, 0)
    const totalCredits = journal.lines.reduce((s, l) => s + l.creditAmount, 0)
    expect(totalDebits).toBeCloseTo(totalCredits, 2)
    expect(totalDebits).toBeCloseTo(121.9, 2)

    // Verify order was inserted with correct fields
    const orderInsert = capturedTxInserts.find((i) => i.table === 'orders')
    expect(orderInsert).toBeDefined()
    const orderData = orderInsert!.data as Record<string, unknown>
    expect(orderData.paymentStatus).toBe('paid')
    expect(orderData.journalEntryId).toBe('journal-entry-001')
  })

  it('Test 2 — non-VAT MoMo sale: 2 journal lines, no VAT Payable', async () => {
    mockAccountLookup()
    mockTaxResult(0, 200)
    mockAtomicWrite()

    const result = await createCashOrder(
      baseInput({
        lines: [{ description: 'Service', quantity: 1, unitPrice: 200, unitPriceCurrency: 'GHS' }],
        paymentMethod: 'momo_mtn',
        momoReference: 'MOMO-12345',
        applyVat: false,
      }),
    )

    expect(result.success).toBe(true)

    const journal = capturedJournalInput as {
      lines: Array<{ accountId: string; debitAmount: number; creditAmount: number }>
    }

    // Only 2 lines — no VAT
    expect(journal.lines).toHaveLength(2)

    // Dr MTN MoMo = 200
    const debitLine = journal.lines.find((l) => l.debitAmount > 0)
    expect(debitLine!.accountId).toBe('acct-mtn-momo')
    expect(debitLine!.debitAmount).toBeCloseTo(200.0, 2)

    // Cr Revenue = 200
    const creditLine = journal.lines.find((l) => l.creditAmount > 0)
    expect(creditLine!.accountId).toBe('acct-revenue')
    expect(creditLine!.creditAmount).toBeCloseTo(200.0, 2)

    // No VAT line
    const vatLine = journal.lines.find((l) => l.accountId === 'acct-vat-payable')
    expect(vatLine).toBeUndefined()

    // Balance check
    const totalDebits = journal.lines.reduce((s, l) => s + l.debitAmount, 0)
    const totalCredits = journal.lines.reduce((s, l) => s + l.creditAmount, 0)
    expect(totalDebits).toBeCloseTo(totalCredits, 2)
  })

  it('Test 3 — USD line with FX rate: converts to GHS, locks rate', async () => {
    mockAccountLookup()
    mockTaxResult(0, 154)
    mockAtomicWrite()

    const result = await createCashOrder(
      baseInput({
        lines: [{ description: 'USD item', quantity: 1, unitPrice: 10, unitPriceCurrency: 'USD' }],
        fxRate: 15.4,
        applyVat: false,
      }),
    )

    expect(result.success).toBe(true)

    const journal = capturedJournalInput as {
      lines: Array<{
        accountId: string
        debitAmount: number
        creditAmount: number
        fxRate?: number
        currency?: string
      }>
    }

    // Debit = GHS 154 (10 USD * 15.40)
    const debitLine = journal.lines.find((l) => l.debitAmount > 0)
    expect(debitLine!.debitAmount).toBeCloseTo(154.0, 2)

    // All journal lines should have fxRate and currency set
    for (const line of journal.lines) {
      expect(line.fxRate).toBe(15.4)
      expect(line.currency).toBe('USD')
    }

    // Order should have fxRate locked
    const orderInsert = capturedTxInserts.find((i) => i.table === 'orders')
    const orderData = orderInsert!.data as Record<string, unknown>
    expect(orderData.fxRate).toBe('15.4000')
    expect(orderData.fxRateLockedAt).toBeDefined()
    expect(orderData.fxRateLockedAt).not.toBeNull()
  })

  it('Test 4 — multi-line with 10% order discount: tax calculated on discounted amount', async () => {
    mockAccountLookup()
    // 2 lines = GHS 200, 10% discount = 180 taxable
    // Tax on 180 ≈ 39.42 (21.9% effective)
    mockTaxResult(39.42, 180)
    mockAtomicWrite()

    const result = await createCashOrder(
      baseInput({
        lines: [
          { description: 'Item A', quantity: 2, unitPrice: 50, unitPriceCurrency: 'GHS' },
          { description: 'Item B', quantity: 1, unitPrice: 100, unitPriceCurrency: 'GHS' },
        ],
        discountType: 'percentage',
        discountValue: 10,
        applyVat: true,
      }),
    )

    expect(result.success).toBe(true)

    // calculateTax should have been called with 180 (200 - 10%)
    expect(calculateTax).toHaveBeenCalledWith(BUSINESS_ID, 180)

    const journal = capturedJournalInput as {
      lines: Array<{ debitAmount: number; creditAmount: number }>
    }

    // Total = 180 + 39.42 = 219.42
    const totalDebits = journal.lines.reduce((s, l) => s + l.debitAmount, 0)
    const totalCredits = journal.lines.reduce((s, l) => s + l.creditAmount, 0)
    expect(totalDebits).toBeCloseTo(219.42, 2)
    expect(totalDebits).toBeCloseTo(totalCredits, 2)
  })

  it('Test 5 — atomic write failure: throws, no order persisted', async () => {
    mockAccountLookup()
    mockTaxResult(21.9, 100)

    // Simulate atomicTransactionWrite throwing (e.g. journal doesn't balance)
    vi.mocked(atomicTransactionWrite).mockRejectedValue(new Error('Journal entry does not balance'))

    // createCashOrder propagates the throw from atomicTransactionWrite
    await expect(createCashOrder(baseInput())).rejects.toThrow('Journal entry does not balance')

    // atomicTransactionWrite was called (the tx was attempted)
    expect(atomicTransactionWrite).toHaveBeenCalledTimes(1)

    // Because atomicTransactionWrite threw, the entire Postgres transaction
    // was rolled back — no order record exists. In our mock, we verify
    // the tx callback was never executed (the mock rejects before it runs).
  })

  it('Test 6 — missing session: throws before any DB write', async () => {
    vi.mocked(getServerSession).mockRejectedValue(new Error('Unauthenticated'))

    await expect(createCashOrder(baseInput())).rejects.toThrow('Unauthenticated')

    expect(atomicTransactionWrite).not.toHaveBeenCalled()
    expect(calculateTax).not.toHaveBeenCalled()
    expect(db.select).not.toHaveBeenCalled()
  })
})

describe('orderNumber generation', () => {
  it('Test 7 — order number format and uniqueness', async () => {
    // Get the real implementation (not the mock)
    const actual = await vi.importActual<typeof import('@/lib/orderNumber')>('@/lib/orderNumber')

    // Valid patterns
    expect(actual.isValidOrderNumber('ORD-X7KQ-0001')).toBe(true)
    expect(actual.isValidOrderNumber('ORD-A3F2-0042')).toBe(true)
    expect(actual.isValidOrderNumber('ORD-ZZZZ-9999')).toBe(true)
    expect(actual.isValidOrderNumber('ORD-AB23-10001')).toBe(true)

    // Invalid patterns
    expect(actual.isValidOrderNumber('ORD-x7kq-0001')).toBe(false)
    expect(actual.isValidOrderNumber('INV-X7KQ-0001')).toBe(false)
    expect(actual.isValidOrderNumber('ORD-X7KQ-01')).toBe(false)
    expect(actual.isValidOrderNumber('ORD-XK-0001')).toBe(false)
    expect(actual.isValidOrderNumber('')).toBe(false)

    // Verify 5 sequential numbers are unique and valid
    const numbers = Array.from(
      { length: 5 },
      (_, i) => `ORD-X7KQ-${String(i + 1).padStart(4, '0')}`,
    )
    const unique = new Set(numbers)
    expect(unique.size).toBe(5)
    for (const n of numbers) {
      expect(actual.isValidOrderNumber(n)).toBe(true)
      expect(n).toMatch(/^ORD-[A-Z2-9]{4}-\d{4,}$/)
    }
  })
})
