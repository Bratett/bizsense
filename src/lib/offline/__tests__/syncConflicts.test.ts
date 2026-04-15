import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Module mocks ─────────────────────────────────────────────────────────────
// vi.mock() is hoisted — factory must not reference outer variables.

vi.mock('@/db/local/dexie', () => ({
  localDb: {
    syncConflicts: { bulkAdd: vi.fn().mockResolvedValue(undefined) },
  },
}))

vi.mock('@/lib/offline/offlineWrite', () => ({
  enqueueSync: vi.fn().mockResolvedValue(undefined),
}))

import { localDb } from '@/db/local/dexie'
import { enqueueSync } from '@/lib/offline/offlineWrite'
import { bulkUpsertWithConflictResolution } from '@/lib/offline/bootstrap'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Wait up to 2 s for a fire-and-forget async chain to settle. */
async function waitForSpy(fn: () => void) {
  await vi.waitFor(fn, { timeout: 2000, interval: 10 })
}

/** Short pause to let fire-and-forget chains settle without waiting indefinitely. */
const pause = () => new Promise<void>((r) => setTimeout(r, 50))

/** Build a minimal Dexie-like Table mock. */
function makeMockTable(existingRecords: Record<string, unknown>[]) {
  const bulkPut = vi.fn().mockResolvedValue(undefined)
  const toArray = vi.fn().mockResolvedValue(existingRecords)
  const anyOf = vi.fn().mockReturnValue({ toArray })
  const where = vi.fn().mockReturnValue({ anyOf })
  return { where, bulkPut, name: 'orders' } as never
}

const BUSINESS_ID = 'biz-001'

const LOCAL_RECORD = {
  id: 'rec-001',
  businessId: BUSINESS_ID,
  name: 'Widget A',
  updatedAt: '2026-04-10T10:00:00.000Z',
  syncStatus: 'synced',
}

const SERVER_RECORD_NEWER_DIFFERENT = {
  id: 'rec-001',
  businessId: BUSINESS_ID,
  name: 'Widget A — Updated', // value differs from local
  updatedAt: '2026-04-10T12:00:00.000Z', // newer than local
  syncStatus: 'synced',
}

// Exact same shape as local — JSON.stringify will match → no conflict
const SERVER_RECORD_SAME_VALUES = { ...LOCAL_RECORD }

const LOCAL_PENDING_RECORD = {
  ...LOCAL_RECORD,
  name: 'Widget A — Local Pending',
  syncStatus: 'pending', // local has unsaved changes
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('bulkUpsertWithConflictResolution — conflict logging', () => {
  it('Test 5 — server wins with different values: syncConflict row added', async () => {
    const table = makeMockTable([LOCAL_RECORD] as never)
    const bulkAddSpy = vi.mocked(localDb.syncConflicts.bulkAdd)

    await bulkUpsertWithConflictResolution(table, [SERVER_RECORD_NEWER_DIFFERENT] as never)

    await waitForSpy(() => expect(bulkAddSpy).toHaveBeenCalledOnce())

    const [conflicts] = bulkAddSpy.mock.calls[0] as unknown as [Array<Record<string, unknown>>]
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toMatchObject({
      businessId: BUSINESS_ID,
      tableName: 'orders',
      recordId: 'rec-001',
      reviewedAt: null,
      resolution: null,
    })
    expect(conflicts[0].localValue).toMatchObject({ name: 'Widget A' })
    expect(conflicts[0].serverValue).toMatchObject({ name: 'Widget A — Updated' })
  })

  it('Test 6 — server wins but values identical: no conflict row added', async () => {
    const table = makeMockTable([SERVER_RECORD_SAME_VALUES] as never)
    const bulkAddSpy = vi.mocked(localDb.syncConflicts.bulkAdd)
    const enqueueSyncSpy = vi.mocked(enqueueSync)

    await bulkUpsertWithConflictResolution(table, [SERVER_RECORD_SAME_VALUES] as never)
    await pause()

    expect(bulkAddSpy).not.toHaveBeenCalled()
    expect(enqueueSyncSpy).not.toHaveBeenCalled()
  })

  it('Test 7 — local syncStatus=pending: local wins, conflict never logged', async () => {
    const table = makeMockTable([LOCAL_PENDING_RECORD] as never)
    const bulkAddSpy = vi.mocked(localDb.syncConflicts.bulkAdd)
    const enqueueSyncSpy = vi.mocked(enqueueSync)

    await bulkUpsertWithConflictResolution(table, [SERVER_RECORD_NEWER_DIFFERENT] as never)
    await pause()

    expect(bulkAddSpy).not.toHaveBeenCalled()
    expect(enqueueSyncSpy).not.toHaveBeenCalled()
    // The local record is not overwritten
    expect((table as never as { bulkPut: ReturnType<typeof vi.fn> }).bulkPut).not.toHaveBeenCalled()
  })
})
