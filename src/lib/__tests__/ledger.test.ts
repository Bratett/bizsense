import { describe, it, expect, vi } from 'vitest'
import { journalLines } from '@/db/schema'
import {
  postJournalEntry,
  reverseJournalEntry,
  type DrizzleTransaction,
  type PostJournalEntryInput,
} from '../ledger'

// ─── Mock tx factory ─────────────────────────────────────────────────────────
// Builds a mock DrizzleTransaction that captures all inserts.
// selectResults: sequential results returned by .where() on each tx.select() call.

function makeMockTx(options?: { insertReturnId?: string; selectResults?: unknown[][] }) {
  const insertReturnId = options?.insertReturnId ?? 'mock-entry-id'
  const selectResults = options?.selectResults ?? []
  let selectCallIdx = 0

  const capturedInserts: Array<{ table: unknown; data: unknown }> = []

  function makeInsertResult(id: string) {
    return {
      returning: vi.fn().mockResolvedValue([{ id }]),
      // Make the result directly awaitable (for lines insert without .returning())
      then: (
        onfulfilled?: ((v: unknown) => unknown) | null,
        onrejected?: ((e: unknown) => unknown) | null,
      ) => Promise.resolve([{ id }]).then(onfulfilled, onrejected),
      catch: (onrejected?: ((e: unknown) => unknown) | null) =>
        Promise.resolve([{ id }]).catch(onrejected),
      finally: (onfinally?: (() => void) | null) => Promise.resolve([{ id }]).finally(onfinally),
    }
  }

  const tx = {
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((data: unknown) => {
        capturedInserts.push({ table, data })
        return makeInsertResult(insertReturnId)
      }),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => {
          const result = selectResults[selectCallIdx] ?? []
          selectCallIdx++
          return Promise.resolve(result)
        }),
      })),
    })),
  }

  return {
    tx: tx as unknown as DrizzleTransaction,
    capturedInserts,
    insertMock: tx.insert,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeBalancedInput(overrides?: Partial<PostJournalEntryInput>): PostJournalEntryInput {
  return {
    businessId: 'biz-1',
    entryDate: '2026-01-01',
    sourceType: 'manual',
    description: 'Test entry',
    lines: [
      { accountId: 'acc-a', debitAmount: 500, creditAmount: 0 },
      { accountId: 'acc-b', debitAmount: 0, creditAmount: 500 },
    ],
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('postJournalEntry', () => {
  it('Test 1 — balanced entry posts successfully and returns an ID', async () => {
    const { tx } = makeMockTx({ insertReturnId: 'entry-abc' })

    const id = await postJournalEntry(tx, makeBalancedInput())

    expect(id).toBe('entry-abc')
  })

  it('Test 2 — imbalanced entry throws before writing to the database', async () => {
    const { tx, capturedInserts } = makeMockTx()

    const input = makeBalancedInput({
      lines: [
        { accountId: 'acc-a', debitAmount: 500, creditAmount: 0 },
        { accountId: 'acc-b', debitAmount: 0, creditAmount: 400 }, // ← off by 100
      ],
    })

    await expect(postJournalEntry(tx, input)).rejects.toThrow('does not balance')
    expect(capturedInserts).toHaveLength(0)
  })

  it('Test 3 — entry with fewer than 2 lines throws', async () => {
    const { tx } = makeMockTx()

    const input = makeBalancedInput({
      lines: [{ accountId: 'acc-a', debitAmount: 500, creditAmount: 500 }],
    })

    await expect(postJournalEntry(tx, input)).rejects.toThrow('at least two lines')
  })
})

describe('reverseJournalEntry', () => {
  it('Test 4 — reversal produces swapped amounts with correct metadata', async () => {
    const ORIGINAL_ID = 'entry-original'
    const ACCOUNT_A = 'acc-a'
    const ACCOUNT_B = 'acc-b'

    const originalEntry = {
      id: ORIGINAL_ID,
      businessId: 'biz-1',
      entryDate: '2026-01-01',
      description: 'Original sale',
      sourceType: 'order',
      sourceId: null,
      reversalOf: null,
      createdBy: null,
      aiGenerated: false,
      reference: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const originalLines = [
      {
        id: 'line-1',
        journalEntryId: ORIGINAL_ID,
        accountId: ACCOUNT_A,
        debitAmount: '300.00',
        creditAmount: '0.00',
        currency: 'GHS',
        fxRate: '1.0000',
        fxRateLockedAt: null,
        memo: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'line-2',
        journalEntryId: ORIGINAL_ID,
        accountId: ACCOUNT_B,
        debitAmount: '0.00',
        creditAmount: '300.00',
        currency: 'GHS',
        fxRate: '1.0000',
        fxRateLockedAt: null,
        memo: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]

    // First select call → original entry; second → original lines
    const { tx, capturedInserts } = makeMockTx({
      insertReturnId: 'reversal-id',
      selectResults: [[originalEntry], originalLines],
    })

    const reversalId = await reverseJournalEntry(
      tx,
      ORIGINAL_ID,
      'biz-1',
      'user-1',
      'Entered wrong amount',
    )

    expect(reversalId).toBe('reversal-id')

    // First insert is the journal entry header
    const headerInsert = capturedInserts[0].data as Record<string, unknown>
    expect(headerInsert.sourceType).toBe('reversal')
    expect(headerInsert.reversalOf).toBe(ORIGINAL_ID)
    expect(headerInsert.description).toContain('REVERSAL:')

    // Second insert is the journal lines
    const linesInsert = capturedInserts[1].data as Array<Record<string, unknown>>
    const lineA = linesInsert.find((l) => l.accountId === ACCOUNT_A)
    const lineB = linesInsert.find((l) => l.accountId === ACCOUNT_B)

    // Original: Dr A 300 / Cr B 300  →  Reversal: Dr B 300 / Cr A 300
    expect(lineA?.debitAmount).toBe('0.00')
    expect(lineA?.creditAmount).toBe('300.00')
    expect(lineB?.debitAmount).toBe('300.00')
    expect(lineB?.creditAmount).toBe('0.00')
  })
})

describe('trial balance invariant', () => {
  it('Test 5 — SUM(debits) equals SUM(credits) across multiple posted entries', async () => {
    const allInsertedLines: Array<Record<string, string>> = []
    let entryCounter = 0

    // Custom tx that accumulates all journal line inserts
    const tx = {
      insert: vi.fn((table: unknown) => ({
        values: vi.fn((data: unknown) => {
          if (table === journalLines) {
            allInsertedLines.push(...(data as Array<Record<string, string>>))
          }
          entryCounter++
          const id = `entry-${entryCounter}`
          return {
            returning: vi.fn().mockResolvedValue([{ id }]),
            then: (
              onfulfilled?: ((v: unknown) => unknown) | null,
              onrejected?: ((e: unknown) => unknown) | null,
            ) => Promise.resolve([{ id }]).then(onfulfilled, onrejected),
            catch: (onrejected?: ((e: unknown) => unknown) | null) =>
              Promise.resolve([{ id }]).catch(onrejected),
            finally: (onfinally?: (() => void) | null) =>
              Promise.resolve([{ id }]).finally(onfinally),
          }
        }),
      })),
      select: vi.fn(),
    } as unknown as DrizzleTransaction

    const base: Omit<PostJournalEntryInput, 'lines'> = {
      businessId: 'biz-1',
      entryDate: '2026-01-01',
      sourceType: 'manual',
    }

    // Entry 1: Dr Cash 1000 / Cr Sales 1000
    await postJournalEntry(tx, {
      ...base,
      lines: [
        { accountId: 'cash', debitAmount: 1000, creditAmount: 0 },
        { accountId: 'sales', debitAmount: 0, creditAmount: 1000 },
      ],
    })

    // Entry 2: Dr Expense 200 / Cr Cash 200
    await postJournalEntry(tx, {
      ...base,
      lines: [
        { accountId: 'expense', debitAmount: 200, creditAmount: 0 },
        { accountId: 'cash', debitAmount: 0, creditAmount: 200 },
      ],
    })

    // Entry 3: Dr Receivable 300 + Dr Discount 50 / Cr Sales 350
    await postJournalEntry(tx, {
      ...base,
      lines: [
        { accountId: 'receivable', debitAmount: 300, creditAmount: 0 },
        { accountId: 'discount', debitAmount: 50, creditAmount: 0 },
        { accountId: 'sales', debitAmount: 0, creditAmount: 350 },
      ],
    })

    const totalDebits = allInsertedLines.reduce((sum, l) => sum + Number(l.debitAmount), 0)
    const totalCredits = allInsertedLines.reduce((sum, l) => sum + Number(l.creditAmount), 0)

    expect(totalDebits).toBe(totalCredits)
    // Sanity check the actual value
    expect(totalDebits).toBe(1550)
  })
})
