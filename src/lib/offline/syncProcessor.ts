// BROWSER ONLY
import { localDb } from '@/db/local/dexie'
import { isNetworkAvailable } from '@/lib/offline/network'

const MAX_ATTEMPTS = 5
const BATCH_SIZE = 50

// Guard against overlapping runs (e.g. 30s timer fires while previous run is still active)
let isRunning = false

// ─── Types for the /api/sync POST contract ───────────────────────────────────

type SyncPushItem = {
  syncQueueId: number
  tableName: string
  recordId: string
  operation: 'upsert'
  payload: Record<string, unknown>
  deferredJournal?: {
    deferredJournalId: string
    proposedEntry: {
      entryDate: string
      description: string
      sourceType: string
      lines: Array<{
        accountCode: string
        debitAmount: number
        creditAmount: number
        currency: string
        fxRate: number
      }>
    }
  }
}

type SyncPushResult =
  | { syncQueueId: number; recordId: string; success: true; journalEntryId: string | null }
  | { syncQueueId: number; recordId: string; success: false; error: string }

// ─── Main processor ──────────────────────────────────────────────────────────

/**
 * Drain the syncQueue to /api/sync. Called by AppInitialiser every 30 s and
 * immediately on network reconnect. Re-entrant calls are no-ops.
 */
export async function startSyncProcessor(_businessId: string): Promise<void> {
  if (isRunning) return
  isRunning = true

  try {
    await runDrainLoop()
  } finally {
    isRunning = false
  }
}

async function runDrainLoop(): Promise<void> {
  // Check network before touching the queue
  const online = await isNetworkAvailable()
  if (!online) return

  // Process in batches until the queue is empty
  while (true) {
    const pendingItems = await localDb.syncQueue
      .where('status')
      .equals('pending')
      .limit(BATCH_SIZE)
      .toArray()

    if (pendingItems.length === 0) break

    // Mark as 'syncing' to prevent concurrent processors (e.g. multiple tabs) from
    // picking up the same items
    const syncing = pendingItems.map((item) => ({ ...item, status: 'syncing' as const }))
    await localDb.syncQueue.bulkPut(syncing)

    // Attach deferred journals where available
    const requestItems: SyncPushItem[] = await Promise.all(
      pendingItems.map(async (item) => {
        const journal = await localDb.deferredJournals
          .where('sourceId')
          .equals(item.recordId)
          .filter((j) => j.status === 'pending')
          .first()

        const base: SyncPushItem = {
          syncQueueId: item.id!,
          tableName: item.tableName,
          recordId: item.recordId,
          operation: 'upsert',
          payload: item.payload,
        }

        if (journal) {
          return {
            ...base,
            deferredJournal: {
              deferredJournalId: journal.id,
              proposedEntry: journal.proposedEntry,
            },
          }
        }

        return base
      }),
    )

    // Send batch to server
    let results: SyncPushResult[]
    try {
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: requestItems }),
      })

      if (!response.ok) {
        throw new Error(`Sync server returned ${response.status}`)
      }

      const data = (await response.json()) as { results: SyncPushResult[] }
      results = data.results
    } catch (err) {
      // Network failure — put all items back to pending
      const errMsg = err instanceof Error ? err.message : 'Network error'
      await localDb.transaction('rw', [localDb.syncQueue], async () => {
        for (const item of pendingItems) {
          const nextAttempts = item.attempts + 1
          await localDb.syncQueue.update(item.id!, {
            status: nextAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
            attempts: nextAttempts,
            lastError: errMsg,
          })
        }
      })
      return // stop draining on network failure
    }

    // Update Dexie based on server results
    await localDb.transaction(
      'rw',
      [
        localDb.syncQueue,
        localDb.deferredJournals,
        localDb.orders,
        localDb.expenses,
        localDb.customers,
      ],
      async () => {
        for (const res of results) {
          if (res.success) {
            await localDb.syncQueue.update(res.syncQueueId, { status: 'synced' })

            // Promote deferred journal if journal was posted
            if (res.journalEntryId) {
              // Mark the deferred journal as promoted
              const journal = await localDb.deferredJournals
                .where('sourceId')
                .equals(res.recordId)
                .filter((j) => j.status === 'pending')
                .first()

              if (journal) {
                await localDb.deferredJournals.update(journal.id, { status: 'promoted' })
              }

              // Update the source record in Dexie with the real journalEntryId
              const tableName = requestItems.find(
                (i) => i.syncQueueId === res.syncQueueId,
              )?.tableName
              if (tableName === 'orders') {
                await localDb.orders.update(res.recordId, { journalEntryId: res.journalEntryId })
              } else if (tableName === 'expenses') {
                await localDb.expenses.update(res.recordId, { journalEntryId: res.journalEntryId })
              }
            }
          } else {
            // Failure — increment attempts and decide whether to retry or fail permanently
            const queueItem = pendingItems.find((i) => i.id === res.syncQueueId)
            const nextAttempts = (queueItem?.attempts ?? 0) + 1
            await localDb.syncQueue.update(res.syncQueueId, {
              status: nextAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
              attempts: nextAttempts,
              lastError: res.error,
            })

            // Mark deferred journal as failed if it hit max attempts
            if (nextAttempts >= MAX_ATTEMPTS) {
              const journal = await localDb.deferredJournals
                .where('sourceId')
                .equals(res.recordId)
                .filter((j) => j.status === 'pending')
                .first()
              if (journal) {
                await localDb.deferredJournals.update(journal.id, { status: 'failed' })
              }
            }
          }
        }
      },
    )

    // If the batch had failures, stop to avoid re-queuing storms
    const hasFailures = results.some((r) => !r.success)
    if (hasFailures) break
  }
}
