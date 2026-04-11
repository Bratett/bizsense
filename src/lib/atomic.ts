import { db } from '@/db'
import { postJournalEntry, PostJournalEntryInput, DrizzleTransaction } from './ledger'

export type { DrizzleTransaction }

/**
 * atomicTransactionWrite — mandatory wrapper for every Server Action that records
 * a financial transaction alongside a journal entry.
 *
 * **Why this is mandatory:**
 * Every sale, expense, GRN, and payroll run produces two writes:
 *   1. The source record (e.g. an order row)
 *   2. A double-entry journal entry + lines
 *
 * If those two writes are issued as separate statements and the process crashes
 * between them — or if postJournalEntry throws after the source record is already
 * committed — you get an orphan record: a fulfilled order with no ledger trace.
 * The P&L and Balance Sheet silently under-report revenue. The reconciliation job
 * will flag it, but the damage is already done.
 *
 * By wrapping both writes in a single Postgres transaction, either both succeed or
 * both roll back. Orphan records are structurally impossible.
 *
 * **What bypassing this wrapper does:**
 * ```typescript
 * // WRONG — do not do this
 * await db.insert(orders).values(data)           // committed ✓
 * await db.insert(journalEntries).values(entry)  // crashes   ✗ → orphan order
 * ```
 *
 * **Rule:**
 * Every Server Action that touches a journal entry (sales, expenses, payments,
 * GRNs, payroll runs, opening balances) MUST use this wrapper. No exceptions.
 *
 * @param journalInput - The journal entry to post (validated for debit = credit
 *   balance before any write occurs — see postJournalEntry in ledger.ts)
 * @param writeSourceRecord - Callback that inserts the source record using the
 *   same transaction handle. Receives the newly created journalEntryId so it can
 *   link the source record back to the ledger.
 * @returns Whatever the writeSourceRecord callback returns (typically the inserted row)
 */
export async function atomicTransactionWrite<T>(
  journalInput: PostJournalEntryInput,
  writeSourceRecord: (tx: DrizzleTransaction, journalEntryId: string) => Promise<T>,
): Promise<T> {
  return await db.transaction(async (tx) => {
    // 1. Post journal entry first — validates debit=credit balance before writing.
    //    If validation or the insert fails, nothing is committed.
    const journalEntryId = await postJournalEntry(tx, journalInput)

    // 2. Write the source record with journalEntryId linked.
    //    If this fails, the journal entry is also rolled back.
    const result = await writeSourceRecord(tx, journalEntryId)

    // 3. Both succeed or both roll back — no orphan records possible.
    return result
  })
}
