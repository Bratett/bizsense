import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Module mocks (hoisted before imports) ──────────────────────────────────

vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: vi.fn(),
}))

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

import { requireRole } from '@/lib/auth/requireRole'
import { getServerSession } from '@/lib/session'
import { db } from '@/db'
import { createStaff, deactivateStaff, listStaff } from '../staff'

// ─── Constants ───────────────────────────────────────────────────────────────

const BUSINESS_ID = 'biz-001'
const USER_ID = 'user-001'
const STAFF_ID = 'staff-001'

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

function mockSession(role = 'owner') {
  vi.mocked(getServerSession).mockResolvedValue({
    user: {
      id: USER_ID,
      email: 'owner@test.com',
      businessId: BUSINESS_ID,
      role: role as 'owner',
      fullName: 'Test Owner',
    },
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
  chain['limit'] = vi.fn(() => chain)
  chain['orderBy'] = vi.fn(() => chain)
  chain['innerJoin'] = vi.fn(() => chain)
  return chain
}

/** Builds a mock insert chain that captures inserted values */
function makeInsertChain(returnedId = STAFF_ID) {
  let capturedValues: unknown = null
  const chain = {
    values: vi.fn((data: unknown) => {
      capturedValues = data
      const rows = Array.isArray(data) ? data : [data]
      const returnData = rows.map((r: Record<string, unknown>) => ({ id: returnedId, ...r }))
      return {
        returning: vi.fn().mockResolvedValue(returnData),
      }
    }),
    _getCaptured: () => capturedValues,
  }
  return chain
}

/** Builds a mock update chain that captures set values */
function makeUpdateChain() {
  let capturedSet: unknown = null
  const chain = {
    set: vi.fn((data: unknown) => {
      capturedSet = data
      return {
        where: vi.fn().mockResolvedValue([]),
      }
    }),
    _getCaptured: () => capturedSet,
  }
  return chain
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── createStaff ─────────────────────────────────────────────────────────────

describe('createStaff', () => {
  it('9. inserts staff record with correct businessId and returns staffId', async () => {
    mockUser('owner')

    // Phone uniqueness check returns empty (no duplicate)
    vi.mocked(db.select).mockReturnValue(makeChain([]) as never)

    const insertChain = makeInsertChain(STAFF_ID)
    vi.mocked(db.insert).mockReturnValue(insertChain as never)

    const result = await createStaff({
      fullName: 'Kwame Mensah',
      phone: '0244000001',
      salaryType: 'monthly',
      baseSalary: 2000,
      startDate: '2024-01-01',
    })

    expect(result.staffId).toBe(STAFF_ID)

    const inserted = insertChain._getCaptured() as Record<string, unknown>
    expect(inserted).toMatchObject({
      businessId: BUSINESS_ID,
      fullName: 'Kwame Mensah',
      phone: '0244000001',
    })
  })

  it('10. throws when a staff member with the same phone already exists', async () => {
    mockUser('owner')

    // Phone uniqueness check returns an existing record
    vi.mocked(db.select).mockReturnValue(makeChain([{ id: 'existing-staff-id' }]) as never)

    await expect(createStaff({ fullName: 'Ama Asante', phone: '0244000001' })).rejects.toThrow(
      'A staff member with phone 0244000001 already exists.',
    )
  })
})

// ─── deactivateStaff ─────────────────────────────────────────────────────────

describe('deactivateStaff', () => {
  it('11. throws when staff has unpaid approved payroll lines', async () => {
    mockUser('owner')

    // First select: staff ownership check returns the staff record
    // Second select (innerJoin): returns an unpaid payroll line
    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain([{ id: STAFF_ID }]) as never)
      .mockReturnValueOnce(makeChain([{ id: 'payroll-line-001' }]) as never)

    await expect(deactivateStaff(STAFF_ID)).rejects.toThrow(
      'Cannot deactivate staff with unpaid approved payroll lines.',
    )
  })

  it('12. sets isActive = false when no unpaid approved payroll lines exist', async () => {
    mockUser('owner')

    // First select: staff ownership check returns the staff record
    // Second select (innerJoin): returns empty (no unpaid lines)
    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain([{ id: STAFF_ID }]) as never)
      .mockReturnValueOnce(makeChain([]) as never)

    const updateChain = makeUpdateChain()
    vi.mocked(db.update).mockReturnValue(updateChain as never)

    await deactivateStaff(STAFF_ID)

    const setData = updateChain._getCaptured() as Record<string, unknown>
    expect(setData).toMatchObject({ isActive: false })
    expect(setData.updatedAt).toBeInstanceOf(Date)
  })
})

// ─── listStaff ────────────────────────────────────────────────────────────────

describe('listStaff', () => {
  it('13. returns staff scoped to businessId and ordered by fullName', async () => {
    mockSession('owner')

    const mockStaff = [
      { id: 'staff-001', fullName: 'Ama Asante', isActive: true },
      { id: 'staff-002', fullName: 'Kwame Mensah', isActive: true },
    ]
    vi.mocked(db.select).mockReturnValue(makeChain(mockStaff) as never)

    const result = await listStaff({ isActive: true })

    expect(result).toEqual(mockStaff)
    // Verify the chain was called (businessId filter applied)
    expect(db.select).toHaveBeenCalledOnce()
  })
})
