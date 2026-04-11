import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Module mocks (hoisted before imports) ──────────────────────────────────

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

vi.mock('@/lib/inventory/queries', () => ({
  getProductTransactions: vi.fn(),
}))

vi.mock('@/lib/inventory/fifo', () => ({
  computeFifoCogs: vi.fn(),
}))

vi.mock('@/lib/grnNumber', () => ({
  isValidGrnNumber: vi.fn((n: string) => /^GRN-[A-Z2-9]{4}-\d{4,}$/.test(n)),
}))

import { requireRole } from '@/lib/auth/requireRole'
import { db } from '@/db'
import { atomicTransactionWrite } from '@/lib/atomic'
import { getProductTransactions } from '@/lib/inventory/queries'
import { computeFifoCogs } from '@/lib/inventory/fifo'
import {
  createGrn,
  confirmGrn,
  reverseGrn,
  type CreateGrnInput,
} from '../grn'

// ─── Constants ───────────────────────────────────────────────────────────────

const BUSINESS_ID = 'biz-001'
const USER_ID = 'user-001'
const SUPPLIER_ID = 'supplier-001'
const GRN_ID = 'grn-001'
const PRODUCT_ID_1 = 'prod-001'
const PRODUCT_ID_2 = 'prod-002'
const PO_ID = 'po-001'
const PO_LINE_ID_1 = 'po-line-001'
const PO_LINE_ID_2 = 'po-line-002'
const GRN_LINE_ID_1 = 'grn-line-001'
const GRN_LINE_ID_2 = 'grn-line-002'
const INVENTORY_ACCOUNT_ID = 'acc-1200'
const AP_ACCOUNT_ID = 'acc-2001'
const MOMO_MTN_ACCOUNT_ID = 'acc-1002'
const JOURNAL_ENTRY_ID = 'je-001'
const VALID_GRN_NUMBER = 'GRN-A3F2-0001'

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function mockUser(role = 'owner') {
  vi.mocked(requireRole).mockResolvedValue({
    id: USER_ID,
    email: 'owner@test.com',
    businessId: BUSINESS_ID,
    role: role as 'owner',
    fullName: 'Test Owner',
  })
}

/** Builds a Drizzle-style chainable query mock resolving to `result` */
function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {}
  const promise = Promise.resolve(result)
  chain['then'] = (f?: ((v: unknown) => unknown) | null, r?: ((e: unknown) => unknown) | null) =>
    promise.then(f, r)
  chain['catch'] = (f?: ((e: unknown) => unknown) | null) => promise.catch(f)
  chain['finally'] = (f?: (() => void) | null) => promise.finally(f)
  chain['from'] = vi.fn(() => chain)
  chain['where'] = vi.fn(() => chain)
  chain['set'] = vi.fn(() => chain)
  chain['limit'] = vi.fn(() => chain)
  chain['orderBy'] = vi.fn(() => chain)
  chain['leftJoin'] = vi.fn(() => chain)
  chain['groupBy'] = vi.fn(() => chain)
  chain['having'] = vi.fn(() => chain)
  chain['innerJoin'] = vi.fn(() => chain)
  return chain
}

/** Builds a mock transaction that captures inserts and updates */
function makeMockTx(returnedGrnId = GRN_ID) {
  const insertedValues: Array<{ values: unknown }> = []
  const updatedValues: Array<{ set: unknown }> = []

  const tx = {
    insert: vi.fn(() => ({
      values: vi.fn((data: unknown) => {
        insertedValues.push({ values: data })
        const rows = Array.isArray(data) ? data : [data]
        const returnData = rows.map((r: Record<string, unknown>) => ({ id: returnedGrnId, ...r }))
        return {
          returning: vi.fn().mockResolvedValue(returnData),
          then: (f?: ((v: unknown) => unknown) | null) =>
            Promise.resolve(returnData).then(f),
        }
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((data: unknown) => {
        updatedValues.push({ set: data })
        return { where: vi.fn().mockResolvedValue([]) }
      }),
    })),
    select: vi.fn(() => makeChain([])),
  }

  return { tx, insertedValues, updatedValues }
}

function baseCreateInput(overrides?: Partial<CreateGrnInput>): CreateGrnInput {
  return {
    supplierId: SUPPLIER_ID,
    receivedDate: '2026-04-11',
    grnNumber: VALID_GRN_NUMBER,
    lines: [
      { productId: PRODUCT_ID_1, quantityReceived: 10, unitCost: 50 },
      { productId: PRODUCT_ID_2, quantityReceived: 5, unitCost: 100 },
    ],
    ...overrides,
  }
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks()
  mockUser()
})

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('createGrn', () => {
  it('Test 1 — draft: inserts GRN (status=draft, journalEntryId=null) + lines, no journal, no inventory_transaction', async () => {
    // Supplier lookup succeeds
    vi.mocked(db.select).mockReturnValue(makeChain([{ id: SUPPLIER_ID }]) as never)

    // Mock db.transaction to execute callback with fake tx
    const { tx, insertedValues } = makeMockTx()
    vi.mocked(db.transaction).mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
    )

    const result = await createGrn(baseCreateInput())

    expect(result.success).toBe(true)
    if (!result.success) return

    // atomicTransactionWrite must NOT be called — draft has no journal entry
    expect(atomicTransactionWrite).not.toHaveBeenCalled()

    // db.transaction called once
    expect(db.transaction).toHaveBeenCalledTimes(1)

    // First insert: goodsReceivedNotes with status='draft', journalEntryId=null
    const grnInsert = tx.insert.mock.calls[0]
    expect(grnInsert).toBeDefined()
    const grnValues = insertedValues[0].values as Record<string, unknown>
    expect(grnValues).toMatchObject({
      businessId: BUSINESS_ID,
      status: 'draft',
      journalEntryId: null,
      grnNumber: VALID_GRN_NUMBER,
    })

    // Second insert: grnLines (2 lines)
    const linesValues = insertedValues[1].values as Array<Record<string, unknown>>
    expect(Array.isArray(linesValues)).toBe(true)
    expect(linesValues).toHaveLength(2)

    // Verify totalCost: 10×50 + 5×100 = 1000
    expect(grnValues.totalCost).toBe('1000.00')
  })
})

describe('confirmGrn', () => {
  it('Test 2 — credit purchase: Dr 1200 / Cr 2001, balanced, totalCost correct, inventory_transaction(s) inserted, grn.journalEntryId set', async () => {
    // db.select call sequence:
    // 1. GRN fetch (status=draft, no poId)
    // 2. grnLines fetch
    // 3. accounts fetch (1200 + 2001)
    vi.mocked(db.select)
      .mockReturnValueOnce(
        makeChain([
          {
            id: GRN_ID,
            grnNumber: VALID_GRN_NUMBER,
            poId: null,
            supplierId: SUPPLIER_ID,
            receivedDate: '2026-04-11',
            status: 'draft',
          },
        ]) as never,
      )
      .mockReturnValueOnce(
        makeChain([
          { id: GRN_LINE_ID_1, productId: PRODUCT_ID_1, quantityReceived: '10', unitCost: '50.00' },
          { id: GRN_LINE_ID_2, productId: PRODUCT_ID_2, quantityReceived: '5', unitCost: '100.00' },
        ]) as never,
      )
      .mockReturnValueOnce(
        makeChain([
          { id: INVENTORY_ACCOUNT_ID, code: '1200' },
          { id: AP_ACCOUNT_ID, code: '2001' },
        ]) as never,
      )

    // Capture journal input + execute callback
    let capturedJournalInput: Record<string, unknown> | null = null
    const { tx, insertedValues, updatedValues } = makeMockTx()

    vi.mocked(atomicTransactionWrite).mockImplementation(
      async (journalInput: unknown, cb: (tx: unknown, id: string) => Promise<unknown>) => {
        capturedJournalInput = journalInput as Record<string, unknown>
        return await cb(tx, JOURNAL_ENTRY_ID)
      },
    )

    const result = await confirmGrn({ grnId: GRN_ID })

    expect(result.success).toBe(true)

    // Journal entry assertions
    expect(capturedJournalInput).not.toBeNull()
    const lines = capturedJournalInput!.lines as Array<{
      accountId: string
      debitAmount: number
      creditAmount: number
    }>

    // totalCost = 10×50 + 5×100 = 1000.00
    const totalDebits = lines.reduce((s, l) => s + l.debitAmount, 0)
    const totalCredits = lines.reduce((s, l) => s + l.creditAmount, 0)
    expect(totalDebits).toBe(1000)
    expect(totalCredits).toBe(1000)
    expect(totalDebits).toBe(totalCredits) // journal invariant

    // Dr 1200
    const drLine = lines.find((l) => l.accountId === INVENTORY_ACCOUNT_ID)
    expect(drLine?.debitAmount).toBe(1000)

    // Cr 2001 (AP)
    const crLine = lines.find((l) => l.accountId === AP_ACCOUNT_ID)
    expect(crLine?.creditAmount).toBe(1000)

    // sourceType = 'grn'
    expect(capturedJournalInput!.sourceType).toBe('grn')
    expect(capturedJournalInput!.sourceId).toBe(GRN_ID)

    // GRN status update
    const grnUpdate = updatedValues.find(
      (v) => (v.set as Record<string, unknown>).status === 'confirmed',
    )
    expect(grnUpdate).toBeDefined()
    expect((grnUpdate!.set as Record<string, unknown>).journalEntryId).toBe(JOURNAL_ENTRY_ID)

    // inventory_transactions inserted (2 lines)
    const inventoryInserts = insertedValues.filter((v) => {
      const vals = v.values as Record<string, unknown>
      return vals.transactionType === 'purchase'
    })
    expect(inventoryInserts).toHaveLength(2)
    inventoryInserts.forEach((inv) => {
      const vals = inv.values as Record<string, unknown>
      expect(vals.transactionType).toBe('purchase')
      expect(vals.journalEntryId).toBe(JOURNAL_ENTRY_ID)
      expect(Number(vals.quantity)).toBeGreaterThan(0) // positive stock in
    })
  })

  it('Test 3 — cash purchase (momo_mtn): Cr account is 1002, NOT 2001', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(
        makeChain([
          {
            id: GRN_ID,
            grnNumber: VALID_GRN_NUMBER,
            poId: null,
            supplierId: SUPPLIER_ID,
            receivedDate: '2026-04-11',
            status: 'draft',
          },
        ]) as never,
      )
      .mockReturnValueOnce(
        makeChain([
          { id: GRN_LINE_ID_1, productId: PRODUCT_ID_1, quantityReceived: '10', unitCost: '50.00' },
        ]) as never,
      )
      .mockReturnValueOnce(
        makeChain([
          { id: INVENTORY_ACCOUNT_ID, code: '1200' },
          { id: MOMO_MTN_ACCOUNT_ID, code: '1002' },
        ]) as never,
      )

    let capturedJournalInput: Record<string, unknown> | null = null
    const { tx } = makeMockTx()

    vi.mocked(atomicTransactionWrite).mockImplementation(
      async (journalInput: unknown, cb: (tx: unknown, id: string) => Promise<unknown>) => {
        capturedJournalInput = journalInput as Record<string, unknown>
        return await cb(tx, JOURNAL_ENTRY_ID)
      },
    )

    const result = await confirmGrn({ grnId: GRN_ID, paymentMethod: 'momo_mtn' })

    expect(result.success).toBe(true)

    const lines = capturedJournalInput!.lines as Array<{
      accountId: string
      debitAmount: number
      creditAmount: number
    }>

    // Cr must be 1002 (MoMo MTN), NOT 2001 (AP)
    const crLine = lines.find((l) => l.creditAmount > 0)
    expect(crLine?.accountId).toBe(MOMO_MTN_ACCOUNT_ID)
    expect(crLine?.accountId).not.toBe(AP_ACCOUNT_ID)
  })

  it('Test 4 — updates PO status to "received" when all lines fully covered', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(
        makeChain([
          {
            id: GRN_ID,
            grnNumber: VALID_GRN_NUMBER,
            poId: PO_ID,
            supplierId: SUPPLIER_ID,
            receivedDate: '2026-04-11',
            status: 'draft',
          },
        ]) as never,
      )
      .mockReturnValueOnce(
        makeChain([
          { id: GRN_LINE_ID_1, productId: PRODUCT_ID_1, quantityReceived: '10', unitCost: '50.00' },
        ]) as never,
      )
      .mockReturnValueOnce(
        makeChain([
          { id: INVENTORY_ACCOUNT_ID, code: '1200' },
          { id: AP_ACCOUNT_ID, code: '2001' },
        ]) as never,
      )

    const { tx, updatedValues } = makeMockTx()

    // updatePoStatusAfterGrn calls tx.select for PO lines and received sums
    tx.select = vi.fn()
      .mockReturnValueOnce(
        makeChain([{ id: PO_LINE_ID_1, quantity: '10' }]) as never, // PO lines
      )
      .mockReturnValueOnce(
        makeChain([{ poLineId: PO_LINE_ID_1, totalReceived: '10' }]) as never, // received sums (fully received)
      )

    vi.mocked(atomicTransactionWrite).mockImplementation(
      async (_journalInput: unknown, cb: (tx: unknown, id: string) => Promise<unknown>) => {
        return await cb(tx, JOURNAL_ENTRY_ID)
      },
    )

    const result = await confirmGrn({ grnId: GRN_ID })

    expect(result.success).toBe(true)

    // PO status should be updated to 'received'
    const poUpdate = updatedValues.find(
      (v) => (v.set as Record<string, unknown>).status === 'received',
    )
    expect(poUpdate).toBeDefined()
  })

  it('Test 5 — updates PO status to "partially_received" when some lines outstanding', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(
        makeChain([
          {
            id: GRN_ID,
            grnNumber: VALID_GRN_NUMBER,
            poId: PO_ID,
            supplierId: SUPPLIER_ID,
            receivedDate: '2026-04-11',
            status: 'draft',
          },
        ]) as never,
      )
      .mockReturnValueOnce(
        makeChain([
          { id: GRN_LINE_ID_1, productId: PRODUCT_ID_1, quantityReceived: '5', unitCost: '50.00' },
        ]) as never,
      )
      .mockReturnValueOnce(
        makeChain([
          { id: INVENTORY_ACCOUNT_ID, code: '1200' },
          { id: AP_ACCOUNT_ID, code: '2001' },
        ]) as never,
      )

    const { tx, updatedValues } = makeMockTx()

    // PO line ordered 10, only 5 received → outstanding = 5 → partially_received
    tx.select = vi.fn()
      .mockReturnValueOnce(
        makeChain([
          { id: PO_LINE_ID_1, quantity: '10' },
          { id: PO_LINE_ID_2, quantity: '8' },
        ]) as never, // 2 PO lines
      )
      .mockReturnValueOnce(
        makeChain([
          { poLineId: PO_LINE_ID_1, totalReceived: '5' }, // partial on line 1
          { poLineId: PO_LINE_ID_2, totalReceived: '0' }, // nothing on line 2
        ]) as never, // received sums
      )

    vi.mocked(atomicTransactionWrite).mockImplementation(
      async (_journalInput: unknown, cb: (tx: unknown, id: string) => Promise<unknown>) => {
        return await cb(tx, JOURNAL_ENTRY_ID)
      },
    )

    const result = await confirmGrn({ grnId: GRN_ID })

    expect(result.success).toBe(true)

    const poUpdate = updatedValues.find(
      (v) => (v.set as Record<string, unknown>).status === 'partially_received',
    )
    expect(poUpdate).toBeDefined()
  })

  it('Test 6 — already confirmed: returns error without calling atomicTransactionWrite', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(
        makeChain([
          {
            id: GRN_ID,
            grnNumber: VALID_GRN_NUMBER,
            poId: null,
            supplierId: SUPPLIER_ID,
            receivedDate: '2026-04-11',
            status: 'confirmed', // already confirmed
          },
        ]) as never,
      )

    const result = await confirmGrn({ grnId: GRN_ID })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toMatch(/draft/i) // error mentions draft
    expect(atomicTransactionWrite).not.toHaveBeenCalled()
  })
})

describe('reverseGrn', () => {
  it('Test 7 — full reversal: Dr 2001 / Cr 1200, balanced, return_out transactions with negative qty, original GRN untouched', async () => {
    // db.select sequence:
    // 1. GRN fetch (confirmed, no poId)
    // 2. grnLines fetch
    // 3. inventoryAccount (1200)
    // 4. journalLines credit line (AP = 2001)
    vi.mocked(db.select)
      .mockReturnValueOnce(
        makeChain([
          {
            id: GRN_ID,
            grnNumber: VALID_GRN_NUMBER,
            poId: null,
            receivedDate: '2026-04-11',
            status: 'confirmed',
            journalEntryId: JOURNAL_ENTRY_ID,
          },
        ]) as never,
      )
      .mockReturnValueOnce(
        makeChain([
          { id: GRN_LINE_ID_1, productId: PRODUCT_ID_1, quantityReceived: '10' },
          { id: GRN_LINE_ID_2, productId: PRODUCT_ID_2, quantityReceived: '5' },
        ]) as never,
      )
      .mockReturnValueOnce(
        makeChain([{ id: INVENTORY_ACCOUNT_ID }]) as never, // inventory account
      )
      .mockReturnValueOnce(
        makeChain([{ accountId: AP_ACCOUNT_ID, creditAmount: '1000.00' }]) as never, // original credit line
      )

    // FIFO costs for returning lines
    vi.mocked(getProductTransactions).mockResolvedValue([])
    vi.mocked(computeFifoCogs)
      .mockReturnValueOnce({ cogsTotal: 500, layersConsumed: [], remainingQuantity: 0, insufficientStock: false, shortfall: 0 }) // line 1: 10 units @ 500 FIFO
      .mockReturnValueOnce({ cogsTotal: 500, layersConsumed: [], remainingQuantity: 0, insufficientStock: false, shortfall: 0 }) // line 2: 5 units @ 500 FIFO

    let capturedJournalInput: Record<string, unknown> | null = null
    const { tx, insertedValues, updatedValues } = makeMockTx()

    vi.mocked(atomicTransactionWrite).mockImplementation(
      async (journalInput: unknown, cb: (tx: unknown, id: string) => Promise<unknown>) => {
        capturedJournalInput = journalInput as Record<string, unknown>
        return await cb(tx, 'je-reversal-001')
      },
    )

    const result = await reverseGrn({
      grnId: GRN_ID,
      reason: 'Damaged goods',
      lines: [
        { grnLineId: GRN_LINE_ID_1, quantityReturning: 10 },
        { grnLineId: GRN_LINE_ID_2, quantityReturning: 5 },
      ],
    })

    expect(result.success).toBe(true)

    // Journal invariant
    const lines = capturedJournalInput!.lines as Array<{
      accountId: string
      debitAmount: number
      creditAmount: number
    }>
    const totalDebits = lines.reduce((s, l) => s + l.debitAmount, 0)
    const totalCredits = lines.reduce((s, l) => s + l.creditAmount, 0)
    expect(totalDebits).toBe(totalCredits) // balanced
    expect(totalDebits).toBe(1000) // 500 + 500 = 1000

    // Dr 2001 (AP reversal)
    const drLine = lines.find((l) => l.debitAmount > 0)
    expect(drLine?.accountId).toBe(AP_ACCOUNT_ID)

    // Cr 1200 (inventory reduction)
    const crLine = lines.find((l) => l.creditAmount > 0)
    expect(crLine?.accountId).toBe(INVENTORY_ACCOUNT_ID)

    // sourceType = 'reversal', reversalOf = original entry
    expect(capturedJournalInput!.sourceType).toBe('reversal')
    expect(capturedJournalInput!.reversalOf).toBe(JOURNAL_ENTRY_ID)

    // return_out inventory_transactions with negative quantity
    const returnOuts = insertedValues.filter((v) => {
      const vals = v.values as Record<string, unknown>
      return vals.transactionType === 'return_out'
    })
    expect(returnOuts).toHaveLength(2)
    returnOuts.forEach((inv) => {
      const vals = inv.values as Record<string, unknown>
      expect(Number(vals.quantity)).toBeLessThan(0) // negative — stock leaving
    })

    // Original GRN must NOT be updated (no update to goodsReceivedNotes)
    const grnStatusUpdate = updatedValues.find(
      (v) => (v.set as Record<string, unknown>).status !== undefined &&
              (v.set as Record<string, unknown>).status !== 'partially_received',
    )
    expect(grnStatusUpdate).toBeUndefined()
  })

  it('Test 8 — partial reversal: returnAmount = FIFO cost of returned qty only', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(
        makeChain([
          {
            id: GRN_ID,
            grnNumber: VALID_GRN_NUMBER,
            poId: null,
            receivedDate: '2026-04-11',
            status: 'confirmed',
            journalEntryId: JOURNAL_ENTRY_ID,
          },
        ]) as never,
      )
      .mockReturnValueOnce(
        makeChain([
          { id: GRN_LINE_ID_1, productId: PRODUCT_ID_1, quantityReceived: '10' },
        ]) as never,
      )
      .mockReturnValueOnce(makeChain([{ id: INVENTORY_ACCOUNT_ID }]) as never)
      .mockReturnValueOnce(
        makeChain([{ accountId: AP_ACCOUNT_ID, creditAmount: '1000.00' }]) as never,
      )

    // Only returning 3 of 10 units — FIFO cost for those 3 = 150
    vi.mocked(getProductTransactions).mockResolvedValue([])
    vi.mocked(computeFifoCogs).mockReturnValue({
      cogsTotal: 150, // FIFO cost of 3 units
      layersConsumed: [],
      remainingQuantity: 7,
      insufficientStock: false,
      shortfall: 0,
    })

    let capturedJournalInput: Record<string, unknown> | null = null
    const { tx } = makeMockTx()

    vi.mocked(atomicTransactionWrite).mockImplementation(
      async (journalInput: unknown, cb: (tx: unknown, id: string) => Promise<unknown>) => {
        capturedJournalInput = journalInput as Record<string, unknown>
        return await cb(tx, 'je-partial-reversal')
      },
    )

    const result = await reverseGrn({
      grnId: GRN_ID,
      reason: 'Partial return',
      lines: [{ grnLineId: GRN_LINE_ID_1, quantityReturning: 3 }], // only 3 of 10
    })

    expect(result.success).toBe(true)

    const lines = capturedJournalInput!.lines as Array<{ debitAmount: number; creditAmount: number }>
    const returnAmount = lines.reduce((s, l) => s + l.debitAmount, 0)
    // returnAmount = FIFO cost of 3 units = 150 (not full 1000)
    expect(returnAmount).toBe(150)
  })

  it('Test 9 — quantityReturning > quantityReceived: returns error', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(
        makeChain([
          {
            id: GRN_ID,
            grnNumber: VALID_GRN_NUMBER,
            poId: null,
            receivedDate: '2026-04-11',
            status: 'confirmed',
            journalEntryId: JOURNAL_ENTRY_ID,
          },
        ]) as never,
      )
      .mockReturnValueOnce(
        makeChain([
          { id: GRN_LINE_ID_1, productId: PRODUCT_ID_1, quantityReceived: '10' },
        ]) as never,
      )

    const result = await reverseGrn({
      grnId: GRN_ID,
      reason: 'Test',
      lines: [{ grnLineId: GRN_LINE_ID_1, quantityReturning: 15 }], // 15 > 10 — invalid
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toMatch(/15|return|received/i)
    expect(atomicTransactionWrite).not.toHaveBeenCalled()
  })
})

describe('reconciliation — confirmed GRN orphan check', () => {
  it('Test 10 — confirmed GRN with journalEntryId=null appears in ledger_integrity_log', async () => {
    // Import the reconciliation function
    const { runLedgerReconciliation } = await import('@/lib/reconciliation')

    // db.select call sequence matching reconciliation.ts checks:
    // Check 1: fulfilled orders → []
    // Check 2: approved expenses → []
    // Check 3: confirmed GRNs with null journalEntryId → 1 orphan
    // Check 4: imbalanced journal entries → []
    // Deduplication check: existing integrity log → [] (not already logged)
    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain([]) as never) // orphan orders
      .mockReturnValueOnce(makeChain([]) as never) // orphan expenses
      .mockReturnValueOnce(
        makeChain([{ id: GRN_ID }]) as never, // orphan confirmed GRN
      )
      .mockReturnValueOnce(makeChain([]) as never) // imbalanced entries
      .mockReturnValueOnce(makeChain([]) as never) // dedup check for grn

    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockResolvedValue([]),
    } as never)

    const { issuesFound, issues } = await runLedgerReconciliation(BUSINESS_ID)

    expect(issuesFound).toBeGreaterThanOrEqual(1)

    const grnIssue = issues.find(
      (i) => i.sourceId === GRN_ID && i.issue === 'missing_journal_entry',
    )
    expect(grnIssue).toBeDefined()
    expect(grnIssue!.sourceTable).toBe('goods_received_notes')

    // ledger_integrity_log.insert called with the orphan GRN
    const insertCall = vi.mocked(db.insert).mock.calls[0]
    expect(insertCall).toBeDefined()
    const valuesCall = vi.mocked(db.insert).mock.results[0].value.values.mock.calls[0][0]
    expect(valuesCall).toMatchObject({
      businessId: BUSINESS_ID,
      sourceTable: 'goods_received_notes',
      sourceId: GRN_ID,
      issue: 'missing_journal_entry',
    })
  })
})

describe('atomic integrity', () => {
  it('Test 11 — atomicTransactionWrite failure during confirmGrn: grn.status stays draft, no inventory_transaction, no journal_entry', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(
        makeChain([
          {
            id: GRN_ID,
            grnNumber: VALID_GRN_NUMBER,
            poId: null,
            supplierId: SUPPLIER_ID,
            receivedDate: '2026-04-11',
            status: 'draft',
          },
        ]) as never,
      )
      .mockReturnValueOnce(
        makeChain([
          { id: GRN_LINE_ID_1, productId: PRODUCT_ID_1, quantityReceived: '10', unitCost: '50.00' },
        ]) as never,
      )
      .mockReturnValueOnce(
        makeChain([
          { id: INVENTORY_ACCOUNT_ID, code: '1200' },
          { id: AP_ACCOUNT_ID, code: '2001' },
        ]) as never,
      )

    // atomicTransactionWrite throws — simulates DB failure on journal_lines insert
    vi.mocked(atomicTransactionWrite).mockRejectedValue(new Error('DB write failed'))

    // The action should propagate the error
    await expect(confirmGrn({ grnId: GRN_ID })).rejects.toThrow('DB write failed')

    // atomicTransactionWrite was called but threw — so no writes committed
    expect(atomicTransactionWrite).toHaveBeenCalledTimes(1)

    // No direct db.insert calls should have happened (they're inside the tx)
    expect(db.insert).not.toHaveBeenCalled()

    // db.update not called (GRN status remains 'draft')
    expect(db.update).not.toHaveBeenCalled()
  })
})
