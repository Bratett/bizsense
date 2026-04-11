import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @/db before any imports that use it.
// vi.mock is hoisted — this runs before module resolution.
// Needed for Test 5 which calls calculateTax (uses global db).
vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
  },
}))

import { db } from '@/db'
import { accounts, taxComponents } from '@/db/schema'
import { seedChartOfAccounts, DEFAULT_ACCOUNTS } from '../seeds/seedChartOfAccounts'
import { seedTaxComponents, DEFAULT_TAX_COMPONENTS } from '../seeds/seedTaxComponents'
import { calculateTax } from '../tax'
import type { DrizzleTransaction } from '../ledger'

// ─── Mock tx factory ─────────────────────────────────────────────────────────
// Builds a mock DrizzleTransaction for seed functions.
// selectResults: sequential results returned by tx.select()...where() calls.

function makeSeedMockTx(options?: { selectResults?: unknown[][] }) {
  const selectResults = options?.selectResults ?? []
  let selectCallIdx = 0

  const capturedInserts: Array<{ table: unknown; data: unknown }> = []

  const tx = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => {
          const result = selectResults[selectCallIdx] ?? []
          selectCallIdx++
          return Promise.resolve(result)
        }),
      })),
    })),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((data: unknown) => {
        capturedInserts.push({ table, data })
        // .returning() produces { id, code } for each row
        const rows = Array.isArray(data) ? data : [data]
        const returnData = rows.map((r: Record<string, unknown>) => ({
          id: `uuid-${r.code as string}`,
          code: r.code,
        }))
        return {
          returning: vi.fn().mockResolvedValue(returnData),
          // Make result directly awaitable (for inserts without .returning())
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
  }

  return {
    tx: tx as unknown as DrizzleTransaction,
    capturedInserts,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks()
})

describe('seedChartOfAccounts', () => {
  const BIZ_ID = 'biz-seed-test'

  it('Test 1 — seeds correct count with expected properties', async () => {
    // No existing accounts
    const { tx, capturedInserts } = makeSeedMockTx({ selectResults: [[]] })

    const result = await seedChartOfAccounts(tx, BIZ_ID)

    // Exactly 34 accounts created
    const insertedData = capturedInserts[0].data as Array<Record<string, unknown>>
    expect(insertedData).toHaveLength(DEFAULT_ACCOUNTS.length)
    expect(DEFAULT_ACCOUNTS).toHaveLength(34)

    // Every account has isSystem = true
    expect(insertedData.every((a) => a.isSystem === true)).toBe(true)

    // Insert targeted the accounts table
    expect(capturedInserts[0].table).toBe(accounts)

    // Returns SeededAccounts map with 34 entries
    expect(Object.keys(result)).toHaveLength(34)

    // Spot checks
    expect(result['3001']).toBe('uuid-3001')
    const acct3001 = insertedData.find((a) => a.code === '3001')
    expect(acct3001?.type).toBe('equity')

    expect(result['1001']).toBe('uuid-1001')
    const acct1001 = insertedData.find((a) => a.code === '1001')
    expect(acct1001?.cashFlowActivity).toBe('operating')

    expect(result['1500']).toBe('uuid-1500')
    const acct1500 = insertedData.find((a) => a.code === '1500')
    expect(acct1500?.cashFlowActivity).toBe('investing')
  })

  it('Test 2 — is idempotent (no duplicates on second call)', async () => {
    // Simulate all 34 accounts already existing
    const existingRows = DEFAULT_ACCOUNTS.map((a) => ({
      id: `existing-${a.code}`,
      code: a.code,
    }))

    const { tx, capturedInserts } = makeSeedMockTx({
      selectResults: [existingRows],
    })

    const result = await seedChartOfAccounts(tx, BIZ_ID)

    // No inserts should have been made
    expect(capturedInserts).toHaveLength(0)

    // Still returns a complete map with 34 entries
    expect(Object.keys(result)).toHaveLength(34)
    expect(result['1001']).toBe('existing-1001')
    expect(result['6009']).toBe('existing-6009')
  })
})

describe('seedTaxComponents', () => {
  const BIZ_ID = 'biz-tax-test'
  const VAT_ACCOUNT_ID = 'vat-payable-uuid'
  const EFFECTIVE_FROM = new Date('2023-01-01')

  it('Test 3 — seeds correctly for VAT-registered business', async () => {
    // No existing tax components
    const { tx, capturedInserts } = makeSeedMockTx({ selectResults: [[]] })

    await seedTaxComponents(tx, BIZ_ID, VAT_ACCOUNT_ID, EFFECTIVE_FROM)

    // Exactly 4 components created
    expect(capturedInserts).toHaveLength(1)
    const insertedData = capturedInserts[0].data as Array<Record<string, unknown>>
    expect(insertedData).toHaveLength(4)

    // Insert targeted the taxComponents table
    expect(capturedInserts[0].table).toBe(taxComponents)

    // VAT component assertions
    const vat = insertedData.find((c) => c.code === 'VAT')
    expect(vat?.isCompounded).toBe(true)
    expect(vat?.calculationOrder).toBe(4)
    expect(vat?.accountId).toBe(VAT_ACCOUNT_ID)

    // NHIL assertions
    const nhil = insertedData.find((c) => c.code === 'NHIL')
    expect(nhil?.calculationOrder).toBe(1)
    expect(nhil?.isCompounded).toBe(false)

    // All components have correct businessId and appliesTo
    expect(insertedData.every((c) => c.businessId === BIZ_ID)).toBe(true)
    expect(insertedData.every((c) => c.appliesTo === 'standard')).toBe(true)
    expect(insertedData.every((c) => c.isActive === true)).toBe(true)
  })

  it('Test 4 — is idempotent (no duplicates on second call)', async () => {
    // Simulate all 4 components already existing
    const existingRows = DEFAULT_TAX_COMPONENTS.map((c) => ({
      code: c.code,
    }))

    const { tx, capturedInserts } = makeSeedMockTx({
      selectResults: [existingRows],
    })

    await seedTaxComponents(tx, BIZ_ID, VAT_ACCOUNT_ID, EFFECTIVE_FROM)

    // No inserts should have been made
    expect(capturedInserts).toHaveLength(0)
  })
})

describe('calculateTax integration with seeded components', () => {
  it('Test 5 — calculateTax uses seeded components correctly', async () => {
    const BIZ_ID = 'biz-integration'

    // Build component rows as calculateTax expects them from the DB.
    // These mirror the seeded data structure exactly.
    const seededComponents = DEFAULT_TAX_COMPONENTS.map((c) => ({
      id: `tc-${c.code.toLowerCase()}`,
      businessId: BIZ_ID,
      name: c.name,
      code: c.code,
      rate: c.rate,
      calculationOrder: c.calculationOrder,
      isCompounded: c.isCompounded,
      appliesTo: c.appliesTo,
      accountId: 'vat-payable-uuid',
      isActive: true,
      effectiveFrom: new Date('2023-01-01'),
      effectiveTo: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }))

    // Mock db.select for calculateTax's two queries:
    // 1st call: business vatRegistered check
    // 2nd call: tax components query
    vi.mocked(db.select)
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ vatRegistered: true }]),
        }),
      } as unknown as ReturnType<typeof db.select>)
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(seededComponents),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>)

    const result = await calculateTax(BIZ_ID, 100)

    // Ghana cascading: NHIL 2.50 + GETFund 2.50 + COVID 1.00 + VAT 15.90 = 21.90
    expect(result.totalTaxAmount).toBe(21.9)
    expect(result.totalAmount).toBe(121.9)
    expect(result.effectiveRate).toBeCloseTo(0.219, 3)
    expect(result.breakdown).toHaveLength(4)
  })
})
