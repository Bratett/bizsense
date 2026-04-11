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
  },
}))

import { getServerSession } from '@/lib/session'
import { db } from '@/db'
import {
  createCustomer,
  updateCustomer,
  deactivateCustomer,
  listCustomers,
  getCustomerById,
  type CustomerActionResult,
} from '../customers'

// ─── Mock helpers ────────────────────────────────────────────────────────────

const BUSINESS_ID = 'biz-test-001'
const USER_ID = 'user-test-001'

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

const initialState: CustomerActionResult = { success: false, error: '' }

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks()
  mockSession()
})

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('createCustomer', () => {
  it('Test 1 — inserts record with correct businessId on valid input', async () => {
    const CUSTOMER_ID = 'cust-new-001'

    // Phone uniqueness check → no match
    vi.mocked(db.select).mockReturnValue(makeChain([]) as never)

    // Insert → returning
    const insertValues = vi.fn(() => ({
      returning: vi.fn().mockResolvedValue([{ id: CUSTOMER_ID }]),
    }))
    vi.mocked(db.insert).mockReturnValue({ values: insertValues } as never)

    const fd = makeFormData({
      name: 'Ama Serwaa',
      phone: '0241234567',
      email: 'ama@test.com',
      location: 'Madina Market',
    })

    const result = await createCustomer(initialState, fd)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.customerId).toBe(CUSTOMER_ID)
    }

    // Verify insert was called with correct data
    expect(db.insert).toHaveBeenCalled()
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: BUSINESS_ID,
        name: 'Ama Serwaa',
        phone: '0241234567',
      }),
    )
  })

  it('Test 2 — rejects duplicate phone number', async () => {
    // Phone uniqueness check → existing customer found
    vi.mocked(db.select).mockReturnValue(makeChain([{ id: 'existing-cust' }]) as never)

    const fd = makeFormData({
      name: 'Kwame Asante',
      phone: '0241234567',
    })

    const result = await createCustomer(initialState, fd)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.fieldErrors?.phone).toContain('already exists')
    }

    // No insert should have been called
    expect(db.insert).not.toHaveBeenCalled()
  })

  it('Test 3 — rejects missing phone with validation error', async () => {
    const fd = makeFormData({ name: 'Ama Serwaa' })

    const result = await createCustomer(initialState, fd)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.fieldErrors?.phone).toContain('required')
    }

    expect(db.select).not.toHaveBeenCalled()
    expect(db.insert).not.toHaveBeenCalled()
  })
})

describe('deactivateCustomer', () => {
  it('Test 4 — sets isActive=false when no unpaid orders exist', async () => {
    let selectCallIdx = 0

    // Call 1: ownership check → customer found
    // Call 2: unpaid orders check → empty
    vi.mocked(db.select).mockImplementation(() => {
      const idx = selectCallIdx++
      if (idx === 0) return makeChain([{ id: 'cust-001' }]) as never
      return makeChain([]) as never
    })

    const setMock = vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    }))
    vi.mocked(db.update).mockReturnValue({ set: setMock } as never)

    const result = await deactivateCustomer('cust-001')

    expect(result.success).toBe(true)
    expect(db.update).toHaveBeenCalled()
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false }),
    )
  })

  it('Test 5 — blocks deactivation when unpaid orders exist', async () => {
    let selectCallIdx = 0

    // Call 1: ownership check → customer found
    // Call 2: unpaid orders → one found
    vi.mocked(db.select).mockImplementation(() => {
      const idx = selectCallIdx++
      if (idx === 0) return makeChain([{ id: 'cust-001' }]) as never
      return makeChain([{ id: 'order-unpaid' }]) as never
    })

    const result = await deactivateCustomer('cust-001')

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('unpaid invoice')
    }

    // No update should have been called
    expect(db.update).not.toHaveBeenCalled()
  })
})

describe('listCustomers', () => {
  it('Test 6 — search returns matching records scoped to businessId', async () => {
    const mockCustomers = [
      {
        id: 'cust-001',
        name: 'Ama Serwaa',
        phone: '0241234567',
        location: 'Madina',
        isActive: true,
        creditLimit: '0',
      },
    ]

    vi.mocked(db.select).mockReturnValue(makeChain(mockCustomers) as never)

    const result = await listCustomers({ search: 'Ama' })

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Ama Serwaa')
    expect(db.select).toHaveBeenCalled()
  })
})

describe('getCustomerById', () => {
  it('Test 7 — returns customer with computed outstandingBalance', async () => {
    let selectCallIdx = 0

    const customerRow = {
      id: 'cust-001',
      businessId: BUSINESS_ID,
      name: 'Kofi Mensah',
      phone: '0201234567',
      email: null,
      location: 'Tema',
      momoNumber: null,
      creditLimit: '500.00',
      notes: null,
      isActive: true,
      createdAt: new Date('2026-01-15'),
      updatedAt: new Date('2026-01-15'),
    }

    // Call 1: customer fetch → found
    // Call 2: balance computation → SUM result
    vi.mocked(db.select).mockImplementation(() => {
      const idx = selectCallIdx++
      if (idx === 0) return makeChain([customerRow]) as never
      return makeChain([{ outstanding: '750.00' }]) as never
    })

    const result = await getCustomerById('cust-001')

    expect(result.name).toBe('Kofi Mensah')
    expect(result.phone).toBe('0201234567')
    expect(result.outstandingBalance).toBe(750)
    expect(result.creditLimit).toBe('500.00')
  })
})
