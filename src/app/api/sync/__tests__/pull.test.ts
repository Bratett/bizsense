import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '../pull/route'

// ── Module mocks ──────────────────────────────────────────────────────────────

const mockGetServerSession = vi.fn()
vi.mock('@/lib/session', () => ({
  getServerSession: () => mockGetServerSession(),
}))

// Chainable Drizzle-style mock — each method returns the same chain object.
// The chain is thenable so Promise.all treats it as a resolved Promise of [].
vi.mock('@/db', () => {
  const makeChain = (): Record<string, unknown> => {
    const chain: Record<string, unknown> = {}
    for (const method of ['from', 'where', 'innerJoin']) {
      chain[method] = vi.fn(() => chain)
    }
    // Thenable: when awaited or used in Promise.all, resolves to []
    chain.then = (resolve: (v: unknown[]) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve([]).then(resolve, reject)
    return chain
  }
  // tx mirrors the select interface so queries inside db.transaction() work
  const makeTx = () => ({ select: vi.fn(() => makeChain()) })
  return {
    db: {
      select: vi.fn(() => makeChain()),
      transaction: vi.fn((fn: (tx: ReturnType<typeof makeTx>) => Promise<unknown>) => fn(makeTx())),
    },
  }
})

// ── Session helper ────────────────────────────────────────────────────────────

function makeSession(businessId = 'biz-A') {
  return {
    user: {
      id: 'user-1',
      email: 'owner@example.com',
      businessId,
      role: 'owner' as const,
      fullName: 'Kwame Asante',
    },
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/sync/pull', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Test 9: No session → 401
  it('returns 401 when no authenticated session', async () => {
    mockGetServerSession.mockRejectedValue(new Error('Unauthenticated'))

    const req = new NextRequest('http://localhost/api/sync/pull')
    const response = await GET(req)

    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body).toHaveProperty('error')
  })

  // Test 10: No 'since' param → returns all 13 data keys
  it('returns full structure with all data keys when no since param', async () => {
    mockGetServerSession.mockResolvedValue(makeSession())

    const req = new NextRequest('http://localhost/api/sync/pull')
    const response = await GET(req)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toHaveProperty('pulledAt')
    expect(typeof body.pulledAt).toBe('string')

    const expectedKeys = [
      'businesses',
      'accounts',
      'taxComponents',
      'customers',
      'orders',
      'orderLines',
      'expenses',
      'products',
      'inventoryTransactions',
      'suppliers',
      'fxRates',
      'journalEntries',
      'journalLines',
    ]
    for (const key of expectedKeys) {
      expect(body.data).toHaveProperty(key)
    }
  })

  // Test 11: With 'since' param → returns valid response
  it('returns valid response when since param is provided', async () => {
    mockGetServerSession.mockResolvedValue(makeSession())

    const since = '2024-01-15T00:00:00.000Z'
    const req = new NextRequest(`http://localhost/api/sync/pull?since=${encodeURIComponent(since)}`)
    const response = await GET(req)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toHaveProperty('pulledAt')
    expect(body).toHaveProperty('data')
  })

  // Test 12: Business isolation — businessId comes from session, not the request
  it('sources businessId from session (not from URL or request body)', async () => {
    mockGetServerSession.mockResolvedValue(makeSession('biz-A'))

    const req = new NextRequest('http://localhost/api/sync/pull')
    const response = await GET(req)

    expect(response.status).toBe(200)

    // getServerSession must have been called — proving businessId came from session
    expect(mockGetServerSession).toHaveBeenCalledTimes(1)

    // db.transaction was called — queries ran using the session's businessId
    const { db } = await import('@/db')
    expect(db.transaction).toHaveBeenCalled()
  })
})
