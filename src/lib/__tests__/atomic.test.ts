import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests for atomicTransactionWrite — validates that both the journal entry
 * and the source record succeed or fail together (no orphan records).
 *
 * These tests mock the db.transaction wrapper to verify:
 *   1. Normal case: both writes succeed → result returned
 *   2. If writeSourceRecord throws → entire transaction rolls back (no journal entry committed)
 *   3. If postJournalEntry throws (imbalanced) → no source record written
 */

// We mock the db module at the top level
vi.mock('@/db', () => ({
  db: {
    transaction: vi.fn(),
  },
}))

// Mock ledger.ts postJournalEntry
vi.mock('../ledger', () => ({
  postJournalEntry: vi.fn(),
}))

import { db } from '@/db'
import { postJournalEntry } from '../ledger'
import { atomicTransactionWrite } from '../atomic'
import type { PostJournalEntryInput } from '../ledger'

const mockedTransaction = vi.mocked(db.transaction)
const mockedPostJournal = vi.mocked(postJournalEntry)

const MOCK_JOURNAL_INPUT: PostJournalEntryInput = {
  businessId: 'biz-1',
  entryDate: '2025-01-01',
  reference: 'TEST-001',
  description: 'Test entry',
  sourceType: 'expense',
  sourceId: 'exp-1',
  createdBy: 'user-1',
  lines: [
    { accountId: 'acc-1', debitAmount: 100, creditAmount: 0, memo: 'Debit' },
    { accountId: 'acc-2', debitAmount: 0, creditAmount: 100, memo: 'Credit' },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default: db.transaction calls the callback with a mock tx
  mockedTransaction.mockImplementation(async (callback) => {
    const mockTx = {} // the mock tx object passed into the callback
    return callback(mockTx as never)
  })
})

describe('atomicTransactionWrite', () => {
  it('returns the result of writeSourceRecord when both succeed', async () => {
    mockedPostJournal.mockResolvedValue('journal-1')

    const writeSourceRecord = vi.fn().mockResolvedValue({ id: 'order-1', name: 'Test Order' })

    const result = await atomicTransactionWrite(MOCK_JOURNAL_INPUT, writeSourceRecord)

    expect(result).toEqual({ id: 'order-1', name: 'Test Order' })
    expect(mockedPostJournal).toHaveBeenCalledTimes(1)
    expect(writeSourceRecord).toHaveBeenCalledTimes(1)
    // writeSourceRecord receives (tx, journalEntryId)
    expect(writeSourceRecord).toHaveBeenCalledWith(expect.anything(), 'journal-1')
  })

  it('rolls back the entire transaction if writeSourceRecord throws', async () => {
    mockedPostJournal.mockResolvedValue('journal-1')

    const sourceError = new Error('Source record insert failed')
    const writeSourceRecord = vi.fn().mockRejectedValue(sourceError)

    // The transaction wrapper should propagate the error (simulating Postgres rollback)
    await expect(
      atomicTransactionWrite(MOCK_JOURNAL_INPUT, writeSourceRecord),
    ).rejects.toThrow('Source record insert failed')

    // postJournalEntry was called (journal write attempted) but the transaction
    // as a whole failed, meaning Postgres would roll back the journal insert too.
    expect(mockedPostJournal).toHaveBeenCalledTimes(1)
    expect(writeSourceRecord).toHaveBeenCalledTimes(1)
  })

  it('never calls writeSourceRecord if postJournalEntry throws (imbalanced entry)', async () => {
    mockedPostJournal.mockRejectedValue(
      new Error('Journal entry does not balance: dr=100 cr=50'),
    )

    const writeSourceRecord = vi.fn().mockResolvedValue({ id: 'should-not-run' })

    await expect(
      atomicTransactionWrite(MOCK_JOURNAL_INPUT, writeSourceRecord),
    ).rejects.toThrow('Journal entry does not balance')

    expect(mockedPostJournal).toHaveBeenCalledTimes(1)
    // writeSourceRecord should never be called — postJournalEntry threw first
    expect(writeSourceRecord).not.toHaveBeenCalled()
  })

  it('wraps both operations in a single db.transaction call', async () => {
    mockedPostJournal.mockResolvedValue('journal-1')
    const writeSourceRecord = vi.fn().mockResolvedValue({ id: 'order-1' })

    await atomicTransactionWrite(MOCK_JOURNAL_INPUT, writeSourceRecord)

    // Verify db.transaction was called exactly once (both writes in one tx)
    expect(mockedTransaction).toHaveBeenCalledTimes(1)
  })
})
