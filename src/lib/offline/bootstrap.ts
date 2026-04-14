// BROWSER ONLY — do not import in server-side code

import {
  localDb,
  type DexieBusiness,
  type DexieAccount,
  type DexieTaxComponent,
  type DexieCustomer,
  type DexieOrder,
  type DexieOrderLine,
  type DexieExpense,
  type DexieProduct,
  type DexieInventoryTransaction,
  type DexieSupplier,
  type DexieFxRate,
  type DexieJournalEntry,
  type DexieJournalLine,
} from '@/db/local/dexie'
import type { Table } from 'dexie'

const BOOTSTRAP_DONE_KEY = 'bootstrapDone'
const LAST_PULL_KEY = 'lastPullAt'

/**
 * Check if local DB is empty (first install) or stale (> 30 minutes since last pull).
 * If so, fetch from /api/sync/pull and populate Dexie.
 * Silently no-ops when offline — network is never on the critical path.
 */
export async function bootstrapLocalData(businessId: string): Promise<void> {
  // businessId is provided by AppInitialiser from the server session.
  // The pull endpoint enforces businessId from its own session — this param
  // is retained for API clarity and future use (e.g. multi-business support).
  void businessId

  const bootstrapDone = await localDb.meta.get(BOOTSTRAP_DONE_KEY)
  const lastPull = await localDb.meta.get(LAST_PULL_KEY)

  // Always bootstrap if never done before
  const needsBootstrap = !bootstrapDone

  // Incremental pull if bootstrapped but stale (> 30 min since last pull)
  const staleCutoff = Date.now() - 30 * 60 * 1000
  const lastPullTime = lastPull ? new Date(lastPull.value as string).getTime() : 0
  const needsPull = lastPullTime < staleCutoff

  if (!needsBootstrap && !needsPull) return // fresh enough — skip

  const since = bootstrapDone ? (lastPull?.value as string | undefined) : undefined
  await pullFromServer(since)
}

async function pullFromServer(since?: string): Promise<void> {
  const url = since ? `/api/sync/pull?since=${encodeURIComponent(since)}` : '/api/sync/pull'

  let response: Response
  try {
    response = await fetch(url, { credentials: 'include' })
  } catch {
    // Network unavailable — skip pull silently, use whatever is in Dexie
    return
  }

  if (!response.ok) return // non-200 — skip silently

  const { data, pulledAt } = (await response.json()) as {
    data: SyncPullData
    pulledAt: string
  }

  // Write all received data to Dexie in a single transaction to avoid partial state
  await localDb.transaction(
    'rw',
    [
      localDb.businesses,
      localDb.accounts,
      localDb.taxComponents,
      localDb.customers,
      localDb.orders,
      localDb.orderLines,
      localDb.expenses,
      localDb.products,
      localDb.inventoryTransactions,
      localDb.suppliers,
      localDb.fxRates,
      localDb.journalEntries,
      localDb.journalLines,
    ],
    async () => {
      await bulkUpsertWithConflictResolution(localDb.businesses, data.businesses)
      await bulkUpsertWithConflictResolution(localDb.accounts, data.accounts)
      await bulkUpsertWithConflictResolution(localDb.taxComponents, data.taxComponents)
      await bulkUpsertWithConflictResolution(localDb.customers, data.customers)
      await bulkUpsertWithConflictResolution(localDb.orders, data.orders)
      await localDb.orderLines.bulkPut(data.orderLines) // append-only, no conflict on lines
      await bulkUpsertWithConflictResolution(localDb.expenses, data.expenses)
      await bulkUpsertWithConflictResolution(localDb.products, data.products)
      await localDb.inventoryTransactions.bulkPut(data.inventoryTransactions) // append-only
      await bulkUpsertWithConflictResolution(localDb.suppliers, data.suppliers)
      await localDb.fxRates.bulkPut(data.fxRates) // reference data, always replace
      // Journal entries from server are always 'synced' — force that status
      await localDb.journalEntries.bulkPut(
        data.journalEntries.map((e: DexieJournalEntry) => ({
          ...e,
          syncStatus: 'synced' as const,
        })),
      )
      await localDb.journalLines.bulkPut(data.journalLines) // append-only
    },
  )

  // Record pull timestamp — outside the transaction so it only persists on success
  await localDb.meta.put({ key: LAST_PULL_KEY, value: pulledAt })
  await localDb.meta.put({ key: BOOTSTRAP_DONE_KEY, value: 'true' })
}

// ── Sync data shape ────────────────────────────────────────────────────────────
// Records arrive as JSON. Drizzle numeric fields come as strings; timestamps as
// ISO strings. Stored as-is in Dexie for Sprint 9 — numeric normalisation
// (string→number for amounts) is a Sprint 12 optimisation.
// The cast from `response.json()` (any) is safe: field names align 1:1 with
// the Dexie types. Type mismatches (e.g. numeric strings in number fields) are
// acknowledged and will not cause runtime errors for Sprint 9 use cases.

interface SyncPullData {
  businesses: DexieBusiness[]
  accounts: DexieAccount[]
  taxComponents: DexieTaxComponent[]
  customers: DexieCustomer[]
  orders: DexieOrder[]
  orderLines: DexieOrderLine[]
  expenses: DexieExpense[]
  products: DexieProduct[]
  inventoryTransactions: DexieInventoryTransaction[]
  suppliers: DexieSupplier[]
  fxRates: DexieFxRate[]
  journalEntries: DexieJournalEntry[]
  journalLines: DexieJournalLine[]
}

// ── Conflict resolution ────────────────────────────────────────────────────────

/**
 * Last-write-wins on updatedAt, with one override:
 * if the local record has syncStatus='pending' (not yet pushed to server),
 * local always wins — it will be pushed on the next sync cycle.
 *
 * Exported for direct unit testing.
 */
export async function bulkUpsertWithConflictResolution<
  T extends { id: string; updatedAt?: string; syncStatus?: string },
>(table: Table<T>, incoming: T[]): Promise<void> {
  if (!incoming?.length) return

  const ids = incoming.map((r) => r.id)
  const existing = await table.where('id').anyOf(ids).toArray()
  const existingMap = new Map(existing.map((r) => [r.id, r]))

  const toWrite: T[] = []

  for (const incomingRecord of incoming) {
    const local = existingMap.get(incomingRecord.id)

    if (!local) {
      // New record — write it as synced
      toWrite.push({ ...incomingRecord, syncStatus: 'synced' } as T)
      continue
    }

    if (local.syncStatus === 'pending') {
      // Local is unsynced — local wins unconditionally; it will push to server later
      continue
    }

    const serverTime = incomingRecord.updatedAt ? new Date(incomingRecord.updatedAt).getTime() : 0
    const localTime = local.updatedAt ? new Date(local.updatedAt).getTime() : 0

    if (serverTime >= localTime) {
      // Server is same age or newer — server wins
      toWrite.push({ ...incomingRecord, syncStatus: 'synced' } as T)
    }
    // else: local is newer — keep local (it will sync to server on next push)
  }

  if (toWrite.length) await table.bulkPut(toWrite)
}
