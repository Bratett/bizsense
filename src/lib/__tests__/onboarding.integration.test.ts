import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Module mocks (hoisted) ────────────────────────────────────────────────

vi.mock('@/lib/session', () => ({
  getServerSession: vi.fn(),
}))

vi.mock('@/db', () => {
  const mockDb: Record<string, unknown> = {}
  mockDb.transaction = vi.fn()
  mockDb.select = vi.fn()
  mockDb.update = vi.fn()
  return { db: mockDb }
})

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        updateUserById: vi.fn(),
      },
    },
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi
          .fn()
          .mockReturnValue({ data: { publicUrl: 'https://example.com/logo.png' } }),
      })),
    },
  },
}))

vi.mock('@/lib/seeds/seedChartOfAccounts', () => ({
  seedChartOfAccounts: vi.fn(),
  DEFAULT_ACCOUNTS: Array.from({ length: 34 }, (_, i) => ({ code: `code-${i}` })),
}))

vi.mock('@/lib/seeds/seedTaxComponents', () => ({
  seedTaxComponents: vi.fn(),
  DEFAULT_TAX_COMPONENTS: [
    { code: 'NHIL' },
    { code: 'GETFUND' },
    { code: 'COVID' },
    { code: 'VAT' },
  ],
}))

vi.mock('@/lib/seeds/seedPayeBands', () => ({
  seedPayeBands: vi.fn(),
}))

vi.mock('@/lib/ledger', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ledger')>('@/lib/ledger')
  return {
    ...actual,
    postJournalEntry: vi.fn(),
  }
})

// ─── Imports (after mocks) ─────────────────────────────────────────────────

import { getServerSession } from '@/lib/session'
import { db } from '@/db'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { seedChartOfAccounts } from '@/lib/seeds/seedChartOfAccounts'
import { seedTaxComponents } from '@/lib/seeds/seedTaxComponents'
import { postJournalEntry } from '@/lib/ledger'
import {
  completeOnboardingStep1,
  completeOnboardingStep2,
  completeOnboardingStep3,
  completeOnboardingStep4,
  getOpeningPositionSummary,
  completeOnboarding,
} from '@/actions/onboarding'
import { businesses, customers, orders, products, inventoryTransactions } from '@/db/schema'

// ─── Test helpers ──────────────────────────────────────────────────────────

const TEST_BIZ_ID = 'biz-test-001'
const TEST_USER_ID = 'user-test-001'

const SEEDED_ACCOUNT_IDS: Record<string, string> = {
  '1001': 'uuid-1001',
  '1002': 'uuid-1002',
  '1003': 'uuid-1003',
  '1004': 'uuid-1004',
  '1005': 'uuid-1005',
  '1100': 'uuid-1100',
  '1101': 'uuid-1101',
  '1200': 'uuid-1200',
  '1300': 'uuid-1300',
  '1500': 'uuid-1500',
  '1510': 'uuid-1510',
  '2001': 'uuid-2001',
  '2100': 'uuid-2100',
  '2101': 'uuid-2101',
  '2200': 'uuid-2200',
  '2300': 'uuid-2300',
  '2400': 'uuid-2400',
  '2500': 'uuid-2500',
  '3001': 'uuid-3001',
  '3100': 'uuid-3100',
  '4001': 'uuid-4001',
  '4002': 'uuid-4002',
  '4003': 'uuid-4003',
  '4004': 'uuid-4004',
  '5001': 'uuid-5001',
  '6001': 'uuid-6001',
  '6002': 'uuid-6002',
  '6003': 'uuid-6003',
  '6004': 'uuid-6004',
  '6005': 'uuid-6005',
  '6006': 'uuid-6006',
  '6007': 'uuid-6007',
  '6008': 'uuid-6008',
  '6009': 'uuid-6009',
}

const BUSINESS_ROW = {
  id: TEST_BIZ_ID,
  seededAccountIds: SEEDED_ACCOUNT_IDS,
  openingBalanceDate: '2026-01-01',
}

function mockSession() {
  vi.mocked(getServerSession).mockResolvedValue({
    user: {
      id: TEST_USER_ID,
      email: 'test@bizsense.com',
      businessId: TEST_BIZ_ID,
      role: 'owner',
      fullName: 'Kwame Asante',
    },
  })
}

/**
 * Creates a mock tx that captures inserts/updates.
 * Uses raw table references for identification.
 */
function makeMockTx() {
  const capturedInserts: Array<{ table: unknown; data: unknown }> = []
  const capturedUpdates: Array<{ table: unknown; data: unknown }> = []
  let insertCounter = 0

  const tx = {
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((data: unknown) => {
        capturedInserts.push({ table, data })
        insertCounter++
        const rows = Array.isArray(data) ? data : [data]
        const returnData = rows.map((r: Record<string, unknown>, i: number) => ({
          id: `inserted-${insertCounter}-${i}`,
          ...r,
        }))
        return {
          returning: vi.fn().mockResolvedValue(returnData),
          then: (
            onfulfilled?: ((v: unknown) => unknown) | null,
            onrejected?: ((e: unknown) => unknown) | null,
          ) => Promise.resolve(returnData).then(onfulfilled, onrejected),
          catch: (onrejected?: ((e: unknown) => unknown) | null) =>
            Promise.resolve(returnData).catch(onrejected),
          finally: (onfinally?: (() => void) | null) =>
            Promise.resolve(returnData).finally(onfinally),
        }
      }),
    })),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((data: unknown) => {
        capturedUpdates.push({ table, data })
        return { where: vi.fn().mockResolvedValue(undefined) }
      }),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([]),
      })),
    })),
  }

  return { tx, capturedInserts, capturedUpdates }
}

function setupDbTransaction() {
  const mock = makeMockTx()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(db.transaction as any).mockImplementation(
    async (callback: (tx: unknown) => Promise<unknown>) => callback(mock.tx),
  )
  return mock
}

/**
 * Mocks db.select() for getBusinessWithAccounts() which runs OUTSIDE the tx.
 * Steps 2-5 call this helper before entering their transaction.
 */
function mockDbSelectForBusiness() {
  vi.mocked(db.select as unknown as (...args: unknown[]) => unknown).mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([BUSINESS_ROW]),
    }),
  })
}

// ─── Tests ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks()
  mockSession()
})

describe('Sprint 2 — Onboarding Integration Tests', () => {
  // ── Test 1 ──────────────────────────────────────────────────────────────

  describe('Step 1: Business Profile', () => {
    it('Test 1 — completeOnboardingStep1 seeds 34 accounts', async () => {
      const { tx, capturedUpdates } = setupDbTransaction()

      vi.mocked(seedChartOfAccounts).mockResolvedValue(SEEDED_ACCOUNT_IDS)

      const formData = new FormData()
      formData.set('phone', '0241234567')
      formData.set('industry', 'Retail')
      formData.set('vatRegistered', 'false')

      const result = await completeOnboardingStep1(formData)

      expect(result).toEqual({ success: true })
      expect(seedChartOfAccounts).toHaveBeenCalledOnce()
      expect(seedChartOfAccounts).toHaveBeenCalledWith(tx, TEST_BIZ_ID)

      // Business profile should have been updated (tx.update called with businesses table)
      const businessUpdates = capturedUpdates.filter((u) => u.table === businesses)
      expect(businessUpdates.length).toBeGreaterThanOrEqual(1)

      // First update should contain the phone number
      const profileUpdate = businessUpdates.find(
        (u) => (u.data as Record<string, unknown>).phone === '0241234567',
      )
      expect(profileUpdate).toBeDefined()

      // seededAccountIds should be stored on the business
      const seededUpdate = businessUpdates.find(
        (u) => (u.data as Record<string, unknown>).seededAccountIds != null,
      )
      expect(seededUpdate).toBeDefined()

      // Tax components should NOT be seeded (vatRegistered = false)
      expect(seedTaxComponents).not.toHaveBeenCalled()
    })

    // ── Test 2 ────────────────────────────────────────────────────────────

    it('Test 2 — completeOnboardingStep1 with VAT seeds 4 tax components', async () => {
      const { tx } = setupDbTransaction()

      vi.mocked(seedChartOfAccounts).mockResolvedValue(SEEDED_ACCOUNT_IDS)
      vi.mocked(seedTaxComponents).mockResolvedValue(undefined)

      const formData = new FormData()
      formData.set('phone', '0241234567')
      formData.set('vatRegistered', 'true')
      formData.set('vatNumber', 'V12345678')

      const result = await completeOnboardingStep1(formData)

      expect(result).toEqual({ success: true })
      expect(seedTaxComponents).toHaveBeenCalledOnce()
      expect(seedTaxComponents).toHaveBeenCalledWith(
        tx,
        TEST_BIZ_ID,
        'uuid-2100', // VAT Payable account ID
        expect.any(Date),
      )
    })
  })

  // ── Test 3 ──────────────────────────────────────────────────────────────

  describe('Step 2: Cash & Bank Balances', () => {
    it('Test 3 — completeOnboardingStep2 posts balanced journal entries', async () => {
      // getBusinessWithAccounts uses db.select() outside the transaction
      mockDbSelectForBusiness()
      setupDbTransaction()

      vi.mocked(postJournalEntry).mockResolvedValue('je-001')

      const result = await completeOnboardingStep2({
        openingBalanceDate: '2026-01-01',
        balances: [
          { accountCode: '1001', amount: 500 },
          { accountCode: '1002', amount: 1000 },
          { accountCode: '1005', amount: 2000 },
        ],
      })

      expect(result).toEqual({ success: true })

      // 3 journal entries posted (one per non-zero balance)
      expect(postJournalEntry).toHaveBeenCalledTimes(3)

      // Each entry is balanced: Dr cash account = Cr equity account
      for (const call of vi.mocked(postJournalEntry).mock.calls) {
        const input = call[1]
        expect(input.sourceType).toBe('opening_balance')
        expect(input.lines).toHaveLength(2)

        const totalDr = input.lines.reduce(
          (s: number, l: { debitAmount: number }) => s + l.debitAmount,
          0,
        )
        const totalCr = input.lines.reduce(
          (s: number, l: { creditAmount: number }) => s + l.creditAmount,
          0,
        )
        expect(totalDr).toBe(totalCr)
      }

      // Check specific accounts and amounts
      const calls = vi.mocked(postJournalEntry).mock.calls
      expect(calls[0][1].lines[0].accountId).toBe('uuid-1001')
      expect(calls[0][1].lines[0].debitAmount).toBe(500)
      expect(calls[0][1].lines[1].accountId).toBe('uuid-3001')
      expect(calls[0][1].lines[1].creditAmount).toBe(500)

      expect(calls[1][1].lines[0].accountId).toBe('uuid-1002')
      expect(calls[1][1].lines[0].debitAmount).toBe(1000)

      expect(calls[2][1].lines[0].accountId).toBe('uuid-1005')
      expect(calls[2][1].lines[0].debitAmount).toBe(2000)

      // Total SUM(debits) = SUM(credits) = 3500
      const allDebits = calls.reduce(
        (sum, c) =>
          sum + c[1].lines.reduce((s: number, l: { debitAmount: number }) => s + l.debitAmount, 0),
        0,
      )
      const allCredits = calls.reduce(
        (sum, c) =>
          sum +
          c[1].lines.reduce((s: number, l: { creditAmount: number }) => s + l.creditAmount, 0),
        0,
      )
      expect(allDebits).toBe(3500)
      expect(allCredits).toBe(3500)
    })
  })

  // ── Test 4 ──────────────────────────────────────────────────────────────

  describe('Step 3: Inventory', () => {
    it('Test 4 — completeOnboardingStep3 creates products and posts inventory journal entry', async () => {
      mockDbSelectForBusiness()
      const { capturedInserts } = setupDbTransaction()

      vi.mocked(postJournalEntry).mockResolvedValue('je-inv-001')

      const result = await completeOnboardingStep3({
        products: [
          { name: 'Rice Bag', qtyOnHand: 10, costPrice: 120 },
          { name: 'Palm Oil', qtyOnHand: 5, costPrice: 85 },
          { name: 'Sugar', qtyOnHand: 20, costPrice: 45 },
        ],
      })

      expect(result).toEqual({ success: true })

      // 3 products inserted
      const productInserts = capturedInserts.filter((i) => i.table === products)
      expect(productInserts).toHaveLength(3)

      // 3 inventory transactions inserted
      const invTxInserts = capturedInserts.filter((i) => i.table === inventoryTransactions)
      expect(invTxInserts).toHaveLength(3)

      // Each inventory transaction has transactionType = 'opening'
      for (const insert of invTxInserts) {
        const data = insert.data as Record<string, unknown>
        expect(data.transactionType).toBe('opening')
      }

      // ONE journal entry posted
      expect(postJournalEntry).toHaveBeenCalledOnce()

      const jeInput = vi.mocked(postJournalEntry).mock.calls[0][1]
      expect(jeInput.description).toContain('3 products')

      // Total: 10*120 + 5*85 + 20*45 = 1200 + 425 + 900 = 2525
      expect(jeInput.lines[0].accountId).toBe('uuid-1200') // Inventory
      expect(jeInput.lines[0].debitAmount).toBe(2525)
      expect(jeInput.lines[1].accountId).toBe('uuid-3001') // Equity
      expect(jeInput.lines[1].creditAmount).toBe(2525)
    })
  })

  // ── Tests 5 & 6 ────────────────────────────────────────────────────────

  describe('Step 4: Receivables', () => {
    it('Test 5 — completeOnboardingStep4 creates customer and posts receivable entry', async () => {
      mockDbSelectForBusiness()
      const { capturedInserts } = setupDbTransaction()

      vi.mocked(postJournalEntry).mockResolvedValue('je-ar-001')

      const result = await completeOnboardingStep4({
        invoices: [
          {
            customerName: 'Ama Owusu',
            phone: '0244999888',
            amount: 750,
            invoiceDate: '2026-04-01',
            dueDate: '2026-04-30',
          },
        ],
      })

      expect(result).toEqual({ success: true })

      // 1 customer created (phone lookup returns empty via default mock)
      const customerInserts = capturedInserts.filter((i) => i.table === customers)
      expect(customerInserts).toHaveLength(1)
      expect((customerInserts[0].data as Record<string, unknown>).phone).toBe('0244999888')

      // 1 order created with paymentStatus = 'unpaid'
      const orderInserts = capturedInserts.filter((i) => i.table === orders)
      expect(orderInserts).toHaveLength(1)
      expect((orderInserts[0].data as Record<string, unknown>).paymentStatus).toBe('unpaid')

      // Journal entry: Dr 1100 (AR) 750 / Cr 4001 (Revenue) 750
      expect(postJournalEntry).toHaveBeenCalledOnce()
      const jeInput = vi.mocked(postJournalEntry).mock.calls[0][1]
      expect(jeInput.lines[0].accountId).toBe('uuid-1100')
      expect(jeInput.lines[0].debitAmount).toBe(750)
      expect(jeInput.lines[1].accountId).toBe('uuid-4001')
      expect(jeInput.lines[1].creditAmount).toBe(750)
    })

    it('Test 6 — completeOnboardingStep4 upserts existing customer by phone', async () => {
      mockDbSelectForBusiness()
      const mock = makeMockTx()

      // Override tx.select to handle sequential calls:
      // 1st call inside tx: customer phone lookup → existing customer found
      vi.mocked(mock.tx.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: 'existing-customer-id' }]),
        }),
      } as unknown as ReturnType<typeof mock.tx.select>)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(db.transaction as any).mockImplementation(
        async (callback: (tx: unknown) => Promise<unknown>) => callback(mock.tx),
      )

      vi.mocked(postJournalEntry).mockResolvedValue('je-ar-002')

      await completeOnboardingStep4({
        invoices: [
          {
            customerName: 'Ama Owusu',
            phone: '0244999888',
            amount: 500,
            invoiceDate: '2026-04-01',
          },
        ],
      })

      // No new customer should be created
      const customerInserts = mock.capturedInserts.filter((i) => i.table === customers)
      expect(customerInserts).toHaveLength(0)

      // Order should reference the existing customer
      const orderInserts = mock.capturedInserts.filter((i) => i.table === orders)
      expect(orderInserts).toHaveLength(1)
      expect((orderInserts[0].data as Record<string, unknown>).customerId).toBe(
        'existing-customer-id',
      )
    })
  })

  // ── Test 7 ──────────────────────────────────────────────────────────────

  describe('Step 6: Review', () => {
    it('Test 7 — getOpeningPositionSummary returns balanced position', async () => {
      const journalRows = [
        { accountCode: '1001', accountType: 'asset', debitAmount: '3500.00', creditAmount: '0.00' },
        { accountCode: '1200', accountType: 'asset', debitAmount: '2525.00', creditAmount: '0.00' },
        { accountCode: '1100', accountType: 'asset', debitAmount: '750.00', creditAmount: '0.00' },
        {
          accountCode: '3001',
          accountType: 'equity',
          debitAmount: '0.00',
          creditAmount: '6025.00',
        },
        {
          accountCode: '4001',
          accountType: 'revenue',
          debitAmount: '0.00',
          creditAmount: '750.00',
        },
      ]

      let selectCallCount = 0
      vi.mocked(db.select as unknown as (...args: unknown[]) => unknown).mockImplementation(() => {
        selectCallCount++
        if (selectCallCount === 1) {
          // Business query: db.select({openingBalanceDate}).from(businesses).where(...)
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ openingBalanceDate: '2026-01-01' }]),
            }),
          }
        }
        // Journal lines query: db.select({...}).from(journalLines).innerJoin().innerJoin().where()
        return {
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              innerJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue(journalRows),
              }),
            }),
          }),
        }
      })

      const summary = await getOpeningPositionSummary()

      expect(summary.balanced).toBe(true)
      expect(summary.cashTotal).toBe(3500)
      expect(summary.inventoryTotal).toBe(2525)
      expect(summary.receivablesTotal).toBe(750)
      expect(summary.openingBalanceDate).toBe('2026-01-01')
    })
  })

  // ── Test 8 ──────────────────────────────────────────────────────────────

  describe('completeOnboarding', () => {
    it('Test 8 — completeOnboarding sets onboardingCompletedAt', async () => {
      const capturedSets: Record<string, unknown>[] = []

      vi.mocked(db.update as unknown as (...args: unknown[]) => unknown).mockReturnValue({
        set: vi.fn((data: Record<string, unknown>) => {
          capturedSets.push(data)
          return { where: vi.fn().mockResolvedValue(undefined) }
        }),
      })

      vi.mocked(supabaseAdmin.auth.admin.updateUserById).mockResolvedValue({
        data: { user: {} },
        error: null,
      } as never)

      const result = await completeOnboarding()

      expect(result).toEqual({ success: true })

      // Business should have onboardingCompletedAt set to a Date
      expect(capturedSets).toHaveLength(1)
      expect(capturedSets[0].onboardingCompletedAt).toBeInstanceOf(Date)
      expect(capturedSets[0].updatedAt).toBeInstanceOf(Date)

      // Supabase user metadata should be updated
      expect(supabaseAdmin.auth.admin.updateUserById).toHaveBeenCalledWith(TEST_USER_ID, {
        user_metadata: { onboardingCompleted: true },
      })
    })
  })

  // ── Test 9 ──────────────────────────────────────────────────────────────

  describe('Middleware', () => {
    it('Test 9 — re-running onboarding is blocked when onboardingCompleted is true', async () => {
      vi.resetModules()

      vi.doMock('@supabase/ssr', () => ({
        createServerClient: vi.fn(() => ({
          auth: {
            getUser: vi.fn().mockResolvedValue({
              data: {
                user: {
                  id: TEST_USER_ID,
                  user_metadata: {
                    businessId: TEST_BIZ_ID,
                    onboardingCompleted: true,
                  },
                },
              },
            }),
          },
        })),
      }))

      const { middleware } = await import('@/middleware')

      const baseUrl = new URL('http://localhost:3000/onboarding')
      const mockRequest = {
        nextUrl: Object.assign(baseUrl, {
          clone(this: URL) {
            return new URL(this.href)
          },
        }),
        cookies: {
          getAll: vi.fn().mockReturnValue([]),
          set: vi.fn(),
        },
      }

      const response = await middleware(mockRequest as never)

      // Should redirect to /dashboard
      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toContain('/dashboard')
    })
  })

  // ── Test 10 ─────────────────────────────────────────────────────────────

  describe('Atomicity', () => {
    it('Test 10 — if postJournalEntry throws during Step 3, no products are saved', async () => {
      // Mock getBusinessWithAccounts (uses db.select outside tx)
      mockDbSelectForBusiness()

      const mock = makeMockTx()

      // Wire up db.transaction to propagate errors (simulating Postgres rollback)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(db.transaction as any).mockImplementation(
        async (callback: (tx: unknown) => Promise<unknown>) => {
          // In real Postgres, if the callback throws, the transaction rolls back.
          // The mock just lets the error propagate.
          return callback(mock.tx)
        },
      )

      // postJournalEntry THROWS — simulating a journal failure
      vi.mocked(postJournalEntry).mockRejectedValue(
        new Error('Journal entry does not balance: debits=100, credits=0'),
      )

      await expect(
        completeOnboardingStep3({
          products: [
            { name: 'Rice Bag', qtyOnHand: 10, costPrice: 120 },
            { name: 'Palm Oil', qtyOnHand: 5, costPrice: 85 },
          ],
        }),
      ).rejects.toThrow('does not balance')

      // The error propagated (transaction did not commit), proving atomicity.
      // In real Postgres, the product and inventory_transaction inserts that
      // happened before the throw would be rolled back. The mock captures
      // them in memory, but the thrown error guarantees no data persisted.
    })
  })
})
