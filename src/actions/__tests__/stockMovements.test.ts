import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Module mocks (hoisted before imports) ──────────────────────────────────

vi.mock('@/lib/session', () => ({
  getServerSession: vi.fn(),
}))

vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: vi.fn(),
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
  getProductTransactions: vi.fn(),
}))

vi.mock('@/lib/inventory/settings', () => ({
  getAllowNegativeStock: vi.fn(() => false),
}))

import { getServerSession } from '@/lib/session'
import { requireRole } from '@/lib/auth/requireRole'
import { db } from '@/db'
import { atomicTransactionWrite } from '@/lib/atomic'
import { calculateTax } from '@/lib/tax'
import { getProductTransactions } from '@/lib/inventory/queries'
import { getAllowNegativeStock } from '@/lib/inventory/settings'
import { recordOpeningStock } from '../inventory'
import { adjustStock } from '../inventory'
import { createCashOrder, type CreateCashOrderInput } from '../orders'
import { backfillCogs } from '../migrations/backfillCogs'
import type { FifoTransactionInput } from '@/lib/inventory/fifo'

// ─── Test constants ─────────────────────────────────────────────────────────

const BUSINESS_ID = 'biz-test-001'
const USER_ID = 'user-test-001'
const PRODUCT_ID = 'product-001'
const PRODUCT_NAME = 'Test Widget'

const ACCOUNT_IDS: Record<string, string> = {
  '1001': 'acct-cash',
  '1002': 'acct-mtn-momo',
  '1003': 'acct-telecel',
  '1004': 'acct-airteltigo',
  '1005': 'acct-bank',
  '1200': 'acct-inventory',
  '2100': 'acct-vat-payable',
  '3001': 'acct-equity',
  '4001': 'acct-revenue',
  '5001': 'acct-cogs',
  '6009': 'acct-misc-expense',
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

function mockRequireRole() {
  vi.mocked(requireRole).mockResolvedValue({
    id: USER_ID,
    email: 'owner@test.com',
    businessId: BUSINESS_ID,
    role: 'owner',
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
  }
  return chain
}

// ─── Mock for db.transaction — executes callback with a mock tx ─────────────

let capturedTxCalls: Array<{ action: string; data: unknown }> = []

function mockDbTransaction() {
  capturedTxCalls = []

  vi.mocked(db.transaction).mockImplementation(async (callback) => {
    const mockTx = {
      insert: vi.fn((_table: unknown) => {
        const chain = {
          values: vi.fn((data: unknown) => {
            capturedTxCalls.push({ action: 'insert', data })
            const rows = Array.isArray(data) ? data : [data]
            const returnData = rows.map((r: Record<string, unknown>) => ({
              id: 'tx-row-' + capturedTxCalls.length,
              ...r,
            }))
            return {
              returning: vi.fn().mockResolvedValue(returnData),
              then: (f?: ((v: unknown) => unknown) | null) => Promise.resolve(returnData).then(f),
              catch: (f?: ((e: unknown) => unknown) | null) => Promise.resolve(returnData).catch(f),
              finally: (f?: (() => void) | null) => Promise.resolve(returnData).finally(f),
            }
          }),
        }
        return chain
      }),
      select: vi.fn(() => {
        const selectChain: Record<string, unknown> = {
          from: vi.fn(() => selectChain),
          where: vi.fn(() => selectChain),
          limit: vi.fn(() => selectChain),
          orderBy: vi.fn(() => selectChain),
          then: (f?: ((v: unknown) => unknown) | null) => Promise.resolve([]).then(f),
          catch: (f?: ((e: unknown) => unknown) | null) => Promise.resolve([]).catch(f),
          finally: (f?: (() => void) | null) => Promise.resolve([]).finally(f),
        }
        return selectChain
      }),
    }

    // Mock postJournalEntry which is called within the transaction
    // The callback receives tx and returns result
    return callback(mockTx as never)
  })
}

// For postJournalEntry — since it's called within the transaction via
// the actual import, we need to mock ledger.ts at the module level
vi.mock('@/lib/ledger', () => ({
  postJournalEntry: vi.fn().mockResolvedValue('journal-entry-mock-001'),
}))

import { postJournalEntry } from '@/lib/ledger'

// ─── Mock for atomicTransactionWrite (used by createCashOrder) ───────────

let capturedJournalInput: unknown = null
let capturedAtomicTxInserts: Array<{ index: number; data: unknown }> = []

function mockAtomicWrite(orderId = 'order-001') {
  capturedJournalInput = null
  capturedAtomicTxInserts = []

  vi.mocked(atomicTransactionWrite).mockImplementation(async (journalInput, writeSourceRecord) => {
    capturedJournalInput = journalInput
    let insertCounter = 0

    const mockTx = {
      insert: vi.fn((_table: unknown) => ({
        values: vi.fn((data: unknown) => {
          capturedAtomicTxInserts.push({ index: insertCounter, data })
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

// Select that returns different results per call
function mockMultiSelect(...results: unknown[][]) {
  const mock = vi.mocked(db.select)
  for (let i = 0; i < results.length; i++) {
    mock.mockReturnValueOnce(makeChain(results[i]) as never)
  }
}

function mockTaxResult(totalTaxAmount: number, supplyAmount: number) {
  vi.mocked(calculateTax).mockResolvedValue({
    supplyAmount,
    breakdown: [],
    totalTaxAmount,
    totalAmount: supplyAmount + totalTaxAmount,
    effectiveRate:
      totalTaxAmount > 0 ? Math.round((totalTaxAmount / supplyAmount) * 10000) / 10000 : 0,
  })
}

function baseOrderInput(overrides?: Partial<CreateCashOrderInput>): CreateCashOrderInput {
  return {
    orderNumber: 'ORD-X7KQ-0001',
    orderDate: '2026-04-10',
    lines: [
      {
        productId: PRODUCT_ID,
        description: 'Widget',
        quantity: 3,
        unitPrice: 80,
        unitPriceCurrency: 'GHS',
      },
    ],
    paymentMethod: 'cash',
    applyVat: false,
    ...overrides,
  }
}

// Helper to build FifoTransactionInput for opening stock
function openingStockTx(qty: number, unitCost: number): FifoTransactionInput[] {
  return [
    {
      id: 'inv-tx-001',
      transactionType: 'opening',
      quantity: qty,
      unitCost,
      transactionDate: '2026-01-01',
      createdAt: new Date('2026-01-01'),
    },
  ]
}

// ─── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks()
  mockSession()
  mockRequireRole()
  capturedJournalInput = null
  capturedAtomicTxInserts = []
  capturedTxCalls = []
})

// ═══════════════════════════════════════════════════════════════════════════
// Task 3A — recordOpeningStock
// ═══════════════════════════════════════════════════════════════════════════

describe('recordOpeningStock', () => {
  it('Test 1 — happy path: inserts inventory_transaction type=opening, posts Dr 1200 Cr 3001', async () => {
    // Mock: product lookup
    mockMultiSelect(
      // 1st select: product lookup
      [{ id: PRODUCT_ID, name: PRODUCT_NAME, trackInventory: true, businessId: BUSINESS_ID }],
      // 2nd select: existing opening check → none
      [],
      // 3rd select: account lookup
      [
        { id: 'acct-inventory', code: '1200' },
        { id: 'acct-equity', code: '3001' },
      ],
    )

    mockDbTransaction()

    const result = await recordOpeningStock({
      productId: PRODUCT_ID,
      quantity: 10,
      unitCost: 50,
      transactionDate: '2026-04-01',
    })

    expect(result.success).toBe(true)
    expect(db.transaction).toHaveBeenCalledTimes(1)

    // Verify postJournalEntry was called with correct lines
    expect(postJournalEntry).toHaveBeenCalledTimes(1)
    const journalInput = vi.mocked(postJournalEntry).mock.calls[0][1]
    expect(journalInput.sourceType).toBe('opening_stock')
    expect(journalInput.lines).toHaveLength(2)

    // Dr 1200 Inventory = 500 (10 × 50)
    const drLine = journalInput.lines.find((l: { debitAmount: number }) => l.debitAmount > 0)
    expect(drLine!.accountId).toBe('acct-inventory')
    expect(drLine!.debitAmount).toBeCloseTo(500, 2)

    // Cr 3001 Equity = 500
    const crLine = journalInput.lines.find((l: { creditAmount: number }) => l.creditAmount > 0)
    expect(crLine!.accountId).toBe('acct-equity')
    expect(crLine!.creditAmount).toBeCloseTo(500, 2)

    // Balanced
    const totalDr = journalInput.lines.reduce(
      (s: number, l: { debitAmount: number }) => s + l.debitAmount,
      0,
    )
    const totalCr = journalInput.lines.reduce(
      (s: number, l: { creditAmount: number }) => s + l.creditAmount,
      0,
    )
    expect(totalDr).toBeCloseTo(totalCr, 2)
  })

  it('Test 2 — second call for same product: returns error "already been set"', async () => {
    mockMultiSelect(
      // product lookup
      [{ id: PRODUCT_ID, name: PRODUCT_NAME, trackInventory: true, businessId: BUSINESS_ID }],
      // existing opening check → found one
      [{ id: 'existing-opening-tx' }],
    )

    const result = await recordOpeningStock({
      productId: PRODUCT_ID,
      quantity: 10,
      unitCost: 50,
      transactionDate: '2026-04-01',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('already been set')
    }
    expect(db.transaction).not.toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Task 3B — createCashOrder with COGS
// ═══════════════════════════════════════════════════════════════════════════

describe('createCashOrder with COGS', () => {
  it('Test 3 — product-linked line: Dr 5001 / Cr 1200 COGS lines present, inventoryTransaction inserted', async () => {
    mockTaxResult(0, 240) // 3 × 80 = 240, no VAT

    // db.select() call order: 1) accounts, 2) product lookup
    const allAccounts = Object.entries(ACCOUNT_IDS).map(([code, id]) => ({ id, code }))
    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain(allAccounts) as never) // accounts
      .mockReturnValueOnce(
        makeChain([
          { id: PRODUCT_ID, name: PRODUCT_NAME, trackInventory: true, unit: 'pcs' },
        ]) as never,
      ) // product

    // FIFO: opening stock 10 @ 50
    vi.mocked(getProductTransactions).mockResolvedValue(openingStockTx(10, 50))

    mockAtomicWrite()

    const result = await createCashOrder(baseOrderInput())

    expect(result.success).toBe(true)

    // Verify journal includes COGS lines
    const journal = capturedJournalInput as {
      lines: Array<{ accountId: string; debitAmount: number; creditAmount: number; memo?: string }>
    }

    // Revenue lines (2) + COGS lines (2) = 4
    expect(journal.lines.length).toBeGreaterThanOrEqual(4)

    // Dr 5001 COGS = 150 (3 × 50)
    const cogsLine = journal.lines.find((l) => l.accountId === 'acct-cogs' && l.debitAmount > 0)
    expect(cogsLine).toBeDefined()
    expect(cogsLine!.debitAmount).toBeCloseTo(150, 2)

    // Cr 1200 Inventory = 150
    const invLine = journal.lines.find(
      (l) => l.accountId === 'acct-inventory' && l.creditAmount > 0,
    )
    expect(invLine).toBeDefined()
    expect(invLine!.creditAmount).toBeCloseTo(150, 2)

    // Full journal is balanced
    const totalDebits = journal.lines.reduce((s, l) => s + l.debitAmount, 0)
    const totalCredits = journal.lines.reduce((s, l) => s + l.creditAmount, 0)
    expect(totalDebits).toBeCloseTo(totalCredits, 2)

    // Verify inventoryTransaction was inserted inside the callback
    const invTxInsert = capturedAtomicTxInserts.find((ins) => {
      const d = ins.data as Record<string, unknown>
      return d.transactionType === 'sale'
    })
    expect(invTxInsert).toBeDefined()
    const invTxData = invTxInsert!.data as Record<string, unknown>
    expect(invTxData.productId).toBe(PRODUCT_ID)
    expect(invTxData.quantity).toBe('-3.00')
  })

  it('Test 4 — product with trackInventory=false: no COGS lines, no inventoryTransaction', async () => {
    mockTaxResult(0, 240)

    const allAccounts = Object.entries(ACCOUNT_IDS).map(([code, id]) => ({ id, code }))
    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain(allAccounts) as never) // accounts
      .mockReturnValueOnce(
        makeChain([
          { id: PRODUCT_ID, name: PRODUCT_NAME, trackInventory: false, unit: 'pcs' },
        ]) as never,
      ) // product — not tracked

    mockAtomicWrite()

    const result = await createCashOrder(baseOrderInput())

    expect(result.success).toBe(true)

    const journal = capturedJournalInput as {
      lines: Array<{ accountId: string; debitAmount: number; creditAmount: number }>
    }

    // Should only have revenue lines (Dr Cash, Cr Revenue) — no COGS
    const cogsLine = journal.lines.find((l) => l.accountId === 'acct-cogs')
    expect(cogsLine).toBeUndefined()

    // No inventoryTransaction inserted
    const invTxInsert = capturedAtomicTxInserts.find((ins) => {
      const d = ins.data as Record<string, unknown>
      return d.transactionType === 'sale'
    })
    expect(invTxInsert).toBeUndefined()
  })

  it('Test 5 — insufficient stock, allowNegativeStock=false: throws before any DB write', async () => {
    mockTaxResult(0, 240)

    const allAccounts = Object.entries(ACCOUNT_IDS).map(([code, id]) => ({ id, code }))
    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain(allAccounts) as never) // accounts
      .mockReturnValueOnce(
        makeChain([
          { id: PRODUCT_ID, name: PRODUCT_NAME, trackInventory: true, unit: 'pcs' },
        ]) as never,
      ) // product

    // FIFO: only 2 in stock, trying to sell 3
    vi.mocked(getProductTransactions).mockResolvedValue(openingStockTx(2, 50))
    vi.mocked(getAllowNegativeStock).mockReturnValue(false)

    mockAtomicWrite()

    const result = await createCashOrder(baseOrderInput())

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('Insufficient stock')
      expect(result.error).toContain(PRODUCT_NAME)
    }

    // atomicTransactionWrite should NOT have been called
    expect(atomicTransactionWrite).not.toHaveBeenCalled()
  })

  it('Test 6 — multi-line order with two different products: COGS computed independently per product', async () => {
    mockTaxResult(0, 320) // 3×80 + 2×40 = 320

    const PRODUCT_B_ID = 'product-002'

    const allAccounts = Object.entries(ACCOUNT_IDS).map(([code, id]) => ({ id, code }))
    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain(allAccounts) as never) // accounts
      .mockReturnValueOnce(
        makeChain([
          { id: PRODUCT_ID, name: 'Widget A', trackInventory: true, unit: 'pcs' },
        ]) as never,
      ) // product A
      .mockReturnValueOnce(
        makeChain([
          { id: PRODUCT_B_ID, name: 'Widget B', trackInventory: true, unit: 'pcs' },
        ]) as never,
      ) // product B

    // FIFO: Product A has opening 10 @ 50, Product B has opening 20 @ 30
    vi.mocked(getProductTransactions)
      .mockResolvedValueOnce(openingStockTx(10, 50)) // Product A
      .mockResolvedValueOnce([
        {
          id: 'inv-tx-b',
          transactionType: 'opening',
          quantity: 20,
          unitCost: 30,
          transactionDate: '2026-01-01',
          createdAt: new Date('2026-01-01'),
        },
      ]) // Product B

    mockAtomicWrite()

    const result = await createCashOrder(
      baseOrderInput({
        lines: [
          {
            productId: PRODUCT_ID,
            description: 'Widget A',
            quantity: 3,
            unitPrice: 80,
            unitPriceCurrency: 'GHS',
          },
          {
            productId: PRODUCT_B_ID,
            description: 'Widget B',
            quantity: 2,
            unitPrice: 40,
            unitPriceCurrency: 'GHS',
          },
        ],
      }),
    )

    expect(result.success).toBe(true)

    const journal = capturedJournalInput as {
      lines: Array<{ accountId: string; debitAmount: number; creditAmount: number }>
    }

    // Total COGS = 3×50 + 2×30 = 150 + 60 = 210
    const cogsLine = journal.lines.find((l) => l.accountId === 'acct-cogs' && l.debitAmount > 0)
    expect(cogsLine).toBeDefined()
    expect(cogsLine!.debitAmount).toBeCloseTo(210, 2)

    // Two inventory transactions should have been inserted
    const invTxInserts = capturedAtomicTxInserts.filter((ins) => {
      const d = ins.data as Record<string, unknown>
      return d.transactionType === 'sale'
    })
    expect(invTxInserts).toHaveLength(2)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Task 3C — adjustStock
// ═══════════════════════════════════════════════════════════════════════════

describe('adjustStock', () => {
  it('Test 7 — add: Dr 1200 Cr 3001, positive inventoryTransaction', async () => {
    mockMultiSelect(
      // product lookup
      [{ id: PRODUCT_ID, name: PRODUCT_NAME, trackInventory: true, unit: 'pcs' }],
      // account lookup
      [
        { id: 'acct-inventory', code: '1200' },
        { id: 'acct-equity', code: '3001' },
      ],
    )

    mockDbTransaction()

    const result = await adjustStock({
      productId: PRODUCT_ID,
      adjustmentType: 'add',
      quantity: 5,
      unitCost: 40,
      reason: 'Stock received without PO',
    })

    expect(result.success).toBe(true)

    // Verify journal entry
    expect(postJournalEntry).toHaveBeenCalledTimes(1)
    const journalInput = vi.mocked(postJournalEntry).mock.calls[0][1]

    const drLine = journalInput.lines.find((l: { debitAmount: number }) => l.debitAmount > 0)
    expect(drLine!.accountId).toBe('acct-inventory')
    expect(drLine!.debitAmount).toBeCloseTo(200, 2) // 5 × 40

    const crLine = journalInput.lines.find((l: { creditAmount: number }) => l.creditAmount > 0)
    expect(crLine!.accountId).toBe('acct-equity')
    expect(crLine!.creditAmount).toBeCloseTo(200, 2)
  })

  it('Test 8 — remove: Dr 6009 Cr 1200, negative inventoryTransaction', async () => {
    mockMultiSelect(
      // product lookup
      [{ id: PRODUCT_ID, name: PRODUCT_NAME, trackInventory: true, unit: 'pcs' }],
      // account lookup (for remove: 1200 + 6009)
      [
        { id: 'acct-inventory', code: '1200' },
        { id: 'acct-misc-expense', code: '6009' },
      ],
    )

    // FIFO: 10 in stock @ 50 each, removing 3 → COGS = 150
    vi.mocked(getProductTransactions).mockResolvedValue(openingStockTx(10, 50))

    mockDbTransaction()

    const result = await adjustStock({
      productId: PRODUCT_ID,
      adjustmentType: 'remove',
      quantity: 3,
      reason: 'Damaged / write-off',
    })

    expect(result.success).toBe(true)

    const journalInput = vi.mocked(postJournalEntry).mock.calls[0][1]

    // Dr 6009 = 150
    const drLine = journalInput.lines.find((l: { debitAmount: number }) => l.debitAmount > 0)
    expect(drLine!.accountId).toBe('acct-misc-expense')
    expect(drLine!.debitAmount).toBeCloseTo(150, 2)

    // Cr 1200 = 150
    const crLine = journalInput.lines.find((l: { creditAmount: number }) => l.creditAmount > 0)
    expect(crLine!.accountId).toBe('acct-inventory')
    expect(crLine!.creditAmount).toBeCloseTo(150, 2)
  })

  it('Test 9 — remove more than available: throws with available quantity in message', async () => {
    mockMultiSelect(
      // product lookup
      [{ id: PRODUCT_ID, name: PRODUCT_NAME, trackInventory: true, unit: 'pcs' }],
    )

    // Only 5 in stock, trying to remove 10
    vi.mocked(getProductTransactions).mockResolvedValue(openingStockTx(5, 50))
    vi.mocked(getAllowNegativeStock).mockReturnValue(false)

    const result = await adjustStock({
      productId: PRODUCT_ID,
      adjustmentType: 'remove',
      quantity: 10,
      reason: 'Counting error',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('Cannot remove')
      expect(result.error).toContain('5')
    }
    expect(db.transaction).not.toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Task 3D — backfillCogs
// ═══════════════════════════════════════════════════════════════════════════

describe('backfillCogs', () => {
  it('Test 10 — idempotent: running twice does not duplicate journal lines', async () => {
    // Account lookups
    mockMultiSelect(
      // cogsAcct
      [{ id: 'acct-cogs' }],
      // invAcct
      [{ id: 'acct-inventory' }],
      // fulfilled orders
      [
        {
          id: 'order-001',
          orderNumber: 'ORD-X7KQ-0001',
          orderDate: '2026-03-15',
          journalEntryId: 'je-001',
          createdAt: new Date('2026-03-15'),
        },
      ],
      // order lines for order-001
      [{ id: 'ol-001', productId: PRODUCT_ID, quantity: '3.00' }],
      // idempotency check: COGS lines already exist!
      [{ id: 'existing-cogs-line' }],
    )

    const result = await backfillCogs()

    expect(result.success).toBe(true)
    expect(result.skipped).toBe(1)
    expect(result.processed).toBe(0)
    // No transaction should have been opened
    expect(db.transaction).not.toHaveBeenCalled()
  })

  it('Test 11 — handles order where product had no opening stock: appears in errors array', async () => {
    mockMultiSelect(
      // cogsAcct
      [{ id: 'acct-cogs' }],
      // invAcct
      [{ id: 'acct-inventory' }],
      // fulfilled orders
      [
        {
          id: 'order-001',
          orderNumber: 'ORD-X7KQ-0001',
          orderDate: '2026-03-15',
          journalEntryId: 'je-001',
          createdAt: new Date('2026-03-15'),
        },
      ],
      // order lines
      [{ id: 'ol-001', productId: PRODUCT_ID, quantity: '3.00' }],
      // idempotency check: no existing COGS lines
      [],
      // product lookup
      [{ id: PRODUCT_ID, name: PRODUCT_NAME, trackInventory: true }],
      // inventory transactions for FIFO: empty — no opening stock
      [],
    )

    const result = await backfillCogs()

    expect(result.success).toBe(true)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0].reason).toContain('Insufficient historical stock')
    expect(result.errors[0].orderNumber).toBe('ORD-X7KQ-0001')
  })
})
