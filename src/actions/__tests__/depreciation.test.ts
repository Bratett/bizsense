import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Module mocks (hoisted before imports) ────────────────────────────────────

vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: vi.fn(),
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
  postJournalEntry: vi.fn().mockResolvedValue('je-001'),
}))

import { requireRole } from '@/lib/auth/requireRole'
import { db } from '@/db'
import { postJournalEntry } from '@/lib/ledger'
import { runMonthlyDepreciation } from '../depreciation'
import type { PostJournalEntryInput } from '@/lib/ledger'

// ─── Constants ────────────────────────────────────────────────────────────────

const BUSINESS_ID = 'biz-001'
const ASSET_ID = 'asset-001'
const ACCT_6008 = 'acct-6008'
const ACCT_1510 = 'acct-1510'

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function mockUser() {
  vi.mocked(requireRole).mockResolvedValue({
    id: 'user-001',
    email: 'owner@test.com',
    businessId: BUSINESS_ID,
    role: 'owner',
    fullName: 'Test Owner',
  })
}

/** Drizzle-style chainable query that resolves to `result` */
function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {}
  const promise = Promise.resolve(result)
  chain['then'] = (f?: ((v: unknown) => unknown) | null, r?: ((e: unknown) => unknown) | null) =>
    promise.then(f, r)
  chain['catch'] = (f?: ((e: unknown) => unknown) | null) => promise.catch(f)
  chain['finally'] = (f?: (() => void) | null) => promise.finally(f)
  chain['from'] = vi.fn(() => chain)
  chain['where'] = vi.fn(() => chain)
  chain['limit'] = vi.fn(() => chain)
  chain['orderBy'] = vi.fn(() => chain)
  chain['innerJoin'] = vi.fn(() => chain)
  chain['groupBy'] = vi.fn(() => chain)
  return chain
}

// Active asset fixture: cost=12000, residual=0, life=60, accumulated=0
// Expected monthly depreciation: 12000 / 60 = 200
const ACTIVE_ASSET = {
  id: ASSET_ID,
  businessId: BUSINESS_ID,
  name: 'Laptop',
  purchaseDate: '2024-01-01',
  purchaseCost: '12000',
  residualValue: '0',
  usefulLifeMonths: 60,
  accumulatedDepreciation: '0',
  depreciationMethod: 'straight_line',
  isActive: true,
  depreciationAccountId: null,    // falls back to code-resolved ACCT_6008
  accDepreciationAccountId: null, // falls back to code-resolved ACCT_1510
  assetAccountId: null,
  category: null,
  disposalDate: null,
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

// ── DB select call order in runMonthlyDepreciation ──────────────────────────
// Call 1: fetch active assets
// Call 2: fetchAccountByCode '6008'   ─┐ (Promise.all — dispatched in order)
// Call 3: fetchAccountByCode '1510'   ─┘
// Call 4+: per-asset idempotency check

function mockSelectSequence(responses: unknown[]) {
  let callCount = 0
  vi.mocked(db.select).mockImplementation(() => {
    const result = responses[callCount] ?? []
    callCount++
    return makeChain(result) as never
  })
}

function mockDefaultTransaction(onSet?: (data: Record<string, unknown>) => void) {
  vi.mocked(db.transaction).mockImplementation(async (fn) => {
    const tx = {
      update: vi.fn(() => ({
        set: vi.fn((data: Record<string, unknown>) => {
          onSet?.(data)
          return { where: vi.fn().mockResolvedValue([]) }
        }),
      })),
    }
    return fn(tx as never)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('runMonthlyDepreciation', () => {
  // Test 7 — Posts balanced Dr 6008 / Cr 1510 journal entry
  it('7. posts a balanced journal entry: Dr 6008, Cr 1510', async () => {
    mockUser()

    // Call order: assets → account 6008 → account 1510 → idempotency (no entry)
    mockSelectSequence([
      [ACTIVE_ASSET],
      [{ id: ACCT_6008, code: '6008' }],
      [{ id: ACCT_1510, code: '1510' }],
      [], // idempotency: no existing entry
    ])

    let capturedJournalInput: PostJournalEntryInput | null = null
    vi.mocked(postJournalEntry).mockImplementation(async (_tx, input) => {
      capturedJournalInput = input
      return 'je-001'
    })

    mockDefaultTransaction()

    const result = await runMonthlyDepreciation({ year: 2025, month: 6 })

    expect(result.processed).toBe(1)
    expect(result.errors).toHaveLength(0)
    expect(capturedJournalInput).not.toBeNull()

    const lines = capturedJournalInput!.lines
    expect(lines).toHaveLength(2)

    // Debit line: Dr 6008 (Depreciation Expense)
    expect(lines[0].accountId).toBe(ACCT_6008)
    expect(lines[0].debitAmount).toBe(200)
    expect(lines[0].creditAmount).toBe(0)

    // Credit line: Cr 1510 (Accumulated Depreciation)
    expect(lines[1].accountId).toBe(ACCT_1510)
    expect(lines[1].debitAmount).toBe(0)
    expect(lines[1].creditAmount).toBe(200)

    // Balanced: total debits === total credits
    const totalDebits = lines.reduce((s, l) => s + l.debitAmount, 0)
    const totalCredits = lines.reduce((s, l) => s + l.creditAmount, 0)
    expect(totalDebits).toBe(totalCredits)
  })

  // Test 8 — Idempotency: second run for same month increments alreadyRun
  it('8. is idempotent — when idempotency check finds existing entry, alreadyRun=1', async () => {
    mockUser()

    // Call order: assets → account 6008 → account 1510 → idempotency (entry found!)
    mockSelectSequence([
      [ACTIVE_ASSET],
      [{ id: ACCT_6008, code: '6008' }],
      [{ id: ACCT_1510, code: '1510' }],
      [{ id: 'je-existing' }], // idempotency: existing entry found
    ])

    const result = await runMonthlyDepreciation({ year: 2025, month: 6 })

    expect(result.alreadyRun).toBe(1)
    expect(result.processed).toBe(0)
    expect(vi.mocked(postJournalEntry)).not.toHaveBeenCalled()
  })

  // Test 9 — Fully deprecated asset is skipped
  it('9. skips an asset that is already fully depreciated', async () => {
    mockUser()

    const fullyDepreciatedAsset = { ...ACTIVE_ASSET, accumulatedDepreciation: '12000' }

    // Call order: assets → account 6008 → account 1510 → idempotency (no entry, but asset skipped anyway)
    mockSelectSequence([
      [fullyDepreciatedAsset],
      [{ id: ACCT_6008, code: '6008' }],
      [{ id: ACCT_1510, code: '1510' }],
      [], // idempotency check (reached before skip check in some orderings)
    ])

    const result = await runMonthlyDepreciation({ year: 2025, month: 6 })

    expect(result.skipped).toBe(1)
    expect(result.processed).toBe(0)
    expect(vi.mocked(postJournalEntry)).not.toHaveBeenCalled()
  })

  // Test 10 — accumulatedDepreciation is updated after successful run
  it('10. updates fixedAssets.accumulatedDepreciation to 200 after one run', async () => {
    mockUser()

    mockSelectSequence([
      [ACTIVE_ASSET],
      [{ id: ACCT_6008, code: '6008' }],
      [{ id: ACCT_1510, code: '1510' }],
      [], // idempotency: no entry
    ])

    let capturedSetValues: Record<string, unknown> | null = null
    mockDefaultTransaction((data) => { capturedSetValues = data })

    await runMonthlyDepreciation({ year: 2025, month: 6 })

    expect(capturedSetValues).not.toBeNull()
    expect(capturedSetValues!['accumulatedDepreciation']).toBe('200')
  })

  // Test 11 — isActive set to false when asset becomes fully deprecated
  it('11. sets isActive=false when the asset becomes fully deprecated after this run', async () => {
    mockUser()

    // One month remaining: 11800 + 200 = 12000 = depreciableAmount → fully deprecated
    const almostDepreciatedAsset = { ...ACTIVE_ASSET, accumulatedDepreciation: '11800' }

    mockSelectSequence([
      [almostDepreciatedAsset],
      [{ id: ACCT_6008, code: '6008' }],
      [{ id: ACCT_1510, code: '1510' }],
      [], // idempotency: no entry
    ])

    let capturedSetValues: Record<string, unknown> | null = null
    mockDefaultTransaction((data) => { capturedSetValues = data })

    await runMonthlyDepreciation({ year: 2025, month: 6 })

    expect(capturedSetValues).not.toBeNull()
    // Last month: remaining = 12000 - 11800 = 200, cap = min(200, 200) = 200
    expect(capturedSetValues!['accumulatedDepreciation']).toBe('12000')
    expect(capturedSetValues!['isActive']).toBe(false)
  })

  // Test 12 — Atomic: postJournalEntry failure leaves accumulatedDepreciation unchanged
  it('12. is atomic: postJournalEntry failure prevents accumulatedDepreciation update', async () => {
    mockUser()

    mockSelectSequence([
      [ACTIVE_ASSET],
      [{ id: ACCT_6008, code: '6008' }],
      [{ id: ACCT_1510, code: '1510' }],
      [], // idempotency: no entry
    ])

    // postJournalEntry throws — simulates a constraint or network error
    vi.mocked(postJournalEntry).mockRejectedValueOnce(new Error('DB constraint violation'))

    let updateSetCalled = false
    vi.mocked(db.transaction).mockImplementation(async (fn) => {
      const tx = {
        update: vi.fn(() => ({
          set: vi.fn(() => {
            updateSetCalled = true
            return { where: vi.fn().mockResolvedValue([]) }
          }),
        })),
      }
      // The fn call will throw because postJournalEntry rejects inside it
      return fn(tx as never)
    })

    const result = await runMonthlyDepreciation({ year: 2025, month: 6 })

    // Error captured in errors array, not re-thrown
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].error).toContain('DB constraint violation')
    expect(result.processed).toBe(0)

    // tx.update.set was NOT called because postJournalEntry threw first
    expect(updateSetCalled).toBe(false)
  })
})
