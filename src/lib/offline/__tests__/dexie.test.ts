import { describe, it, expect, beforeEach } from 'vitest'
import {
  localDb,
  nextLocalSequence,
  getDevicePrefix,
  type DexieOrder,
  type DexieJournalEntry,
  type DexieSyncQueueItem,
  type DexieDeferredJournal,
} from '@/db/local/dexie'

// ── Test 1: localDb opens without error ─────────────────────────────────────
describe('localDb', () => {
  it('opens without error', async () => {
    await expect(localDb.open()).resolves.not.toThrow()
  })

  it('has all declared tables', () => {
    const expectedTables = [
      'businesses',
      'accounts',
      'taxComponents',
      'journalEntries',
      'journalLines',
      'customers',
      'orders',
      'orderLines',
      'expenses',
      'products',
      'inventoryTransactions',
      'suppliers',
      'fxRates',
      'deferredJournals',
      'syncQueue',
      'meta',
    ]
    const actualTables = localDb.tables.map((t) => t.name)
    for (const table of expectedTables) {
      expect(actualTables).toContain(table)
    }
  })
})

// ── Test 2 & 3: meta table helpers ───────────────────────────────────────────
describe('nextLocalSequence', () => {
  beforeEach(async () => {
    await localDb.meta.clear()
  })

  it('returns 1 on first call', async () => {
    const seq = await nextLocalSequence('test')
    expect(seq).toBe(1)
  })

  it('returns 2 on second call', async () => {
    await nextLocalSequence('test')
    const seq = await nextLocalSequence('test')
    expect(seq).toBe(2)
  })
})

describe('getDevicePrefix', () => {
  beforeEach(async () => {
    await localDb.meta.clear()
  })

  it('returns the same value on repeated calls', async () => {
    const first = await getDevicePrefix()
    const second = await getDevicePrefix()
    expect(first).toBe(second)
  })

  it('returns a non-empty string', async () => {
    const prefix = await getDevicePrefix()
    expect(typeof prefix).toBe('string')
    expect(prefix.length).toBeGreaterThan(0)
  })
})

// ── Test 5: DexieOrder insert and retrieval round-trip ────────────────────────
describe('orders table', () => {
  beforeEach(async () => {
    await localDb.orders.clear()
  })

  it('round-trips an order correctly (dates as strings)', async () => {
    const order: DexieOrder = {
      id: 'ord-001',
      businessId: 'biz-001',
      orderNumber: 'ORD-0001',
      localOrderNumber: null,
      customerId: 'cust-001',
      orderDate: '2024-01-15',
      status: 'confirmed',
      paymentStatus: 'paid',
      subtotal: 100,
      discountAmount: 0,
      taxAmount: 21.9,
      totalAmount: 121.9,
      amountPaid: 121.9,
      paymentMethod: 'momo',
      fxRate: null,
      notes: null,
      journalEntryId: null,
      aiGenerated: false,
      syncStatus: 'pending',
      updatedAt: '2024-01-15T10:00:00.000Z',
    }

    await localDb.orders.add(order)
    const retrieved = await localDb.orders.get('ord-001')

    expect(retrieved).toBeDefined()
    expect(retrieved!.id).toBe('ord-001')
    expect(retrieved!.orderDate).toBe('2024-01-15')
    expect(retrieved!.totalAmount).toBe(121.9)
    expect(retrieved!.syncStatus).toBe('pending')
    expect(retrieved!.updatedAt).toBe('2024-01-15T10:00:00.000Z')
  })
})

// ── Test 6: Compound index [businessId+entryDate] on journalEntries ───────────
describe('journalEntries compound index', () => {
  beforeEach(async () => {
    await localDb.journalEntries.clear()
  })

  it('query by [businessId+entryDate] returns correct rows', async () => {
    const entries: DexieJournalEntry[] = [
      {
        id: 'je-001',
        businessId: 'biz-001',
        entryDate: '2024-01-15',
        reference: null,
        description: 'Sale',
        sourceType: 'order',
        sourceId: 'ord-001',
        aiGenerated: false,
        syncStatus: 'synced',
        updatedAt: '2024-01-15T10:00:00.000Z',
      },
      {
        id: 'je-002',
        businessId: 'biz-001',
        entryDate: '2024-01-16',
        reference: null,
        description: 'Expense',
        sourceType: 'expense',
        sourceId: 'exp-001',
        aiGenerated: false,
        syncStatus: 'synced',
        updatedAt: '2024-01-16T10:00:00.000Z',
      },
      {
        id: 'je-003',
        businessId: 'biz-002',
        entryDate: '2024-01-15',
        reference: null,
        description: 'Other biz',
        sourceType: 'order',
        sourceId: 'ord-002',
        aiGenerated: false,
        syncStatus: 'synced',
        updatedAt: '2024-01-15T10:00:00.000Z',
      },
    ]

    await localDb.journalEntries.bulkAdd(entries)

    const results = await localDb.journalEntries
      .where('[businessId+entryDate]')
      .equals(['biz-001', '2024-01-15'])
      .toArray()

    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('je-001')
  })
})

// ── Test 7: syncQueue auto-increment ──────────────────────────────────────────
describe('syncQueue auto-increment', () => {
  beforeEach(async () => {
    await localDb.syncQueue.clear()
  })

  it('two inserts get sequential ids (1, 2)', async () => {
    const base: Omit<DexieSyncQueueItem, 'id'> = {
      tableName: 'orders',
      recordId: 'ord-001',
      operation: 'upsert',
      payload: { id: 'ord-001' },
      createdAt: new Date().toISOString(),
      status: 'pending',
      attempts: 0,
      lastError: null,
    }

    const id1 = await localDb.syncQueue.add({ ...base, recordId: 'ord-001' })
    const id2 = await localDb.syncQueue.add({ ...base, recordId: 'ord-002' })

    expect(id1).toBe(1)
    expect(id2).toBe(2)
  })
})

// ── Test 8: DexieDeferredJournal insert and filter by status ─────────────────
describe('deferredJournals', () => {
  beforeEach(async () => {
    await localDb.deferredJournals.clear()
  })

  it('insert and filter by status=pending works', async () => {
    const pending: DexieDeferredJournal = {
      id: 'dj-001',
      businessId: 'biz-001',
      sourceTable: 'orders',
      sourceId: 'ord-001',
      proposedEntry: {
        entryDate: '2024-01-15',
        description: 'Sale posting',
        sourceType: 'order',
        lines: [
          { accountCode: '1001', debitAmount: 121.9, creditAmount: 0, currency: 'GHS', fxRate: 1 },
          { accountCode: '4001', debitAmount: 0, creditAmount: 100, currency: 'GHS', fxRate: 1 },
          { accountCode: '2100', debitAmount: 0, creditAmount: 21.9, currency: 'GHS', fxRate: 1 },
        ],
      },
      status: 'pending',
      createdAt: new Date().toISOString(),
    }

    const promoted: DexieDeferredJournal = {
      ...pending,
      id: 'dj-002',
      sourceId: 'ord-002',
      status: 'promoted',
    }

    await localDb.deferredJournals.bulkAdd([pending, promoted])

    const pendingResults = await localDb.deferredJournals
      .where('status')
      .equals('pending')
      .toArray()

    expect(pendingResults).toHaveLength(1)
    expect(pendingResults[0].id).toBe('dj-001')
    expect(pendingResults[0].proposedEntry.lines).toHaveLength(3)
  })
})
