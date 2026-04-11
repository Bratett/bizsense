import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Module mocks (hoisted before imports) ──────────────────────────────────

vi.mock('@/lib/session', () => ({
  getServerSession: vi.fn(),
}))

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
  },
}))

vi.mock('@/lib/ledger', () => ({
  reverseJournalEntry: vi.fn().mockResolvedValue('je-reversal-001'),
}))

import { getServerSession } from '@/lib/session'
import { db } from '@/db'
import { reverseJournalEntry } from '@/lib/ledger'
import { reverseOrder } from '../orders'

// ─── Constants ───────────────────────────────────────────────────────────────

const BUSINESS_ID = 'biz-test-001'
const USER_ID = 'user-test-001'
const ORDER_ID = 'order-001'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeChain(result: unknown[]) {
  const chain: Record<string, unknown> = {
    then: (f?: ((v: unknown) => unknown) | null, r?: ((e: unknown) => unknown) | null) =>
      Promise.resolve(result).then(f, r),
    catch: (f?: ((e: unknown) => unknown) | null) => Promise.resolve(result).catch(f),
    finally: (f?: (() => void) | null) => Promise.resolve(result).finally(f),
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
  }
  return chain
}

function mockSession(role: 'owner' | 'manager' | 'cashier' = 'owner') {
  vi.mocked(getServerSession).mockResolvedValue({
    user: {
      id: USER_ID,
      email: 'owner@test.com',
      businessId: BUSINESS_ID,
      role,
      fullName: 'Test Owner',
    },
  })
}

type TxInsert = { productId?: string; transactionType?: string; quantity?: string }
type TxUpdate = { data: Record<string, unknown> }

function mockDbTransaction() {
  const txInserts: TxInsert[] = []
  const txUpdates: TxUpdate[] = []

  vi.mocked(db.transaction).mockImplementationOnce(async (callback) => {
    const mockTx = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn((data: unknown) => {
          txInserts.push(data as TxInsert)
          return {
            returning: vi.fn().mockResolvedValue([data]),
            then: (f?: ((v: unknown) => unknown) | null) => Promise.resolve([data]).then(f),
            catch: (f?: ((e: unknown) => unknown) | null) => Promise.resolve([data]).catch(f),
            finally: (f?: (() => void) | null) => Promise.resolve([data]).finally(f),
          }
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn((data: unknown) => {
          txUpdates.push({ data: data as Record<string, unknown> })
          return { where: vi.fn().mockResolvedValue(undefined) }
        }),
      }),
    }
    return callback(mockTx as never)
  })

  return { txInserts, txUpdates }
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks()
  mockSession()
})

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('reverseOrder — sales return', () => {
  it('Test 14 — owner reverses fulfilled paid order, restockInventory=true', async () => {
    // Order
    const mockOrder = {
      id: ORDER_ID,
      businessId: BUSINESS_ID,
      orderNumber: 'ORD-X7KQ-0001',
      status: 'fulfilled',
      paymentStatus: 'paid',
      journalEntryId: 'je-sale-001',
    }

    // Payments for this order (1 payment journal entry to reverse first)
    const mockPayments = [{ journalEntryId: 'je-payment-001' }]

    // Inventory transactions to restock
    const mockInvTxs = [{ productId: 'prod-001', quantity: '-3.00', unitCost: '50.00' }]

    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain([mockOrder]) as never) // order fetch
      .mockReturnValueOnce(makeChain(mockPayments) as never) // paymentsReceived
      .mockReturnValueOnce(makeChain(mockInvTxs) as never) // inventory transactions

    const { txInserts, txUpdates } = mockDbTransaction()

    const result = await reverseOrder({
      orderId: ORDER_ID,
      reason: 'Customer returned goods',
      restockInventory: true,
    })

    expect(result.success).toBe(true)

    // reverseJournalEntry called twice: payment JE first, then sale JE
    expect(reverseJournalEntry).toHaveBeenCalledTimes(2)
    const calls = vi.mocked(reverseJournalEntry).mock.calls
    expect(calls[0][1]).toBe('je-payment-001') // payment JE reversed first
    expect(calls[1][1]).toBe('je-sale-001') // sale JE reversed second

    // inventory_transaction return_in inserted
    expect(txInserts).toHaveLength(1)
    const restockTx = txInserts[0]
    expect(restockTx.transactionType).toBe('return_in')
    expect(restockTx.quantity).toBe('3.00') // abs of -3.00

    // order updated to cancelled
    expect(txUpdates).toHaveLength(1)
    expect(txUpdates[0].data.status).toBe('cancelled')
  })

  it('Test 15 — cashier role: returns error, db.transaction not called', async () => {
    mockSession('cashier')

    const result = await reverseOrder({
      orderId: ORDER_ID,
      reason: 'Cashier trying to return',
      restockInventory: false,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toMatch(/only owners and managers/i)
    }
    expect(db.transaction).not.toHaveBeenCalled()
  })

  it('Test 16 — order already cancelled: returns error, db.transaction not called', async () => {
    const cancelledOrder = {
      id: ORDER_ID,
      businessId: BUSINESS_ID,
      orderNumber: 'ORD-X7KQ-0001',
      status: 'cancelled',
      journalEntryId: 'je-sale-001',
    }

    vi.mocked(db.select).mockReturnValueOnce(makeChain([cancelledOrder]) as never)

    const result = await reverseOrder({
      orderId: ORDER_ID,
      reason: 'Already cancelled',
      restockInventory: false,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toMatch(/already cancelled/i)
    }
    expect(db.transaction).not.toHaveBeenCalled()
  })
})
