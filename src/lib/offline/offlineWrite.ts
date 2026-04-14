// BROWSER ONLY
import { localDb } from '@/db/local/dexie'
import type { DexieDeferredJournal } from '@/db/local/dexie'

/**
 * Enqueue a record for sync. Called after every offline write.
 * The sync processor drains this queue when online.
 */
export async function enqueueSync(
  tableName: string,
  recordId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await localDb.syncQueue.add({
    tableName,
    recordId,
    operation: 'upsert',
    payload,
    createdAt: new Date().toISOString(),
    status: 'pending',
    attempts: 0,
    lastError: null,
  })
}

/**
 * Write a deferred journal instruction for an offline-written source record.
 * This is NOT a real journal entry — it is a reconstruction blueprint.
 * The sync processor converts this to a Drizzle atomic write on the server.
 */
export async function enqueueDeferredJournal(
  record: Omit<DexieDeferredJournal, 'status' | 'createdAt'>,
): Promise<void> {
  await localDb.deferredJournals.add({
    ...record,
    status: 'pending',
    createdAt: new Date().toISOString(),
  })
}
