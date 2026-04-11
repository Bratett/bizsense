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
  },
}))

import { requireRole } from '@/lib/auth/requireRole'
import { db } from '@/db'
import {
  createSupplier,
  updateSupplier,
  deactivateSupplier,
  listSuppliers,
  getSupplierById,
  type SupplierActionResult,
} from '../suppliers'

// ─── Mock helpers ────────────────────────────────────────────────────────────

const BUSINESS_ID = 'biz-test-001'
const USER_ID = 'user-test-001'

function mockRole() {
  vi.mocked(requireRole).mockResolvedValue({
    id: USER_ID,
    email: 'owner@test.com',
    businessId: BUSINESS_ID,
    role: 'owner',
    fullName: 'Test Owner',
  })
}

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    fd.set(key, value)
  }
  return fd
}

/**
 * Build a fluent Drizzle chain mock that resolves to the given result.
 * Supports: .from(), .where(), .limit(), .orderBy(), and is then-able.
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
    orderBy: vi.fn(() => chain),
  }
  return chain
}

const initialState: SupplierActionResult = { success: false, error: '' }

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks()
  mockRole()
})

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('createSupplier', () => {
  it('Test 1 — inserts record with correct businessId and creditTermsDays', async () => {
    const SUPPLIER_ID = 'sup-new-001'

    // Phone uniqueness check → no match
    vi.mocked(db.select).mockReturnValue(makeChain([]) as never)

    // Insert → returning
    const insertValues = vi.fn(() => ({
      returning: vi.fn().mockResolvedValue([{ id: SUPPLIER_ID }]),
    }))
    vi.mocked(db.insert).mockReturnValue({ values: insertValues } as never)

    const fd = makeFormData({
      name: 'Accra Supplies Ltd',
      phone: '0241234567',
      email: 'info@accrasupplies.com',
      location: 'Tema Industrial Area',
      bankName: 'GCB Bank',
      bankAccount: '1234567890',
      creditTermsDays: '30',
    })

    const result = await createSupplier(initialState, fd)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.supplierId).toBe(SUPPLIER_ID)
    }

    expect(db.insert).toHaveBeenCalled()
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: BUSINESS_ID,
        name: 'Accra Supplies Ltd',
        phone: '0241234567',
        creditTermsDays: 30,
      }),
    )
  })

  it('Test 2 — rejects duplicate phone number', async () => {
    // Phone uniqueness check → existing supplier found
    vi.mocked(db.select).mockReturnValue(makeChain([{ id: 'existing-sup' }]) as never)

    const fd = makeFormData({
      name: 'Kumasi Traders',
      phone: '0241234567',
    })

    const result = await createSupplier(initialState, fd)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.fieldErrors?.phone).toContain('already exists')
    }

    expect(db.insert).not.toHaveBeenCalled()
  })
})

describe('deactivateSupplier', () => {
  it('Test 3 — blocks deactivation when outstanding AP exists', async () => {
    let selectCallIdx = 0

    // Call 1: ownership check → found
    // Call 2: getSupplierApBalance — totalOwed (GRNs) → 5000
    // Call 3: getSupplierApBalance — totalPaid (payments) → 0
    // Call 4: open POs → (should not reach here)
    vi.mocked(db.select).mockImplementation(() => {
      const idx = selectCallIdx++
      if (idx === 0) return makeChain([{ id: 'sup-001' }]) as never
      if (idx === 1) return makeChain([{ totalOwed: '5000.00' }]) as never
      if (idx === 2) return makeChain([{ totalPaid: '0' }]) as never
      return makeChain([]) as never
    })

    const result = await deactivateSupplier('sup-001')

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('outstanding balance')
      expect(result.error).toContain('GHS')
    }

    expect(db.update).not.toHaveBeenCalled()
  })

  it('Test 4 — blocks deactivation when open POs exist', async () => {
    let selectCallIdx = 0

    // Call 1: ownership check → found
    // Call 2: getSupplierApBalance — totalOwed → 0
    // Call 3: getSupplierApBalance — totalPaid → 0
    // Call 4: open POs → one found
    vi.mocked(db.select).mockImplementation(() => {
      const idx = selectCallIdx++
      if (idx === 0) return makeChain([{ id: 'sup-001' }]) as never
      if (idx === 1) return makeChain([{ totalOwed: '0' }]) as never
      if (idx === 2) return makeChain([{ totalPaid: '0' }]) as never
      return makeChain([{ id: 'po-open-001' }]) as never
    })

    const result = await deactivateSupplier('sup-001')

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('open purchase order')
    }

    expect(db.update).not.toHaveBeenCalled()
  })

  it('Test 5 — sets isActive=false when no balance and no open POs', async () => {
    let selectCallIdx = 0

    // Call 1: ownership check → found
    // Call 2: getSupplierApBalance — totalOwed → 0
    // Call 3: getSupplierApBalance — totalPaid → 0
    // Call 4: open POs → empty
    vi.mocked(db.select).mockImplementation(() => {
      const idx = selectCallIdx++
      if (idx === 0) return makeChain([{ id: 'sup-001' }]) as never
      if (idx === 1) return makeChain([{ totalOwed: '0' }]) as never
      if (idx === 2) return makeChain([{ totalPaid: '0' }]) as never
      return makeChain([]) as never
    })

    const setMock = vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    }))
    vi.mocked(db.update).mockReturnValue({ set: setMock } as never)

    const result = await deactivateSupplier('sup-001')

    expect(result.success).toBe(true)
    expect(db.update).toHaveBeenCalled()
    expect(setMock).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }))
  })
})

describe('listSuppliers', () => {
  it('Test 6 — returns records scoped to businessId', async () => {
    const mockSuppliers = [
      {
        id: 'sup-001',
        name: 'Accra Supplies Ltd',
        phone: '0241234567',
        location: 'Tema',
        isActive: true,
        creditTermsDays: 30,
        outstandingPayable: '0',
        openPoCount: '0',
      },
    ]

    vi.mocked(db.select).mockReturnValue(makeChain(mockSuppliers) as never)

    const result = await listSuppliers()

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Accra Supplies Ltd')
    expect(result[0].outstandingPayable).toBe(0)
    expect(db.select).toHaveBeenCalled()
  })

  it('Test 7 — search by name returns matching records', async () => {
    const mockSuppliers = [
      {
        id: 'sup-002',
        name: 'Kumasi Traders',
        phone: '0201234567',
        location: 'Kumasi',
        isActive: true,
        creditTermsDays: 0,
        outstandingPayable: '500.00',
        openPoCount: '1',
      },
    ]

    vi.mocked(db.select).mockReturnValue(makeChain(mockSuppliers) as never)

    const result = await listSuppliers({ search: 'Kumasi' })

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Kumasi Traders')
    expect(result[0].outstandingPayable).toBe(500)
    expect(result[0].openPoCount).toBe(1)
    expect(db.select).toHaveBeenCalled()
  })
})

describe('getSupplierById', () => {
  it('Test 8 — returns supplier with computed outstandingPayable', async () => {
    let selectCallIdx = 0

    const supplierRow = {
      id: 'sup-001',
      businessId: BUSINESS_ID,
      name: 'Accra Supplies Ltd',
      phone: '0241234567',
      email: 'info@accrasupplies.com',
      location: 'Tema',
      momoNumber: null,
      bankName: 'GCB Bank',
      bankAccount: '1234567890',
      creditTermsDays: 30,
      notes: null,
      isActive: true,
      createdAt: new Date('2026-01-15'),
      updatedAt: new Date('2026-01-15'),
    }

    // Call 1: supplier fetch → found
    // Call 2: getSupplierApBalance — totalOwed (GRNs) → 2500
    // Call 3: getSupplierApBalance — totalPaid (payments) → 0
    vi.mocked(db.select).mockImplementation(() => {
      const idx = selectCallIdx++
      if (idx === 0) return makeChain([supplierRow]) as never
      if (idx === 1) return makeChain([{ totalOwed: '2500.00' }]) as never
      return makeChain([{ totalPaid: '0' }]) as never
    })

    const result = await getSupplierById('sup-001')

    expect(result.name).toBe('Accra Supplies Ltd')
    expect(result.outstandingPayable).toBe(2500)
    expect(result.bankName).toBe('GCB Bank')
    expect(result.creditTermsDays).toBe(30)
  })
})
