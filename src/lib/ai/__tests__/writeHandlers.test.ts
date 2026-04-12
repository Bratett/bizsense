import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Module mocks (hoisted before any imports) ────────────────────────────────

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}))

// EXPENSE_CATEGORIES is pure data — do NOT mock it; use the real module.

import { db } from '@/db'
import { handleWriteTool } from '../writeHandlers'

// ─── Chain helper (fluent select proxy) ──────────────────────────────────────
//
// Identical pattern to toolHandlers.test.ts — handles .from().where().limit()
// etc. chains where the final await resolves to the result array.

function makeChain(result: unknown[]) {
  const handler: ProxyHandler<object> = {
    get(_, prop) {
      if (prop === 'then')
        return (f?: (v: unknown) => unknown, r?: (e: unknown) => unknown) =>
          Promise.resolve(result).then(f, r)
      if (prop === 'catch')
        return (f?: (e: unknown) => unknown) => Promise.resolve(result).catch(f)
      if (prop === 'finally')
        return (f?: () => void) => Promise.resolve(result).finally(f)
      return () => chain
    },
  }
  const chain = new Proxy({}, handler)
  return chain
}

// ─── Insert mock helper ───────────────────────────────────────────────────────
//
// Mirrors customers.test.ts pattern: insert() returns { values() }
// values() returns { returning() } which resolves with the inserted row.

function mockInsert(id: string) {
  vi.mocked(db.insert).mockReturnValue({
    values: vi.fn(() => ({
      returning: vi.fn().mockResolvedValue([{ id }]),
    })),
  } as never)
}

// ─── Test constants ───────────────────────────────────────────────────────────

const BIZ = 'biz-001'
const USER = 'user-001'
const SESSION = 'session-001'

beforeEach(() => {
  vi.resetAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// record_sale
// ─────────────────────────────────────────────────────────────────────────────

describe('record_sale', () => {
  it('Test 1 — walk-in (no customer): stages immediately, no db.select', async () => {
    mockInsert('staging-001')

    const raw = await handleWriteTool(
      'record_sale',
      {
        items: [{ name: 'Rice 5kg', qty: 2, unit_price: 45 }],
        payment_method: 'cash',
      },
      BIZ,
      USER,
      SESSION,
    )

    expect(db.select).not.toHaveBeenCalled()
    expect(db.insert).toHaveBeenCalledOnce()

    const result = JSON.parse(raw)
    expect(result.stagingId).toBe('staging-001')
    expect(result.status).toBe('pending_confirmation')
    expect(result.actionType).toBe('record_sale')
    // No customerId when walk-in
    expect(result.proposedData.customerId).toBeUndefined()
  })

  it('Test 2 — known customer: 1 db.select, resolves customerId into proposedData', async () => {
    vi.mocked(db.select).mockReturnValueOnce(
      makeChain([{ id: 'cust-001', name: 'Ama Owusu', phone: '0244000001' }]) as never,
    )
    mockInsert('staging-002')

    const raw = await handleWriteTool(
      'record_sale',
      {
        customer_name_or_phone: 'Ama',
        items: [{ name: 'Rice', qty: 1, unit_price: 50 }],
        payment_method: 'mtn_momo',
      },
      BIZ,
      USER,
      SESSION,
    )

    expect(db.select).toHaveBeenCalledOnce()
    expect(db.insert).toHaveBeenCalledOnce()

    const result = JSON.parse(raw)
    expect(result.stagingId).toBe('staging-002')
    expect(result.proposedData.customerId).toBe('cust-001')
    expect(result.proposedData.customerName).toBe('Ama Owusu')
  })

  it('Test 3 — ambiguous customer: returns error JSON, no db.insert', async () => {
    vi.mocked(db.select).mockReturnValueOnce(
      makeChain([
        { id: 'c1', name: 'Kofi Asante', phone: '0244000001' },
        { id: 'c2', name: 'Kofi Mensah', phone: '0244000002' },
      ]) as never,
    )

    const raw = await handleWriteTool(
      'record_sale',
      {
        customer_name_or_phone: 'Kofi',
        items: [{ name: 'Rice', qty: 1, unit_price: 50 }],
        payment_method: 'cash',
      },
      BIZ,
      USER,
      SESSION,
    )

    expect(db.insert).not.toHaveBeenCalled()

    const result = JSON.parse(raw)
    expect(result.error).toBe('ambiguous_customer')
    expect(result.candidates).toHaveLength(2)
    expect(result.candidates[0]).toMatchObject({ name: 'Kofi Asante', phone: '0244000001' })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// record_expense
// ─────────────────────────────────────────────────────────────────────────────

describe('record_expense', () => {
  it('Test 4 — category by exact key "transport": resolves to accountCode 6004', async () => {
    mockInsert('staging-004')

    const raw = await handleWriteTool(
      'record_expense',
      {
        category: 'transport',
        amount: 120,
        payment_method: 'cash',
        description: 'Fuel for delivery van',
      },
      BIZ,
      USER,
      SESSION,
    )

    expect(db.select).not.toHaveBeenCalled()

    const result = JSON.parse(raw)
    expect(result.stagingId).toBe('staging-004')
    expect(result.proposedData.accountCode).toBe('6004')
    expect(result.proposedData.isCapital).toBe(false)
    expect(result.proposedData.categoryKey).toBe('transport')
  })

  it('Test 5 — category by label word "fuel": resolves via Transport & Fuel to 6004', async () => {
    mockInsert('staging-005')

    const raw = await handleWriteTool(
      'record_expense',
      {
        category: 'fuel',
        amount: 80,
        payment_method: 'cash',
        description: 'Generator fuel',
      },
      BIZ,
      USER,
      SESSION,
    )

    const result = JSON.parse(raw)
    expect(result.stagingId).toBe('staging-005')
    expect(result.proposedData.accountCode).toBe('6004')
  })

  it('Test 6 — asset_purchase: isCapital=true, accountCode=1500', async () => {
    mockInsert('staging-006')

    const raw = await handleWriteTool(
      'record_expense',
      {
        category: 'asset_purchase',
        amount: 5000,
        payment_method: 'bank',
        description: 'New generator',
      },
      BIZ,
      USER,
      SESSION,
    )

    const result = JSON.parse(raw)
    expect(result.stagingId).toBe('staging-006')
    expect(result.proposedData.accountCode).toBe('1500')
    expect(result.proposedData.isCapital).toBe(true)
  })

  it('Test 7 — unknown category: returns error JSON, no db.insert', async () => {
    const raw = await handleWriteTool(
      'record_expense',
      {
        category: 'unicorn_expense',
        amount: 50,
        payment_method: 'cash',
        description: 'Mystery cost',
      },
      BIZ,
      USER,
      SESSION,
    )

    expect(db.insert).not.toHaveBeenCalled()

    const result = JSON.parse(raw)
    expect(result.error).toBe('unknown_category')
    expect(result.validCategories).toBeInstanceOf(Array)
    expect(result.validCategories.length).toBeGreaterThan(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// add_customer
// ─────────────────────────────────────────────────────────────────────────────

describe('add_customer', () => {
  it('Test 8 — no duplicate phone: stages successfully with name/phone', async () => {
    vi.mocked(db.select).mockReturnValueOnce(makeChain([]) as never) // no duplicate
    mockInsert('staging-008')

    const raw = await handleWriteTool(
      'add_customer',
      {
        name: 'New Customer',
        phone: '0244123456',
        location: 'Accra Central',
        credit_limit: 500,
      },
      BIZ,
      USER,
      SESSION,
    )

    expect(db.insert).toHaveBeenCalledOnce()

    const result = JSON.parse(raw)
    expect(result.stagingId).toBe('staging-008')
    expect(result.status).toBe('pending_confirmation')
    expect(result.proposedData.phone).toBe('0244123456')
    expect(result.proposedData.creditLimit).toBe(500)
  })

  it('Test 9 — duplicate phone: returns error JSON, no db.insert', async () => {
    vi.mocked(db.select).mockReturnValueOnce(
      makeChain([{ id: 'cust-existing' }]) as never,
    )

    const raw = await handleWriteTool(
      'add_customer',
      {
        name: 'Another Customer',
        phone: '0244123456',
      },
      BIZ,
      USER,
      SESSION,
    )

    expect(db.insert).not.toHaveBeenCalled()

    const result = JSON.parse(raw)
    expect(result.error).toBe('duplicate_phone')
    expect(result.message).toMatch(/0244123456/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// adjust_stock
// ─────────────────────────────────────────────────────────────────────────────

describe('adjust_stock', () => {
  it('Test 10 — positive qty: product found, stages with productId and currentStock', async () => {
    // Call 1: product lookup → single match
    vi.mocked(db.select).mockReturnValueOnce(
      makeChain([{ id: 'prod-001', name: 'Basmati Rice 5kg', unit: 'bags' }]) as never,
    )
    // Call 2: current stock aggregate
    vi.mocked(db.select).mockReturnValueOnce(
      makeChain([{ total: '50' }]) as never,
    )
    mockInsert('staging-010')

    const raw = await handleWriteTool(
      'adjust_stock',
      {
        product_name: 'rice',
        quantity_change: 10,
        reason: 'Stock received without PO',
      },
      BIZ,
      USER,
      SESSION,
    )

    expect(db.select).toHaveBeenCalledTimes(2)
    expect(db.insert).toHaveBeenCalledOnce()

    const result = JSON.parse(raw)
    expect(result.stagingId).toBe('staging-010')
    expect(result.proposedData.productId).toBe('prod-001')
    expect(result.proposedData.currentStock).toBe(50)
    expect(result.proposedData.quantityChange).toBe(10)
  })

  it('Test 11 — removal exceeds stock: returns error JSON, no db.insert', async () => {
    vi.mocked(db.select).mockReturnValueOnce(
      makeChain([{ id: 'prod-001', name: 'Basmati Rice 5kg', unit: 'bags' }]) as never,
    )
    vi.mocked(db.select).mockReturnValueOnce(
      makeChain([{ total: '5' }]) as never,
    )

    const raw = await handleWriteTool(
      'adjust_stock',
      {
        product_name: 'rice',
        quantity_change: -10, // would take stock to -5
        reason: 'Counting error',
      },
      BIZ,
      USER,
      SESSION,
    )

    expect(db.insert).not.toHaveBeenCalled()

    const result = JSON.parse(raw)
    expect(result.error).toBe('insufficient_stock')
    expect(result.currentStock).toBe(5)
    expect(result.requested).toBe(10)
  })
})
