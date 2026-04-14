import { describe, it, expect, beforeEach, vi } from 'vitest'
import { localDb } from '@/db/local/dexie'
import type { DexieDeferredJournal, DexieOrder, DexieSyncQueueItem } from '@/db/local/dexie'

// ── Module mocks ───────────────────────────────────────────────────────────────

const mockNetworkAvailable = vi.fn()
vi.mock('@/lib/offline/network', () => ({
  isNetworkAvailable: () => mockNetworkAvailable(),
}))

// ── Helpers ────────────────────────────────────────────────────────────────────

function makePendingQueueItem(
  overrides: Partial<Omit<DexieSyncQueueItem, 'id'>> = {},
): Omit<DexieSyncQueueItem, 'id'> {
  return {
    tableName: 'orders',
    recordId: 'ord-001',
    operation: 'upsert',
    payload: { id: 'ord-001', businessId: 'biz-001' },
    createdAt: new Date().toISOString(),
    status: 'pending',
    attempts: 0,
    lastError: null,
    ...overrides,
  }
}

function makePendingJournal(
  sourceId: string,
  overrides: Partial<DexieDeferredJournal> = {},
): DexieDeferredJournal {
  return {
    id: `dj-${sourceId}`,
    businessId: 'biz-001',
    sourceTable: 'orders',
    sourceId,
    proposedEntry: {
      entryDate: '2026-04-14',
      description: 'Test sale',
      sourceType: 'order',
      lines: [
        { accountCode: '1001', debitAmount: 100, creditAmount: 0, currency: 'GHS', fxRate: 1 },
        { accountCode: '4001', debitAmount: 0, creditAmount: 100, currency: 'GHS', fxRate: 1 },
      ],
    },
    status: 'pending',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeSuccessResponse(results: unknown[]) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ results }),
  })
}

async function clearSyncTables() {
  await localDb.syncQueue.clear()
  await localDb.deferredJournals.clear()
  await localDb.orders.clear()
  await localDb.expenses.clear()
  await localDb.customers.clear()
}

// ── Note on isRunning guard ────────────────────────────────────────────────────
// startSyncProcessor sets isRunning=true, then resets it in a `finally` block
// once runDrainLoop() completes or returns. Since each test awaits the call to
// completion before the next test begins, isRunning is always false at test
// boundaries. No special teardown is required.

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('startSyncProcessor', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    mockNetworkAvailable.mockResolvedValue(true)
    await clearSyncTables()
  })

  // Test 9 (spec): Pending items are batched and POSTed to /api/sync with the
  // correct URL, method, Content-Type header, and body shape.
  it('POSTs pending items to /api/sync with the correct payload structure', async () => {
    const queueId = await localDb.syncQueue.add(
      makePendingQueueItem({
        tableName: 'orders',
        recordId: 'ord-struct-001',
        payload: { id: 'ord-struct-001', businessId: 'biz-001' },
      }),
    )

    const mockFetch = vi.fn().mockReturnValueOnce(
      makeSuccessResponse([
        {
          syncQueueId: queueId,
          recordId: 'ord-struct-001',
          success: true,
          journalEntryId: null,
        },
      ]),
    )
    vi.stubGlobal('fetch', mockFetch)

    const { startSyncProcessor } = await import('@/lib/offline/syncProcessor')
    await startSyncProcessor('biz-001')

    expect(mockFetch).toHaveBeenCalledTimes(1)

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/sync')
    expect(options.method).toBe('POST')
    expect((options.headers as Record<string, string>)['Content-Type']).toBe('application/json')

    const requestBody = JSON.parse(options.body as string) as {
      items: {
        syncQueueId: number
        tableName: string
        recordId: string
        operation: string
        payload: Record<string, unknown>
      }[]
    }
    expect(requestBody).toHaveProperty('items')
    expect(Array.isArray(requestBody.items)).toBe(true)
    expect(requestBody.items).toHaveLength(1)

    const sentItem = requestBody.items[0]
    expect(sentItem.syncQueueId).toBe(queueId)
    expect(sentItem.tableName).toBe('orders')
    expect(sentItem.recordId).toBe('ord-struct-001')
    expect(sentItem.operation).toBe('upsert')
    expect(sentItem.payload).toMatchObject({ id: 'ord-struct-001', businessId: 'biz-001' })
  })

  // Test 10 (spec): On a 200 response with success=true, the syncQueue item is
  // marked 'synced'.
  it('marks the syncQueue item as synced on a successful 200 response', async () => {
    const queueId = await localDb.syncQueue.add(
      makePendingQueueItem({
        tableName: 'customers',
        recordId: 'cust-synced-001',
      }),
    )

    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValueOnce(
        makeSuccessResponse([
          {
            syncQueueId: queueId,
            recordId: 'cust-synced-001',
            success: true,
            journalEntryId: null,
          },
        ]),
      ),
    )

    const { startSyncProcessor } = await import('@/lib/offline/syncProcessor')
    await startSyncProcessor('biz-001')

    const item = await localDb.syncQueue.get(queueId)
    expect(item).toBeDefined()
    expect(item!.status).toBe('synced')
  })

  // Test 11 (spec): On a network error (fetch throws), all in-flight items are
  // reverted to 'pending' and their attempt counter is incremented.
  it('reverts items to pending and increments attempts when fetch throws a network error', async () => {
    const queueId = await localDb.syncQueue.add(
      makePendingQueueItem({
        tableName: 'orders',
        recordId: 'ord-net-err',
        attempts: 0,
      }),
    )

    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')))

    const { startSyncProcessor } = await import('@/lib/offline/syncProcessor')
    await startSyncProcessor('biz-001')

    const item = await localDb.syncQueue.get(queueId)
    expect(item).toBeDefined()
    expect(item!.status).toBe('pending') // reverted, not stuck as 'syncing'
    expect(item!.attempts).toBe(1) // incremented from 0 to 1
    expect(item!.lastError).toBeTruthy()
  })

  // Test 12 (spec): After MAX_ATTEMPTS total failures, the item is permanently
  // marked 'failed' and not retried. Existing attempts=4 + 1 failure = 5 → 'failed'.
  it('marks the item failed when attempts reach MAX_ATTEMPTS on a network error', async () => {
    const queueId = await localDb.syncQueue.add(
      makePendingQueueItem({
        tableName: 'orders',
        recordId: 'ord-max-fail',
        attempts: 4, // one below MAX_ATTEMPTS (5)
      }),
    )

    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')))

    const { startSyncProcessor } = await import('@/lib/offline/syncProcessor')
    await startSyncProcessor('biz-001')

    const item = await localDb.syncQueue.get(queueId)
    expect(item).toBeDefined()
    expect(item!.status).toBe('failed') // permanently failed
    expect(item!.attempts).toBe(5)
  })

  // Test 13 (spec): When syncQueue has no pending items, fetch is never called.
  it('does not call fetch when there are no pending items in the syncQueue', async () => {
    // syncQueue is empty (cleared in beforeEach)
    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)

    const { startSyncProcessor } = await import('@/lib/offline/syncProcessor')
    await startSyncProcessor('biz-001')

    expect(mockFetch).not.toHaveBeenCalled()
  })

  // Test 14 (spec): When the server returns success=true with a journalEntryId,
  // the processor updates the source order's journalEntryId in Dexie and marks
  // the deferred journal as 'promoted'.
  it('updates order.journalEntryId in Dexie and promotes the deferred journal on success', async () => {
    const orderId = 'ord-journal-promo'

    // Seed the order with journalEntryId=null (pre-sync state)
    await localDb.orders.add({
      id: orderId,
      businessId: 'biz-001',
      orderNumber: 'ORD-JP-001',
      localOrderNumber: null,
      customerId: null,
      orderDate: '2026-04-14',
      status: 'fulfilled',
      paymentStatus: 'paid',
      subtotal: 100,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 100,
      amountPaid: 100,
      paymentMethod: 'cash',
      fxRate: null,
      notes: null,
      journalEntryId: null,
      aiGenerated: false,
      syncStatus: 'pending',
      updatedAt: new Date().toISOString(),
    } as DexieOrder)

    // Seed the pending deferred journal for this order
    await localDb.deferredJournals.add(makePendingJournal(orderId))

    // Seed the syncQueue entry
    const queueId = await localDb.syncQueue.add(
      makePendingQueueItem({
        tableName: 'orders',
        recordId: orderId,
      }),
    )

    // Server reports: success with a real journalEntryId
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValueOnce(
        makeSuccessResponse([
          {
            syncQueueId: queueId,
            recordId: orderId,
            success: true,
            journalEntryId: 'je-server-001',
          },
        ]),
      ),
    )

    const { startSyncProcessor } = await import('@/lib/offline/syncProcessor')
    await startSyncProcessor('biz-001')

    // Order in Dexie must carry the real server-assigned journalEntryId
    const order = await localDb.orders.get(orderId)
    expect(order).toBeDefined()
    expect(order!.journalEntryId).toBe('je-server-001')

    // Deferred journal must be marked 'promoted'
    const journal = await localDb.deferredJournals.get(`dj-${orderId}`)
    expect(journal).toBeDefined()
    expect(journal!.status).toBe('promoted')

    // SyncQueue item must be 'synced'
    const queueItem = await localDb.syncQueue.get(queueId)
    expect(queueItem!.status).toBe('synced')
  })
})
