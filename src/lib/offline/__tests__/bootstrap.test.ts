import { describe, it, expect, beforeEach, vi } from 'vitest'
import { localDb, type DexieCustomer } from '@/db/local/dexie'
import { bootstrapLocalData, bulkUpsertWithConflictResolution } from '@/lib/offline/bootstrap'

// ── Fetch mock ────────────────────────────────────────────────────────────────

const mockFetch = vi.fn()
global.fetch = mockFetch

function makeSuccessResponse(overrides: Record<string, unknown> = {}) {
  return Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        pulledAt: new Date().toISOString(),
        data: {
          businesses: [],
          businessSettings: [],
          accounts: [],
          taxComponents: [],
          customers: [],
          orders: [],
          orderLines: [],
          expenses: [],
          products: [],
          inventoryTransactions: [],
          suppliers: [],
          fxRates: [],
          journalEntries: [],
          journalLines: [],
          ...overrides,
        },
      }),
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCustomer(overrides: Partial<DexieCustomer> = {}): DexieCustomer {
  return {
    id: 'cust-001',
    businessId: 'biz-001',
    name: 'Akua Mensah',
    phone: '0241234567',
    email: null,
    location: null,
    momoNumber: null,
    creditLimit: 0,
    paymentTermsDays: 30,
    isActive: true,
    syncStatus: 'synced',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

async function clearAllTables() {
  await Promise.all([
    localDb.meta.clear(),
    localDb.businesses.clear(),
    localDb.businessSettings.clear(),
    localDb.accounts.clear(),
    localDb.taxComponents.clear(),
    localDb.customers.clear(),
    localDb.orders.clear(),
    localDb.orderLines.clear(),
    localDb.expenses.clear(),
    localDb.products.clear(),
    localDb.inventoryTransactions.clear(),
    localDb.suppliers.clear(),
    localDb.fxRates.clear(),
    localDb.journalEntries.clear(),
    localDb.journalLines.clear(),
  ])
}

// ── Tests 1–4: bootstrapLocalData ────────────────────────────────────────────

describe('bootstrapLocalData', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await clearAllTables()
  })

  // Test 1: Empty DB → fetches all records and populates Dexie
  it('populates tables when local DB is empty (first install)', async () => {
    const serverCustomers = [
      makeCustomer({ id: 'cust-server-1' }),
      makeCustomer({ id: 'cust-server-2' }),
    ]
    mockFetch.mockReturnValue(makeSuccessResponse({ customers: serverCustomers }))

    await bootstrapLocalData('biz-001')

    expect(mockFetch).toHaveBeenCalledTimes(1)
    // fetch URL has no ?since= param (full bootstrap)
    const fetchUrl = mockFetch.mock.calls[0][0] as string
    expect(fetchUrl).toBe('/api/sync/pull')
    // Dexie populated
    const count = await localDb.customers.count()
    expect(count).toBe(2)
  })

  // Test 2: Bootstrap done, fresh lastPull → does NOT re-fetch
  it('skips fetch when bootstrap done and pull is fresh (< 30 min)', async () => {
    const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000).toISOString()
    await localDb.meta.put({ key: 'bootstrapDone', value: 'true' })
    await localDb.meta.put({ key: 'lastPullAt', value: oneMinuteAgo })

    await bootstrapLocalData('biz-001')

    expect(mockFetch).not.toHaveBeenCalled()
  })

  // Test 3: Bootstrap done, stale lastPull (> 30 min) → fetches with ?since= param
  it('fetches with ?since= when bootstrap done but pull is stale (> 30 min)', async () => {
    const thirtyOneMinutesAgo = new Date(Date.now() - 31 * 60 * 1000).toISOString()
    await localDb.meta.put({ key: 'bootstrapDone', value: 'true' })
    await localDb.meta.put({ key: 'lastPullAt', value: thirtyOneMinutesAgo })
    mockFetch.mockReturnValue(makeSuccessResponse())

    await bootstrapLocalData('biz-001')

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const fetchUrl = mockFetch.mock.calls[0][0] as string
    expect(fetchUrl).toContain('/api/sync/pull?since=')
    // The since value should be the stored lastPullAt
    expect(fetchUrl).toContain(encodeURIComponent(thirtyOneMinutesAgo))
  })

  // Test 4: Network unavailable → resolves silently, DB unchanged
  it('returns silently when network is unavailable, leaving DB unchanged', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(bootstrapLocalData('biz-001')).resolves.toBeUndefined()

    // DB remains empty — no partial state written
    const count = await localDb.customers.count()
    expect(count).toBe(0)
    // bootstrapDone was not set — next call will retry
    const meta = await localDb.meta.get('bootstrapDone')
    expect(meta).toBeUndefined()
  })
})

// ── Tests 5–8: bulkUpsertWithConflictResolution ───────────────────────────────

describe('bulkUpsertWithConflictResolution', () => {
  beforeEach(async () => {
    await localDb.customers.clear()
  })

  // Test 5: Incoming newer → local record replaced
  it('replaces local record when incoming is newer', async () => {
    const local = makeCustomer({
      id: 'cust-001',
      name: 'Old Name',
      updatedAt: '2024-01-01T00:00:00.000Z',
      syncStatus: 'synced',
    })
    await localDb.customers.put(local)

    const incoming = makeCustomer({
      id: 'cust-001',
      name: 'New Name',
      updatedAt: '2024-01-02T00:00:00.000Z',
    })
    await bulkUpsertWithConflictResolution(localDb.customers, [incoming])

    const result = await localDb.customers.get('cust-001')
    expect(result?.name).toBe('New Name')
    expect(result?.syncStatus).toBe('synced')
  })

  // Test 6: Local newer → local record kept
  it('keeps local record when local is newer than incoming', async () => {
    const local = makeCustomer({
      id: 'cust-001',
      name: 'Local Name',
      updatedAt: '2024-01-02T00:00:00.000Z',
      syncStatus: 'synced',
    })
    await localDb.customers.put(local)

    const incoming = makeCustomer({
      id: 'cust-001',
      name: 'Stale Server Name',
      updatedAt: '2024-01-01T00:00:00.000Z',
    })
    await bulkUpsertWithConflictResolution(localDb.customers, [incoming])

    const result = await localDb.customers.get('cust-001')
    expect(result?.name).toBe('Local Name')
  })

  // Test 7: Local syncStatus='pending' → always kept, even if server is newer
  it('keeps local record unconditionally when syncStatus is pending', async () => {
    const local = makeCustomer({
      id: 'cust-001',
      name: 'Unsynced Local',
      updatedAt: '2024-01-01T00:00:00.000Z',
      syncStatus: 'pending',
    })
    await localDb.customers.put(local)

    // Incoming is much newer but local is pending — local must win
    const incoming = makeCustomer({
      id: 'cust-001',
      name: 'Server Override',
      updatedAt: '2025-01-01T00:00:00.000Z',
    })
    await bulkUpsertWithConflictResolution(localDb.customers, [incoming])

    const result = await localDb.customers.get('cust-001')
    expect(result?.name).toBe('Unsynced Local')
    expect(result?.syncStatus).toBe('pending')
  })

  // Test 8: Incoming record not in local → written with syncStatus='synced'
  it('writes new incoming records that do not exist locally', async () => {
    const incoming = makeCustomer({ id: 'cust-brand-new', name: 'Brand New Customer' })
    await bulkUpsertWithConflictResolution(localDb.customers, [incoming])

    const result = await localDb.customers.get('cust-brand-new')
    expect(result).toBeDefined()
    expect(result?.name).toBe('Brand New Customer')
    expect(result?.syncStatus).toBe('synced')
  })
})
