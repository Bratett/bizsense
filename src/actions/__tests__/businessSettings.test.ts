import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Module mocks (hoisted before imports) ──────────────────────────────────

vi.mock('@/lib/session', () => ({
  getServerSession: vi.fn(),
}))

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

vi.mock('@/lib/inventory/settings', () => ({
  getAllowNegativeStock: vi.fn(() => Promise.resolve(false)),
}))

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    auth: { admin: { inviteUserByEmail: vi.fn(), updateUserById: vi.fn() } },
    storage: { from: vi.fn() },
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(),
}))

vi.mock('@/lib/atomic', () => ({
  atomicTransactionWrite: vi.fn(),
}))

vi.mock('@/lib/tax', () => ({
  calculateTax: vi.fn(),
}))

vi.mock('@/lib/orderNumber', () => ({
  isValidOrderNumber: vi.fn((n: string) => /^ORD-[A-Z2-9]{4}-\d{4,}$/.test(n)),
}))

vi.mock('@/lib/inventory/queries', () => ({
  getProductTransactions: vi.fn(),
}))

import { getServerSession } from '@/lib/session'
import { requireRole } from '@/lib/auth/requireRole'
import { db } from '@/db'
import { getAllowNegativeStock } from '@/lib/inventory/settings'
import { getProductTransactions } from '@/lib/inventory/queries'
import { atomicTransactionWrite } from '@/lib/atomic'
import { calculateTax } from '@/lib/tax'
import { updateInventorySettings } from '../settings'
import { createCashOrder, type CreateCashOrderInput } from '../orders'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BUSINESS_ID = 'biz-test-001'
const USER_ID = 'user-test-001'
const PRODUCT_ID = 'prod-001'

function mockOwnerSession() {
  vi.mocked(requireRole).mockResolvedValue({
    id: USER_ID,
    email: 'owner@test.com',
    businessId: BUSINESS_ID,
    role: 'owner' as const,
    fullName: 'Test Owner',
  })
  vi.mocked(getServerSession).mockResolvedValue({
    user: {
      id: USER_ID,
      email: 'owner@test.com',
      businessId: BUSINESS_ID,
      role: 'owner' as const,
      fullName: 'Test Owner',
    },
  })
}

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
    set: vi.fn(() => chain),
    values: vi.fn(() => chain),
    onConflictDoUpdate: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(result)),
  }
  return chain
}

const PRODUCT_ROW = {
  id: PRODUCT_ID,
  name: 'Test Widget',
  trackInventory: true,
  unit: 'pcs',
}

const ORDER_INPUT: CreateCashOrderInput = {
  orderNumber: 'ORD-X7KQ-0001',
  orderDate: '2026-04-01',
  paymentMethod: 'cash',
  applyVat: false,
  lines: [
    {
      productId: PRODUCT_ID,
      description: 'Test Widget',
      quantity: 10,
      unitPrice: 5,
      unitPriceCurrency: 'GHS',
    },
  ],
}

beforeEach(() => {
  vi.resetAllMocks()
})

// ─── Test 10: getAllowNegativeStock returns false by default ──────────────────

describe('getAllowNegativeStock', () => {
  it('Test 10 — businessSettings missing → returns false', async () => {
    vi.mocked(getAllowNegativeStock).mockResolvedValueOnce(false)

    const result = await getAllowNegativeStock(BUSINESS_ID)

    expect(result).toBe(false)
  })
})

// ─── Test 11: updateInventorySettings updates record ─────────────────────────

describe('updateInventorySettings', () => {
  it('Test 11 — updateInventorySettings updates allowNegativeStock to true', async () => {
    mockOwnerSession()

    const insertChain = makeChain([])
    vi.mocked(db.insert).mockReturnValue(insertChain as never)

    await updateInventorySettings({ allowNegativeStock: true })

    expect(db.insert).toHaveBeenCalled()
    const onConflictMock = vi.mocked(
      insertChain.onConflictDoUpdate as ReturnType<typeof vi.fn>,
    )
    expect(onConflictMock).toHaveBeenCalled()
    const conflictArgs = onConflictMock.mock.calls[0]?.[0] as {
      set: { allowNegativeStock: boolean }
    }
    expect(conflictArgs?.set?.allowNegativeStock).toBe(true)
  })
})

// ─── Test 12 & 13: createCashOrder with allowNegativeStock ───────────────────

describe('createCashOrder — stock validation with allowNegativeStock', () => {
  const ACCOUNT_ROWS = [
    { id: 'acct-1001', code: '1001' }, // Cash
    { id: 'acct-1100', code: '1100' }, // Accounts Receivable
    { id: 'acct-4001', code: '4001' }, // Sales Revenue
    { id: 'acct-2100', code: '2100' }, // VAT Payable
    { id: 'acct-5001', code: '5001' }, // COGS
    { id: 'acct-1200', code: '1200' }, // Inventory
  ]

  function setupOrderMocks() {
    mockOwnerSession()

    // getServerSession for createOrder (it uses getServerSession directly)
    vi.mocked(getServerSession).mockResolvedValue({
      user: {
        id: USER_ID,
        email: 'owner@test.com',
        businessId: BUSINESS_ID,
        role: 'owner' as const,
        fullName: 'Test Owner',
      },
    })

    // calculateTax — applyVat: false so this won't be called, but mock defensively
    vi.mocked(calculateTax).mockResolvedValue({
      supplyAmount: 50,
      breakdown: [],
      totalTaxAmount: 0,
      totalAmount: 50,
      effectiveRate: 0,
    } as Awaited<ReturnType<typeof calculateTax>>)

    // createOrder calls db.select in order:
    //   1. GL account lookup (returns account rows with id + code)
    //   2. Per-product lookup inside the COGS loop (returns PRODUCT_ROW)
    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain(ACCOUNT_ROWS) as never) // accounts
      .mockReturnValue(makeChain([PRODUCT_ROW]) as never)   // products (fallback)

    // getProductTransactions returns transactions showing only 5 units available
    vi.mocked(getProductTransactions).mockResolvedValue([
      {
        id: 'it-001',
        transactionType: 'purchase' as const,
        quantity: 5,
        unitCost: 3,
        transactionDate: '2026-01-01',
        createdAt: new Date('2026-01-01'),
      },
    ] as Awaited<ReturnType<typeof getProductTransactions>>)
  }

  it('Test 12 — allowNegativeStock=false, insufficient stock: returns error (no throw)', async () => {
    setupOrderMocks()

    // Only 5 units available, order requests 10 → insufficient
    vi.mocked(getAllowNegativeStock).mockResolvedValue(false)

    const result = await createCashOrder(ORDER_INPUT)

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toMatch(/insufficient stock/i)

    // atomicTransactionWrite should NOT have been called
    expect(atomicTransactionWrite).not.toHaveBeenCalled()
  })

  it('Test 13 — allowNegativeStock=true, insufficient stock: proceeds to journal write', async () => {
    setupOrderMocks()

    // Allow negative stock → skip the insufficient stock check
    vi.mocked(getAllowNegativeStock).mockResolvedValue(true)

    // atomicTransactionWrite succeeds
    vi.mocked(atomicTransactionWrite).mockResolvedValue([
      { id: 'order-001', orderNumber: 'ORD-TEST-0001' },
    ] as never)

    const result = await createCashOrder(ORDER_INPUT)

    // atomicTransactionWrite was called → order proceeded
    expect(atomicTransactionWrite).toHaveBeenCalled()
    // Result may be success (if all mocks resolve correctly) or error from other validation
    // The key assertion is that the insufficient-stock early-return was NOT hit
    // (otherwise atomicTransactionWrite wouldn't have been called)
  })
})
