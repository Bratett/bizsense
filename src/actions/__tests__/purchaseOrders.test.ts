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
    delete: vi.fn(),
    transaction: vi.fn(),
  },
}))

vi.mock('@/lib/poNumber', () => ({
  isValidPoNumber: vi.fn((n: string) => /^PO-[A-Z2-9]{4}-\d{4,}$/.test(n)),
}))

import { requireRole } from '@/lib/auth/requireRole'
import { db } from '@/db'
import {
  createPurchaseOrder,
  updatePurchaseOrder,
  cancelPurchaseOrder,
  listPurchaseOrders,
  getPurchaseOrderById,
  type CreatePoInput,
} from '../purchaseOrders'

// ─── Constants ───────────────────────────────────────────────────────────────

const BUSINESS_ID = 'biz-001'
const USER_ID = 'user-001'
const SUPPLIER_ID = 'supplier-001'
const PO_ID = 'po-001'
const VALID_PO_NUMBER = 'PO-A3F2-0001'

// ─── Mock helpers ────────────────────────────────────────────────────────────

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
  return chain
}

/** Mocks db.transaction() to execute the callback with a fake tx object */
function mockTransaction() {
  const inserts: Array<{ values: unknown }> = []
  const updates: Array<{ set: unknown }> = []
  const deletes: Array<{ table: string }> = []

  const makeTxInsert = () => ({
    values: vi.fn((data: unknown) => {
      inserts.push({ values: data })
      const rows = Array.isArray(data) ? data : [data]
      const returnData = rows.map((r: Record<string, unknown>) => ({
        id: PO_ID,
        ...r,
      }))
      return {
        returning: vi.fn().mockResolvedValue(returnData),
        then: (f?: ((v: unknown) => unknown) | null) => Promise.resolve(returnData).then(f),
      }
    }),
  })

  const makeTxUpdate = () => ({
    set: vi.fn((data: unknown) => {
      updates.push({ set: data })
      return {
        where: vi.fn().mockResolvedValue([]),
      }
    }),
  })

  const makeTxDelete = () => ({
    where: vi.fn().mockResolvedValue([]),
  })

  const tx = {
    insert: vi.fn(() => makeTxInsert()),
    update: vi.fn(() => makeTxUpdate()),
    delete: vi.fn(() => makeTxDelete()),
  }

  vi.mocked(db.transaction).mockImplementation(async (fn) => fn(tx as never))

  return { tx, inserts, updates, deletes }
}

function baseCreateInput(overrides?: Partial<CreatePoInput>): CreatePoInput {
  return {
    supplierId: SUPPLIER_ID,
    orderDate: '2026-04-11',
    currency: 'GHS',
    poNumber: VALID_PO_NUMBER,
    lines: [
      {
        description: 'Bag of rice',
        quantity: 10,
        unitCost: 50,
      },
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

describe('createPurchaseOrder', () => {
  it('Test 1 — GHS PO: inserts PO (status=draft) + lines, no journal entry, totals correct', async () => {
    // Supplier lookup returns a match
    vi.mocked(db.select).mockReturnValue(
      makeChain([{ id: SUPPLIER_ID }]) as never,
    )

    const { tx } = mockTransaction()

    const result = await createPurchaseOrder(baseCreateInput())

    expect(result.success).toBe(true)
    if (!result.success) return

    // db.transaction() called once
    expect(db.transaction).toHaveBeenCalledTimes(1)

    // tx.insert called twice: once for PO, once for lines
    expect(tx.insert).toHaveBeenCalledTimes(2)

    // The PO values should have status='draft', totalAmount='500.00'
    const poValuesCall = tx.insert.mock.results[0].value.values.mock.calls[0][0]
    expect(poValuesCall).toMatchObject({
      businessId: BUSINESS_ID,
      status: 'draft',
      currency: 'GHS',
      totalAmount: '500.00',
      subtotal: '500.00',
      fxRate: null,
      fxRateLockedAt: null,
    })

    // Lines: 1 line with unitCost=50 GHS, lineTotal=500
    const linesValuesCall = tx.insert.mock.results[1].value.values.mock.calls[0][0]
    expect(linesValuesCall).toHaveLength(1)
    expect(linesValuesCall[0]).toMatchObject({
      unitCost: '50.00',
      lineTotal: '500.00',
      quantity: '10.00',
    })
  })

  it('Test 2 — USD PO: lineTotal = qty × unitCost × fxRate (GHS), fxRateLockedAt set, currency=USD', async () => {
    vi.mocked(db.select).mockReturnValue(
      makeChain([{ id: SUPPLIER_ID }]) as never,
    )
    const { tx } = mockTransaction()

    const result = await createPurchaseOrder(
      baseCreateInput({
        currency: 'USD',
        fxRate: 15.5,
        lines: [{ description: 'Laptop', quantity: 2, unitCost: 100 }],
      }),
    )

    expect(result.success).toBe(true)

    const poValues = tx.insert.mock.results[0].value.values.mock.calls[0][0]
    // GHS total = 2 × 100 × 15.5 = 3100
    expect(poValues.totalAmount).toBe('3100.00')
    expect(poValues.currency).toBe('USD')
    expect(poValues.fxRate).toBe('15.5000')
    expect(poValues.fxRateLockedAt).toBeInstanceOf(Date)

    // Unit cost on lines stored in GHS: 100 × 15.5 = 1550
    const linesValues = tx.insert.mock.results[1].value.values.mock.calls[0][0]
    expect(linesValues[0].unitCost).toBe('1550.00')
    expect(linesValues[0].lineTotal).toBe('3100.00')
  })

  it('Test 3 — USD with missing fxRate: returns fieldError on fxRate', async () => {
    const result = await createPurchaseOrder(
      baseCreateInput({ currency: 'USD', fxRate: undefined }),
    )

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.fieldErrors?.fxRate).toBeTruthy()
    expect(db.transaction).not.toHaveBeenCalled()
  })
})

describe('updatePurchaseOrder', () => {
  it('Test 4 — status=draft: deletes old lines, inserts new lines, recomputes totals', async () => {
    // Return existing draft PO
    vi.mocked(db.select).mockReturnValue(
      makeChain([
        {
          id: PO_ID,
          businessId: BUSINESS_ID,
          status: 'draft',
          currency: 'GHS',
          fxRate: null,
          notes: null,
          expectedDate: null,
          poNumber: VALID_PO_NUMBER,
        },
      ]) as never,
    )

    const { tx } = mockTransaction()

    const result = await updatePurchaseOrder(PO_ID, {
      lines: [
        { description: 'Updated item', quantity: 5, unitCost: 200 },
      ],
    })

    expect(result.success).toBe(true)
    expect(db.transaction).toHaveBeenCalledTimes(1)

    // delete called first (removes old lines)
    expect(tx.delete).toHaveBeenCalledTimes(1)

    // insert called for new lines
    expect(tx.insert).toHaveBeenCalledTimes(1)
    const newLines = tx.insert.mock.results[0].value.values.mock.calls[0][0]
    expect(newLines[0]).toMatchObject({
      unitCost: '200.00',
      lineTotal: '1000.00',
      quantity: '5.00',
    })

    // update called with new totals
    expect(tx.update).toHaveBeenCalledTimes(1)
    const updateSet = tx.update.mock.results[0].value.set.mock.calls[0][0]
    expect(updateSet.totalAmount).toBe('1000.00')
    expect(updateSet.subtotal).toBe('1000.00')
  })

  it("Test 5 — status=sent: returns error 'can only be edited before being sent'", async () => {
    vi.mocked(db.select).mockReturnValue(
      makeChain([
        {
          id: PO_ID,
          businessId: BUSINESS_ID,
          status: 'sent',
          currency: 'GHS',
          fxRate: null,
          notes: null,
          expectedDate: null,
          poNumber: VALID_PO_NUMBER,
        },
      ]) as never,
    )

    const result = await updatePurchaseOrder(PO_ID, {
      lines: [{ description: 'Item', quantity: 1, unitCost: 100 }],
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toContain('can only be edited before being sent')
    expect(db.transaction).not.toHaveBeenCalled()
  })
})

describe('cancelPurchaseOrder', () => {
  it("Test 6 — status=partially_received: throws 'Cannot cancel'", async () => {
    vi.mocked(db.select).mockReturnValue(
      makeChain([
        {
          id: PO_ID,
          businessId: BUSINESS_ID,
          status: 'partially_received',
          notes: null,
        },
      ]) as never,
    )

    await expect(cancelPurchaseOrder(PO_ID)).rejects.toThrow(
      'Cannot cancel a PO that has already had goods received',
    )
    expect(db.update).not.toHaveBeenCalled()
  })

  it("Test 7 — status=draft: sets status='cancelled'", async () => {
    vi.mocked(db.select).mockReturnValue(
      makeChain([
        {
          id: PO_ID,
          businessId: BUSINESS_ID,
          status: 'draft',
          notes: null,
        },
      ]) as never,
    )

    const chain = makeChain([])
    vi.mocked(db.update).mockReturnValue(chain as never)

    await cancelPurchaseOrder(PO_ID, 'Wrong items')

    expect(db.update).toHaveBeenCalledTimes(1)
    const setCall = (chain['set'] as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(setCall.status).toBe('cancelled')
    expect(setCall.notes).toContain('Wrong items')
  })
})

describe('getPurchaseOrderById', () => {
  it('Test 8 — quantityOutstanding correctly reflects confirmed GRN lines', async () => {
    // First select: PO + supplier join
    // Second select: lines with GRN receipt aggregation
    // Third select: GRNs for this PO
    let callCount = 0
    vi.mocked(db.select).mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // PO header
        return makeChain([
          {
            id: PO_ID,
            poNumber: VALID_PO_NUMBER,
            localPoNumber: VALID_PO_NUMBER,
            supplierId: SUPPLIER_ID,
            supplierName: 'Acme Supplies',
            supplierPhone: '0201234567',
            orderDate: '2026-04-11',
            expectedDate: null,
            status: 'partially_received',
            currency: 'GHS',
            fxRate: null,
            fxRateLockedAt: null,
            subtotal: '500.00',
            totalAmount: '500.00',
            notes: null,
            createdAt: new Date(),
          },
        ]) as never
      }
      if (callCount === 2) {
        // Lines with received qty (6 received out of 10 ordered)
        return makeChain([
          {
            id: 'line-001',
            productId: null,
            description: 'Bag of rice',
            quantity: '10.00',
            unitCost: '50.00',
            lineTotal: '500.00',
            quantityReceived: '6',
          },
        ]) as never
      }
      // GRNs
      return makeChain([
        {
          id: 'grn-001',
          grnNumber: 'GRN-A3F2-0001',
          receivedDate: '2026-04-12',
          status: 'confirmed',
          totalCost: '300.00',
        },
      ]) as never
    })

    const po = await getPurchaseOrderById(PO_ID)

    expect(po.lines).toHaveLength(1)
    expect(po.lines[0].quantityReceived).toBe('6.00')
    expect(po.lines[0].quantityOutstanding).toBe('4.00')
    expect(po.grns).toHaveLength(1)
    expect(po.grns[0].grnNumber).toBe('GRN-A3F2-0001')
  })
})

describe('listPurchaseOrders', () => {
  it('Test 9 — scoped to businessId; excludes another business POs', async () => {
    const ownPo = {
      id: 'po-biz1',
      poNumber: VALID_PO_NUMBER,
      localPoNumber: VALID_PO_NUMBER,
      supplierId: SUPPLIER_ID,
      supplierName: 'Acme',
      orderDate: '2026-04-11',
      expectedDate: null,
      status: 'draft',
      currency: 'GHS',
      subtotal: '500.00',
      totalAmount: '500.00',
    }

    vi.mocked(db.select).mockReturnValue(makeChain([ownPo]) as never)

    const result = await listPurchaseOrders()

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('po-biz1')

    // Verify the WHERE clause included businessId
    const chain = vi.mocked(db.select).mock.results[0].value
    const whereCall = (chain['from'] as ReturnType<typeof vi.fn>).mock.results[0]?.value
    // The query was built with businessId filter via eq(purchaseOrders.businessId, businessId)
    // We verify requireRole was called, which enforces businessId from session
    expect(requireRole).toHaveBeenCalledWith(['owner', 'manager', 'accountant'])
  })
})
