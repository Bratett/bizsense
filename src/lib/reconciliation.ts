import { and, eq, isNull, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  orders,
  expenses,
  goodsReceivedNotes,
  journalEntries,
  journalLines,
  ledgerIntegrityLog,
} from '@/db/schema'

export type ReconciliationIssue = {
  sourceTable: string
  sourceId: string
  issue: 'missing_journal_entry' | 'debit_credit_mismatch'
}

/**
 * runLedgerReconciliation — scans the ledger for structural integrity violations
 * and writes new issues to ledger_integrity_log (deduplicating on re-runs).
 *
 * Detects four categories of violation:
 *   1. Fulfilled orders with no linked journal entry (orphan source record)
 *   2. Expenses with no linked journal entry (orphan source record)
 *   3. Confirmed GRNs with no linked journal entry (orphan source record)
 *   4. Journal entries where SUM(debit) ≠ SUM(credit) (broken double-entry invariant)
 *
 * Called on every app load after sync completes and on demand from the accountant
 * dashboard via POST /api/reconcile.
 *
 * Issues that already exist in ledger_integrity_log (unresolved) are not re-inserted.
 * Resolution is a manual accountant action — this function only detects, never fixes.
 *
 * @param businessId - Must come from the server-side session, never from user input.
 * @returns Total count of issues found this run and the full issue list.
 */
export async function runLedgerReconciliation(
  businessId: string,
): Promise<{ issuesFound: number; issues: ReconciliationIssue[] }> {
  const allIssues: ReconciliationIssue[] = []

  // ── Check 1: Fulfilled orders with no journal entry ────────────────────────
  const orphanOrders = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.businessId, businessId),
        eq(orders.status, 'fulfilled'),
        isNull(orders.journalEntryId),
      ),
    )

  for (const row of orphanOrders) {
    allIssues.push({
      sourceTable: 'orders',
      sourceId: row.id,
      issue: 'missing_journal_entry',
    })
  }

  // ── Check 2: Approved expenses with no journal entry ────────────────────────
  // Pending and rejected expenses legitimately have no journal entry
  const orphanExpenses = await db
    .select({ id: expenses.id })
    .from(expenses)
    .where(
      and(
        eq(expenses.businessId, businessId),
        eq(expenses.approvalStatus, 'approved'),
        isNull(expenses.journalEntryId),
      ),
    )

  for (const row of orphanExpenses) {
    allIssues.push({
      sourceTable: 'expenses',
      sourceId: row.id,
      issue: 'missing_journal_entry',
    })
  }

  // ── Check 3: Confirmed GRNs with no journal entry ──────────────────────────
  const orphanGrns = await db
    .select({ id: goodsReceivedNotes.id })
    .from(goodsReceivedNotes)
    .where(
      and(
        eq(goodsReceivedNotes.businessId, businessId),
        eq(goodsReceivedNotes.status, 'confirmed'),
        isNull(goodsReceivedNotes.journalEntryId),
      ),
    )

  for (const row of orphanGrns) {
    allIssues.push({
      sourceTable: 'goods_received_notes',
      sourceId: row.id,
      issue: 'missing_journal_entry',
    })
  }

  // ── Check 4: Journal entries where debits ≠ credits ───────────────────────
  const imbalancedEntries = await db
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .innerJoin(journalLines, eq(journalLines.journalEntryId, journalEntries.id))
    .where(eq(journalEntries.businessId, businessId))
    .groupBy(journalEntries.id)
    .having(sql`ABS(SUM(${journalLines.debitAmount}) - SUM(${journalLines.creditAmount})) > 0.001`)

  for (const row of imbalancedEntries) {
    allIssues.push({
      sourceTable: 'journal_entries',
      sourceId: row.id,
      issue: 'debit_credit_mismatch',
    })
  }

  // TODO post-Sprint 5: add check for fulfilled orders with product lines but
  //   no COGS journal line, once COGS backfill is confirmed complete for all businesses.

  // ── Deduplication + persistence ───────────────────────────────────────────
  // For each issue found this run, check whether an unresolved log entry already
  // exists. Only insert if it is genuinely new — prevents duplicate rows on
  // repeated runs before the accountant has had a chance to resolve issues.
  for (const issue of allIssues) {
    const existing = await db
      .select({ id: ledgerIntegrityLog.id })
      .from(ledgerIntegrityLog)
      .where(
        and(
          eq(ledgerIntegrityLog.businessId, businessId),
          eq(ledgerIntegrityLog.sourceId, issue.sourceId),
          eq(ledgerIntegrityLog.issue, issue.issue),
          isNull(ledgerIntegrityLog.resolvedAt),
        ),
      )

    if (existing.length === 0) {
      await db.insert(ledgerIntegrityLog).values({
        businessId,
        sourceTable: issue.sourceTable,
        sourceId: issue.sourceId,
        issue: issue.issue,
      })
    }
  }

  return { issuesFound: allIssues.length, issues: allIssues }
}
