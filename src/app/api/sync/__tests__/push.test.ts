import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '../route'

// ── Module mocks ───────────────────────────────────────────────────────────────

const mockGetServerSession = vi.fn()
vi.mock('@/lib/session', () => ({
  getServerSession: () => mockGetServerSession(),
}))

// db.select().from().where() → thenable that resolves to mockAccountRows (mutated per-test)
// db.insert().values().onConflictDoUpdate() → resolves to []
let mockAccountRows: { id: string; code: string }[] = []

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve(mockAccountRows).then(resolve, reject),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoUpdate: vi.fn(() => Promise.resolve([])),
      })),
    })),
  },
}))

// atomicTransactionWrite: validates that lines balance (mirrors postJournalEntry behaviour).
// If balanced → calls callback(mockTx, 'je-test-001') and returns 'je-test-001'.
// If imbalanced → throws.
vi.mock('@/lib/atomic', () => ({
  atomicTransactionWrite: vi.fn(
    async (
      journalInput: { lines: { debitAmount: number; creditAmount: number }[] },
      callback: (tx: unknown, id: string) => Promise<unknown>,
    ) => {
      const dr = journalInput.lines.reduce((s, l) => s + l.debitAmount, 0)
      const cr = journalInput.lines.reduce((s, l) => s + l.creditAmount, 0)
      if (Math.abs(dr - cr) > 0.001) {
        throw new Error(`Journal entry does not balance: debits=${dr}, credits=${cr}`)
      }
      const mockTx = {
        insert: vi.fn(() => ({
          values: vi.fn(() => ({
            onConflictDoUpdate: vi.fn(() => Promise.resolve([])),
          })),
        })),
      }
      await callback(mockTx, 'je-test-001')
      return 'je-test-001'
    },
  ),
}))

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeSession(businessId = 'biz-A', userId = 'user-1') {
  return {
    user: {
      id: userId,
      email: 'owner@example.com',
      businessId,
      role: 'owner' as const,
      fullName: 'Kwame Asante',
    },
  }
}

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// Balanced journal: two lines that sum to equal debits and credits
const balancedJournal = {
  deferredJournalId: 'dj-001',
  proposedEntry: {
    entryDate: '2026-04-14',
    description: 'Test sale',
    sourceType: 'order',
    lines: [
      { accountCode: '1001', debitAmount: 100, creditAmount: 0, currency: 'GHS', fxRate: 1 },
      { accountCode: '4001', debitAmount: 0, creditAmount: 100, currency: 'GHS', fxRate: 1 },
    ],
  },
}

// Imbalanced journal: debit 100 vs credit 50
const imbalancedJournal = {
  deferredJournalId: 'dj-002',
  proposedEntry: {
    entryDate: '2026-04-14',
    description: 'Broken sale',
    sourceType: 'order',
    lines: [
      { accountCode: '1001', debitAmount: 100, creditAmount: 0, currency: 'GHS', fxRate: 1 },
      { accountCode: '4001', debitAmount: 0, creditAmount: 50, currency: 'GHS', fxRate: 1 },
    ],
  },
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('POST /api/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAccountRows = []
  })

  // Test 1: No session → 401
  it('returns 401 when getServerSession throws', async () => {
    mockGetServerSession.mockRejectedValue(new Error('Unauthenticated'))

    const res = await POST(makeRequest({ items: [] }))

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  // Test 2: payload.businessId ≠ session businessId → rejected with mismatch error
  it("rejects any item whose payload.businessId does not match the session's businessId", async () => {
    mockGetServerSession.mockResolvedValue(makeSession('biz-A'))

    const res = await POST(
      makeRequest({
        items: [
          {
            syncQueueId: 1,
            tableName: 'customers',
            recordId: 'cust-001',
            operation: 'upsert',
            payload: { businessId: 'attacker-id', name: 'Hacker' },
          },
        ],
      }),
    )

    expect(res.status).toBe(200)
    const { results } = await res.json()
    expect(results).toHaveLength(1)
    expect(results[0].success).toBe(false)
    expect(results[0].error).toContain('Business ID mismatch')
    expect(results[0].syncQueueId).toBe(1)
    expect(results[0].recordId).toBe('cust-001')
  })

  // Test 3: Valid order upsert without deferredJournal → success, journalEntryId=null
  it('processes a plain order upsert and returns success with journalEntryId=null', async () => {
    mockGetServerSession.mockResolvedValue(makeSession('biz-A'))

    const res = await POST(
      makeRequest({
        items: [
          {
            syncQueueId: 2,
            tableName: 'orders',
            recordId: 'ord-001',
            operation: 'upsert',
            payload: {
              businessId: 'biz-A',
              orderNumber: 'ORD-TEST-0001',
              orderDate: '2026-04-14',
              status: 'fulfilled',
              paymentStatus: 'paid',
              amountPaid: '100',
            },
          },
        ],
      }),
    )

    expect(res.status).toBe(200)
    const { results } = await res.json()
    expect(results).toHaveLength(1)
    expect(results[0].success).toBe(true)
    expect(results[0].journalEntryId).toBeNull()
    expect(results[0].syncQueueId).toBe(2)
    expect(results[0].recordId).toBe('ord-001')

    const { db } = await import('@/db')
    expect(db.insert).toHaveBeenCalled()
  })

  // Test 4: Same record sent twice → onConflictDoUpdate fires both times, no error
  it('handles the same record upserted twice without error (onConflictDoUpdate)', async () => {
    const item = {
      syncQueueId: 3,
      tableName: 'orders',
      recordId: 'ord-dupe',
      operation: 'upsert',
      payload: {
        businessId: 'biz-A',
        orderNumber: 'ORD-DUPE-001',
        orderDate: '2026-04-14',
        status: 'fulfilled',
        paymentStatus: 'paid',
        amountPaid: '50',
      },
    }

    // First POST
    mockGetServerSession.mockResolvedValue(makeSession('biz-A'))
    const res1 = await POST(makeRequest({ items: [item] }))
    expect(res1.status).toBe(200)
    expect((await res1.json()).results[0].success).toBe(true)

    // Second POST — same record id, conflict scenario handled by onConflictDoUpdate
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue(makeSession('biz-A'))
    const res2 = await POST(makeRequest({ items: [{ ...item, syncQueueId: 4 }] }))
    expect(res2.status).toBe(200)
    expect((await res2.json()).results[0].success).toBe(true)

    const { db } = await import('@/db')
    expect(db.insert).toHaveBeenCalled()
  })

  // Test 5: Order + balanced deferredJournal → success, journalEntryId returned
  it('promotes a balanced deferred journal and returns the journalEntryId', async () => {
    mockGetServerSession.mockResolvedValue(makeSession('biz-A'))
    mockAccountRows = [
      { id: 'acc-1001', code: '1001' },
      { id: 'acc-4001', code: '4001' },
    ]

    const res = await POST(
      makeRequest({
        items: [
          {
            syncQueueId: 5,
            tableName: 'orders',
            recordId: 'ord-je-001',
            operation: 'upsert',
            payload: {
              businessId: 'biz-A',
              orderNumber: 'ORD-JE-001',
              orderDate: '2026-04-14',
              status: 'fulfilled',
              paymentStatus: 'paid',
              amountPaid: '100',
            },
            deferredJournal: balancedJournal,
          },
        ],
      }),
    )

    expect(res.status).toBe(200)
    const { results } = await res.json()
    expect(results).toHaveLength(1)
    expect(results[0].success).toBe(true)
    expect(results[0].journalEntryId).toBe('je-test-001')
    expect(results[0].syncQueueId).toBe(5)

    const { atomicTransactionWrite } = await import('@/lib/atomic')
    expect(vi.mocked(atomicTransactionWrite)).toHaveBeenCalledTimes(1)
  })

  // Test 6: Order + imbalanced deferredJournal (debit 100 ≠ credit 50) → failure
  it('returns success=false when the deferred journal lines do not balance', async () => {
    mockGetServerSession.mockResolvedValue(makeSession('biz-A'))
    mockAccountRows = [
      { id: 'acc-1001', code: '1001' },
      { id: 'acc-4001', code: '4001' },
    ]

    const res = await POST(
      makeRequest({
        items: [
          {
            syncQueueId: 6,
            tableName: 'orders',
            recordId: 'ord-imbalanced',
            operation: 'upsert',
            payload: {
              businessId: 'biz-A',
              orderNumber: 'ORD-IMB-001',
              orderDate: '2026-04-14',
              status: 'fulfilled',
              paymentStatus: 'paid',
              amountPaid: '100',
            },
            deferredJournal: imbalancedJournal,
          },
        ],
      }),
    )

    expect(res.status).toBe(200)
    const { results } = await res.json()
    expect(results).toHaveLength(1)
    expect(results[0].success).toBe(false)
    expect(results[0].error).toContain('balance')
    expect(results[0].syncQueueId).toBe(6)
  })

  // Test 7: deferredJournal references account code '9999' not in the DB → failure
  it('returns success=false when a deferred journal references an unknown account code', async () => {
    mockGetServerSession.mockResolvedValue(makeSession('biz-A'))
    // Only '1001' exists — '9999' is not found
    mockAccountRows = [{ id: 'acc-1001', code: '1001' }]

    const res = await POST(
      makeRequest({
        items: [
          {
            syncQueueId: 7,
            tableName: 'orders',
            recordId: 'ord-badacc',
            operation: 'upsert',
            payload: {
              businessId: 'biz-A',
              orderNumber: 'ORD-BADACC-001',
              orderDate: '2026-04-14',
              status: 'fulfilled',
              paymentStatus: 'paid',
              amountPaid: '100',
            },
            deferredJournal: {
              deferredJournalId: 'dj-unknown',
              proposedEntry: {
                entryDate: '2026-04-14',
                description: 'Sale with unknown account',
                sourceType: 'order',
                lines: [
                  // '1001' exists; '9999' does not
                  {
                    accountCode: '1001',
                    debitAmount: 100,
                    creditAmount: 0,
                    currency: 'GHS',
                    fxRate: 1,
                  },
                  {
                    accountCode: '9999',
                    debitAmount: 0,
                    creditAmount: 100,
                    currency: 'GHS',
                    fxRate: 1,
                  },
                ],
              },
            },
          },
        ],
      }),
    )

    expect(res.status).toBe(200)
    const { results } = await res.json()
    expect(results).toHaveLength(1)
    expect(results[0].success).toBe(false)
    expect(results[0].error).toContain('9999')
    expect(results[0].error).toContain('not found')
  })

  // Test 8: Mixed batch — first item succeeds, second has unsupported table → both in results
  it('returns both a success and a failure result in a mixed batch', async () => {
    mockGetServerSession.mockResolvedValue(makeSession('biz-A'))

    const res = await POST(
      makeRequest({
        items: [
          {
            syncQueueId: 8,
            tableName: 'customers',
            recordId: 'cust-batch-001',
            operation: 'upsert',
            payload: {
              businessId: 'biz-A',
              name: 'Abena Boateng',
              phone: '0244000000',
            },
          },
          {
            syncQueueId: 9,
            tableName: 'unsupported_table',
            recordId: 'rec-999',
            operation: 'upsert',
            payload: { businessId: 'biz-A' },
          },
        ],
      }),
    )

    expect(res.status).toBe(200)
    const { results } = await res.json()
    expect(results).toHaveLength(2)

    const first = results.find((r: { syncQueueId: number }) => r.syncQueueId === 8)
    const second = results.find((r: { syncQueueId: number }) => r.syncQueueId === 9)

    expect(first.success).toBe(true)
    expect(first.journalEntryId).toBeNull()

    expect(second.success).toBe(false)
    expect(second.error).toContain('Unsupported table')
  })
})
