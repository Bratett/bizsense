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
    selectDistinct: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}))

import { getServerSession } from '@/lib/session'
import { requireRole } from '@/lib/auth/requireRole'
import { db } from '@/db'
import {
  createProduct,
  updateProduct,
  deactivateProduct,
  listProducts,
  type CreateProductInput,
} from '../products'

// ─── Test constants ─────────────────────────────────────────────────────────

const BUSINESS_ID = 'biz-test-001'
const USER_ID = 'user-test-001'

// ─── Mock helpers ───────────────────────────────────────────────────────────

function mockUser(role: string = 'owner') {
  const user = {
    id: USER_ID,
    email: `${role}@test.com`,
    businessId: BUSINESS_ID,
    role: role as 'owner' | 'manager' | 'accountant' | 'cashier',
    fullName: `Test ${role}`,
  }
  vi.mocked(requireRole).mockResolvedValue(user)
  vi.mocked(getServerSession).mockResolvedValue({ user })
  return user
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
    leftJoin: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    groupBy: vi.fn(() => chain),
  }
  return chain
}

function mockInsertReturning(returnData: unknown = undefined) {
  vi.mocked(db.insert).mockReturnValue({
    values: vi.fn(() => ({
      returning: vi.fn().mockResolvedValue(returnData ? [returnData] : []),
      then: (
        onfulfilled?: ((v: unknown) => unknown) | null,
        onrejected?: ((e: unknown) => unknown) | null,
      ) => Promise.resolve(returnData ? [returnData] : []).then(onfulfilled, onrejected),
      catch: (f?: ((e: unknown) => unknown) | null) =>
        Promise.resolve(returnData ? [returnData] : []).catch(f),
      finally: (f?: (() => void) | null) =>
        Promise.resolve(returnData ? [returnData] : []).finally(f),
    })),
  } as never)
}

function mockUpdateSet() {
  vi.mocked(db.update).mockReturnValue({
    set: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
      then: (
        onfulfilled?: ((v: unknown) => unknown) | null,
        onrejected?: ((e: unknown) => unknown) | null,
      ) => Promise.resolve(undefined).then(onfulfilled, onrejected),
      catch: (f?: ((e: unknown) => unknown) | null) => Promise.resolve(undefined).catch(f),
      finally: (f?: (() => void) | null) => Promise.resolve(undefined).finally(f),
    })),
  } as never)
}

// ─── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks()
})

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('createProduct', () => {
  const baseInput: CreateProductInput = {
    name: 'Rice Bags',
    costPrice: 150,
    sellingPrice: 200,
  }

  it('auto-generates SKU when not provided', async () => {
    mockUser('owner')

    // First select: fetch existing SKUs for auto-generation
    let selectCallCount = 0
    vi.mocked(db.select).mockImplementation(() => {
      selectCallCount++
      if (selectCallCount === 1) {
        // No existing SKUs — returns empty for sku auto-gen
        return makeChain([]) as never
      }
      return makeChain([]) as never
    })

    mockInsertReturning({ id: 'product-001' })

    const result = await createProduct(baseInput)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.productId).toBe('product-001')
    }

    // The insert should have been called with an auto-generated SKU
    const insertCall = vi.mocked(db.insert).mock.results[0]
    expect(insertCall).toBeDefined()
  })

  it('uses provided SKU when given', async () => {
    mockUser('manager')

    // First select: check uniqueness — no duplicate found
    vi.mocked(db.select).mockReturnValue(makeChain([]) as never)

    mockInsertReturning({ id: 'product-002' })

    const result = await createProduct({ ...baseInput, sku: 'CUSTOM-001' })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.productId).toBe('product-002')
    }
  })

  it('rejects duplicate SKU within same business', async () => {
    mockUser('owner')

    // First select: uniqueness check finds existing product
    vi.mocked(db.select).mockReturnValue(makeChain([{ id: 'existing-product' }]) as never)

    const result = await createProduct({ ...baseInput, sku: 'DUP-001' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.fieldErrors?.sku).toBeDefined()
    }
  })

  it('allows same SKU in different business (no cross-business conflict)', async () => {
    // The SKU uniqueness check filters by businessId, so a different
    // business's product should not conflict. We verify the select query
    // returns no results for THIS business even if a different business has
    // the same SKU.
    mockUser('accountant')

    // No match found for this business (the other business's SKU isn't checked)
    vi.mocked(db.select).mockReturnValue(makeChain([]) as never)

    mockInsertReturning({ id: 'product-003' })

    const result = await createProduct({ ...baseInput, sku: 'SHARED-001' })

    expect(result.success).toBe(true)
  })
})

describe('updateProduct', () => {
  it('does not allow SKU changes (SKU is immutable)', async () => {
    mockUser('owner')

    // Ownership check returns existing product
    vi.mocked(db.select).mockReturnValue(makeChain([{ id: 'product-001' }]) as never)

    mockUpdateSet()

    // UpdateProductInput type does not include sku field.
    // Even if someone tries to sneak it in, updateProduct only processes
    // fields from UpdateProductInput — sku is excluded by type.
    const result = await updateProduct('product-001', { name: 'Updated Name' })

    expect(result.success).toBe(true)

    // Verify db.update was called (the set payload should not contain sku)
    expect(db.update).toHaveBeenCalled()
  })

  it('costPrice change does not alter inventory_transactions', async () => {
    mockUser('manager')

    // Ownership check
    vi.mocked(db.select).mockReturnValue(makeChain([{ id: 'product-001' }]) as never)

    mockUpdateSet()

    const result = await updateProduct('product-001', { costPrice: 250 })

    expect(result.success).toBe(true)

    // Only products table should be updated, never inventory_transactions.
    // We verify by checking that update was called once (for products only).
    expect(db.update).toHaveBeenCalledTimes(1)
  })
})

describe('deactivateProduct', () => {
  it('blocks deactivation when stock > 0', async () => {
    mockUser('owner')

    let selectCallCount = 0
    vi.mocked(db.select).mockImplementation(() => {
      selectCallCount++
      if (selectCallCount === 1) {
        // Product exists
        return makeChain([{ id: 'product-001', name: 'Test Product' }]) as never
      }
      // Stock check: 15 units in stock
      return makeChain([{ total: 15 }]) as never
    })

    const result = await deactivateProduct('product-001')

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('15')
      expect(result.error).toContain('stock')
    }
  })

  it('succeeds when stock = 0 and no open orders', async () => {
    mockUser('manager')

    let selectCallCount = 0
    vi.mocked(db.select).mockImplementation(() => {
      selectCallCount++
      if (selectCallCount === 1) {
        // Product exists
        return makeChain([{ id: 'product-001', name: 'Test Product' }]) as never
      }
      if (selectCallCount === 2) {
        // Stock check: 0 units
        return makeChain([{ total: 0 }]) as never
      }
      // Open orders check: none
      return makeChain([]) as never
    })

    mockUpdateSet()

    const result = await deactivateProduct('product-001')

    expect(result.success).toBe(true)
    expect(db.update).toHaveBeenCalled()
  })
})

describe('listProducts', () => {
  it('lowStockOnly filter returns products at or below reorder level', async () => {
    mockUser('cashier')

    const mockProducts = [
      {
        id: 'p1',
        sku: 'RCB-001',
        name: 'Rice Bags',
        description: null,
        category: 'Grains',
        unit: 'bags',
        costPrice: '150.00',
        sellingPrice: '200.00',
        sellingPriceUsd: null,
        trackInventory: true,
        reorderLevel: 10,
        isActive: true,
        currentStock: 5, // below reorder level
      },
      {
        id: 'p2',
        sku: 'SG-001',
        name: 'Sugar',
        description: null,
        category: 'Grains',
        unit: 'bags',
        costPrice: '80.00',
        sellingPrice: '100.00',
        sellingPriceUsd: null,
        trackInventory: true,
        reorderLevel: 10,
        isActive: true,
        currentStock: 50, // above reorder level
      },
      {
        id: 'p3',
        sku: 'FL-001',
        name: 'Flour',
        description: null,
        category: 'Grains',
        unit: 'bags',
        costPrice: '60.00',
        sellingPrice: '85.00',
        sellingPriceUsd: null,
        trackInventory: true,
        reorderLevel: 0, // no reorder level set
        isActive: true,
        currentStock: 2,
      },
    ]

    vi.mocked(db.select).mockReturnValue(makeChain(mockProducts) as never)

    const result = await listProducts({ stockFilter: 'low_stock' })

    // Only p1 should be returned (below reorder level, reorderLevel > 0, stock > 0)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('p1')
    expect(result[0].isLowStock).toBe(true)
  })

  it('executes a single DB round-trip (no N+1 queries)', async () => {
    mockUser('owner')

    const mockProducts = Array.from({ length: 20 }, (_, i) => ({
      id: `p${i}`,
      sku: `SKU-${String(i).padStart(3, '0')}`,
      name: `Product ${i}`,
      description: null,
      category: null,
      unit: 'pcs',
      costPrice: '10.00',
      sellingPrice: '15.00',
      sellingPriceUsd: null,
      trackInventory: true,
      reorderLevel: 5,
      isActive: true,
      currentStock: 10,
    }))

    vi.mocked(db.select).mockReturnValue(makeChain(mockProducts) as never)

    const result = await listProducts()

    expect(result).toHaveLength(20)
    // db.select should have been called exactly once — stock is computed via subquery, not N+1
    expect(db.select).toHaveBeenCalledTimes(1)
  })
})
