'use server'

import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { accounts } from '@/db/schema'
import { postJournalEntry } from '@/lib/ledger'
import { getServerSession } from '@/lib/session'

/**
 * createOpeningBalance — posts a GHS 1,000 opening balance entry for verification.
 *
 * Dr  1001 (Cash on Hand)     GHS 1,000.00
 * Cr  3001 (Owner's Equity)   GHS 1,000.00
 *
 * This is a manual verification tool for Sprint 1 Task F.
 * Opening balances have no source record, so atomicTransactionWrite is not used —
 * a plain db.transaction + postJournalEntry is correct here.
 */
export async function createOpeningBalance(): Promise<void> {
  const session = await getServerSession()
  const { businessId, id: createdBy } = session.user

  const [cash] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.businessId, businessId), eq(accounts.code, '1001')))

  const [equity] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.businessId, businessId), eq(accounts.code, '3001')))

  if (!cash || !equity) {
    throw new Error(
      "Required accounts (1001 Cash on Hand, 3001 Owner's Equity) not found. " +
        'Ensure the Chart of Accounts is seeded for this business.',
    )
  }

  await db.transaction(async (tx) => {
    await postJournalEntry(tx, {
      businessId,
      entryDate: new Date().toISOString().split('T')[0],
      description: 'Opening Balance — Cash on Hand',
      sourceType: 'opening_balance',
      createdBy,
      lines: [
        {
          accountId: cash.id,
          debitAmount: 1000,
          creditAmount: 0,
          memo: 'Cash on Hand opening balance',
        },
        {
          accountId: equity.id,
          debitAmount: 0,
          creditAmount: 1000,
          memo: "Owner's Equity opening balance",
        },
      ],
    })
  })
}

/**
 * triggerReconciliation — runs the ledger integrity check on demand.
 * Called from the Trial Balance tab's "Run reconciliation" button.
 */
export async function triggerReconciliation(): Promise<{ issuesFound: number }> {
  const session = await getServerSession()
  const { businessId } = session.user
  const { runLedgerReconciliation } = await import('@/lib/reconciliation')
  const result = await runLedgerReconciliation(businessId)
  return { issuesFound: result.issuesFound }
}
