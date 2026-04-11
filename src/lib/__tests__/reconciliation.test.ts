import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'

// Mock @/db before any imports that use it.
// vi.mock is hoisted — this runs before module resolution.
vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}))

import { db } from '@/db'
import { runLedgerReconciliation } from '../reconciliation'

// ─── Chain factory ────────────────────────────────────────────────────────────
// Creates a thenable Drizzle query chain that resolves to `result` regardless
// of which method ends the chain (.where, .having, etc).

function makeChain(result: unknown[]) {
  const chain: Record<string, unknown> = {
    then: (f?: (v: unknown[]) => unknown, r?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(f, r),
    catch: (f?: (e: unknown) => unknown) => Promise.resolve(result).catch(f),
    finally: (f?: () => void) => Promise.resolve(result).finally(f),
  }
  ;['from', 'where', 'innerJoin', 'groupBy', 'having'].forEach(
    (m) => (chain[m] = vi.fn(() => chain)),
  )
  return chain
}

// ─── DB configurator ─────────────────────────────────────────────────────────
// Wires up db.select to return sequential results and db.insert to capture
// inserted data.  Call this once per test (or once per run in Test 4).

function configureDb(selectResults: unknown[][], insertCaptured: unknown[]) {
  let idx = 0
  ;(db.select as Mock).mockImplementation(() => {
    const result = selectResults[idx++] ?? []
    return makeChain(result)
  })
  ;(db.insert as Mock).mockReturnValue({
    values: vi.fn((data: unknown) => {
      insertCaptured.push(data)
      return Promise.resolve()
    }),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('runLedgerReconciliation', () => {
  it('Test 1 — clean ledger returns zero issues', async () => {
    const insertCaptured: unknown[] = []
    // All four checks return empty — nothing to flag
    configureDb([[], [], [], []], insertCaptured)

    const result = await runLedgerReconciliation('biz-1')

    expect(result.issuesFound).toBe(0)
    expect(result.issues).toHaveLength(0)
    expect(insertCaptured).toHaveLength(0)
  })

  it('Test 2 — orphaned fulfilled order is detected and logged', async () => {
    const insertCaptured: unknown[] = []
    // Check 1 (orders) → 1 orphan; checks 2-4 → empty; dedup check → empty (new issue)
    configureDb([[{ id: 'order-1' }], [], [], [], []], insertCaptured)

    const result = await runLedgerReconciliation('biz-1')

    expect(result.issuesFound).toBe(1)
    expect(result.issues[0].sourceTable).toBe('orders')
    expect(result.issues[0].sourceId).toBe('order-1')
    expect(result.issues[0].issue).toBe('missing_journal_entry')

    // The issue must have been written to ledger_integrity_log
    expect(insertCaptured).toHaveLength(1)
    const logged = insertCaptured[0] as Record<string, unknown>
    expect(logged.sourceId).toBe('order-1')
    expect(logged.issue).toBe('missing_journal_entry')
    expect(logged.sourceTable).toBe('orders')
  })

  it('Test 3 — imbalanced journal entry is detected and logged', async () => {
    const insertCaptured: unknown[] = []
    // Checks 1-3 (orders/expenses/grns) → empty; Check 4 (imbalanced entries) → 1 hit;
    // dedup check → empty (new issue)
    configureDb([[], [], [], [{ id: 'je-1' }], []], insertCaptured)

    const result = await runLedgerReconciliation('biz-1')

    expect(result.issuesFound).toBe(1)
    expect(result.issues[0].issue).toBe('debit_credit_mismatch')
    expect(result.issues[0].sourceTable).toBe('journal_entries')
    expect(result.issues[0].sourceId).toBe('je-1')

    expect(insertCaptured).toHaveLength(1)
    const logged = insertCaptured[0] as Record<string, unknown>
    expect(logged.issue).toBe('debit_credit_mismatch')
  })

  it('Test 4 — duplicate issues are not re-inserted on a second run', async () => {
    const insertCaptured: unknown[] = []

    // ── Run 1 ──────────────────────────────────────────────────────────────
    // Dedup check (idx 4) returns empty → issue is new → insert
    configureDb([[{ id: 'order-1' }], [], [], [], []], insertCaptured)
    await runLedgerReconciliation('biz-1')

    expect(insertCaptured).toHaveLength(1)

    // ── Run 2 ──────────────────────────────────────────────────────────────
    // Same orphan order still present; dedup check now returns an existing row
    // → issue is not new → no second insert
    configureDb([[{ id: 'order-1' }], [], [], [], [{ id: 'log-entry-1' }]], insertCaptured)
    await runLedgerReconciliation('biz-1')

    // Still exactly 1 row in the log — the second run must not re-insert
    expect(insertCaptured).toHaveLength(1)
  })

  it('Test 5 — pending/rejected expenses with no journal entry are NOT flagged', async () => {
    const insertCaptured: unknown[] = []
    // The expense query (Check 2) only looks for approvalStatus = 'approved'.
    // Pending and rejected expenses legitimately have no journal entry.
    // All four checks return empty — the DB mock simulates that the query
    // with approvalStatus='approved' filter finds nothing, even though
    // pending/rejected expenses with null journalEntryId exist in the DB.
    configureDb([[], [], [], []], insertCaptured)

    const result = await runLedgerReconciliation('biz-1')

    expect(result.issuesFound).toBe(0)
    expect(result.issues).toHaveLength(0)
    expect(insertCaptured).toHaveLength(0)
    // Verify db.select was called 4 times (orders, expenses, grns, imbalanced)
    expect(db.select).toHaveBeenCalledTimes(4)
  })
})
