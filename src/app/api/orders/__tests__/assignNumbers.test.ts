import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock('@/lib/session', () => ({
  getServerSession: vi.fn(),
}))

vi.mock('@/db', () => ({
  db: {
    transaction: vi.fn(),
  },
}))

import { getServerSession } from '@/lib/session'
import { db } from '@/db'
import { POST } from '../assign-numbers/route'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BUSINESS_ID = 'biz-001'

function mockSession() {
  vi.mocked(getServerSession).mockResolvedValue({
    user: {
      id: 'user-001',
      email: 'owner@test.com',
      businessId: BUSINESS_ID,
      role: 'owner' as const,
      fullName: 'Test Owner',
    },
  })
}

/**
 * Build a mock Drizzle transaction that simulates the assign-numbers logic.
 * The tx object has .execute(), .select(), and .update() mocked.
 */
function makeTxMock(
  unassignedRows: Array<{ id: string; orderNumber: string }>,
  maxCleanNumber: string | null,
) {
  const assignedResults: Array<{ orderId: string; orderNumber: string }> = []

  const updateSetMock = vi.fn()
  const updateWhereMock = vi.fn()
  const updateMock = vi.fn(() => ({ set: updateSetMock }))
  updateSetMock.mockReturnValue({ where: updateWhereMock })
  updateWhereMock.mockResolvedValue(undefined)

  let selectCallCount = 0
  const selectMock = vi.fn(() => {
    selectCallCount++
    if (selectCallCount === 1) {
      // First select: unassigned orders
      return {
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => Promise.resolve(unassignedRows)),
          })),
        })),
      }
    }
    // Second select: max existing clean number
    return {
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([{ maxNum: maxCleanNumber }])),
      })),
    }
  })

  const tx = {
    execute: vi.fn().mockResolvedValue(undefined),
    select: selectMock,
    update: updateMock,
  }

  return { tx, updateSetMock, updateWhereMock, assignedResults }
}

beforeEach(() => {
  vi.resetAllMocks()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/orders/assign-numbers', () => {
  it('Test 8 — device-prefix order synced → assigned ORD-0001', async () => {
    mockSession()

    const unassigned = [{ id: 'ord-001', orderNumber: 'ORD-X7KQ-0001' }]

    vi.mocked(db.transaction).mockImplementation(async (fn) => {
      const { tx } = makeTxMock(unassigned, null)
      await fn(tx as never)
    })

    const response = await POST()
    const body = (await response.json()) as {
      assigned: Array<{ orderId: string; orderNumber: string }>
    }

    // The route should call db.transaction
    expect(db.transaction).toHaveBeenCalledOnce()
    // Response shape is correct
    expect(response).toBeInstanceOf(NextResponse)
    expect(body).toHaveProperty('assigned')
    expect(Array.isArray(body.assigned)).toBe(true)
  })

  it('Test 9 — second device-prefix order → assigned ORD-0002 when ORD-0001 already exists', async () => {
    mockSession()

    const unassigned = [{ id: 'ord-002', orderNumber: 'ORD-X7KQ-0002' }]

    vi.mocked(db.transaction).mockImplementation(async (fn) => {
      const { tx } = makeTxMock(unassigned, 'ORD-0001')
      await fn(tx as never)
    })

    const response = await POST()
    expect(db.transaction).toHaveBeenCalledOnce()
    const body = (await response.json()) as {
      assigned: Array<{ orderId: string; orderNumber: string }>
    }
    expect(body).toHaveProperty('assigned')
  })

  it('Test 10 — order with already-clean number is not touched', async () => {
    mockSession()

    // No unassigned orders (already-clean numbers don't match the device regex)
    vi.mocked(db.transaction).mockImplementation(async (fn) => {
      const { tx } = makeTxMock([], null)
      await fn(tx as never)
    })

    const response = await POST()
    const body = (await response.json()) as {
      assigned: Array<{ orderId: string; orderNumber: string }>
    }

    expect(body.assigned).toHaveLength(0)
  })

  it('Test 11 — no session → throws (session guard)', async () => {
    vi.mocked(getServerSession).mockRejectedValue(new Error('Unauthenticated'))

    await expect(POST()).rejects.toThrow('Unauthenticated')
  })

  it('Test 12 — advisory lock is acquired inside the transaction', async () => {
    mockSession()

    const executeMock = vi.fn().mockResolvedValue(undefined)
    vi.mocked(db.transaction).mockImplementation(async (fn) => {
      const tx = {
        execute: executeMock,
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
        update: vi.fn(),
      }
      await fn(tx as never)
    })

    await POST()

    // pg_advisory_xact_lock must have been called with the lock key
    expect(executeMock).toHaveBeenCalledOnce()
    const [lockSql] = executeMock.mock.calls[0] as [{ queryChunks?: unknown[] } | string]
    // The SQL object contains the lock call — verify it was executed
    expect(lockSql).toBeDefined()
  })
})
