import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'

// Mock @/db before any imports that use it.
// vi.mock is hoisted — this runs before module resolution.
vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
    selectDistinct: vi.fn(),
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
  ;['from', 'where', 'innerJoin', 'groupBy', 'having', 'limit'].forEach(
    (m) => (chain[m] = vi.fn(() => chain)),
  )
  return chain
}

// ─── DB configurator ─────────────────────────────────────────────────────────
// Wires up db.select to return sequential results and db.insert to capture
// inserted data.  Call this once per test (or once per run in Test 4).

function configureDb(selectResults: unknown[][], insertCaptured: unknown[]) {
  let idx = 0
  const nextResult = () => {
    const result = selectResults[idx++] ?? []
    return makeChain(result)
  }
  ;(db.select as Mock).mockImplementation(nextResult)
  ;((db as unknown as Record<string, Mock>).selectDistinct as Mock).mockImplementation(nextResult)
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
    // All four checks return empty + COGS account not found — nothing to flag
    configureDb([[], [], [], [], []], insertCaptured)

    const result = await runLedgerReconciliation('biz-1')

    expect(result.issuesFound).toBe(0)
    expect(result.issues).toHaveLength(0)
    expect(insertCaptured).toHaveLength(0)
  })

  it('Test 2 — orphaned fulfilled order is detected and logged', async () => {
    const insertCaptured: unknown[] = []
    // Check 1 (orders) → 1 orphan; checks 2-4 → empty; COGS account → not found; dedup → empty
    configureDb([[{ id: 'order-1' }], [], [], [], [], []], insertCaptured)

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
    // Checks 1-3 → empty; Check 4 (imbalanced) → 1 hit; COGS account → not found; dedup → empty
    configureDb([[], [], [], [{ id: 'je-1' }], [], []], insertCaptured)

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
    // Orphan order + COGS account not found + dedup → empty (new issue → insert)
    configureDb([[{ id: 'order-1' }], [], [], [], [], []], insertCaptured)
    await runLedgerReconciliation('biz-1')

    expect(insertCaptured).toHaveLength(1)

    // ── Run 2 ──────────────────────────────────────────────────────────────
    // Same orphan order; COGS account not found; dedup returns existing row → no re-insert
    configureDb([[{ id: 'order-1' }], [], [], [], [], [{ id: 'log-entry-1' }]], insertCaptured)
    await runLedgerReconciliation('biz-1')

    // Still exactly 1 row in the log — the second run must not re-insert
    expect(insertCaptured).toHaveLength(1)
  })

  it('Test 5 — pending/rejected expenses with no journal entry are NOT flagged', async () => {
    const insertCaptured: unknown[] = []
    // The expense query (Check 2) only looks for approvalStatus = 'approved'.
    // Pending and rejected expenses legitimately have no journal entry.
    // All four checks return empty + COGS account not found.
    configureDb([[], [], [], [], []], insertCaptured)

    const result = await runLedgerReconciliation('biz-1')

    expect(result.issuesFound).toBe(0)
    expect(result.issues).toHaveLength(0)
    expect(insertCaptured).toHaveLength(0)
    // Verify db.select was called 5 times (orders, expenses, grns, imbalanced, COGS account)
    expect(db.select).toHaveBeenCalledTimes(5)
  })

  it('Test 6 — order with inventory products but no COGS line is flagged', async () => {
    const insertCaptured: unknown[] = []
    // Checks 1-4 → empty; COGS account → found;
    // candidate orders (selectDistinct) → 1 order with journal entry;
    // COGS line check → empty (no COGS line); dedup → empty (new issue)
    configureDb(
      [[], [], [], [], [{ id: 'cogs-acct-1' }], [{ id: 'order-x', journalEntryId: 'je-x' }], [], []],
      insertCaptured,
    )

    const result = await runLedgerReconciliation('biz-1')

    expect(result.issuesFound).toBe(1)
    expect(result.issues[0]).toEqual({
      sourceTable: 'orders',
      sourceId: 'order-x',
      issue: 'missing_cogs_entry',
    })
    expect(insertCaptured).toHaveLength(1)
    const logged = insertCaptured[0] as Record<string, unknown>
    expect(logged.issue).toBe('missing_cogs_entry')
  })

  it('Test 7 — order with COGS line present is NOT flagged', async () => {
    const insertCaptured: unknown[] = []
    // Checks 1-4 → empty; COGS account → found;
    // candidate orders → 1 order; COGS line check → found (has COGS line)
    configureDb(
      [[], [], [], [], [{ id: 'cogs-acct-1' }], [{ id: 'order-y', journalEntryId: 'je-y' }], [{ id: 'jl-1' }]],
      insertCaptured,
    )

    const result = await runLedgerReconciliation('biz-1')

    expect(result.issuesFound).toBe(0)
    expect(result.issues).toHaveLength(0)
    expect(insertCaptured).toHaveLength(0)
  })

  it('Test 8 — business with no COGS account skips Check 5', async () => {
    const insertCaptured: unknown[] = []
    // Checks 1-4 → empty; COGS account → not found ([] — no account with code 5001)
    configureDb([[], [], [], [], []], insertCaptured)

    const result = await runLedgerReconciliation('biz-1')

    expect(result.issuesFound).toBe(0)
    // db.select called 5 times: checks 1-4 + COGS account lookup
    // db.selectDistinct NOT called because COGS account was not found
    expect(db.select).toHaveBeenCalledTimes(5)
    expect((db as unknown as Record<string, Mock>).selectDistinct).not.toHaveBeenCalled()
  })
})
