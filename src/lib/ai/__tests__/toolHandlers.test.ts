import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Module mocks (hoisted before any imports) ───────────────────────────────

vi.mock('@/db', () => ({
  db: { select: vi.fn() },
}))

vi.mock('@/lib/reports/engine', () => ({
  getAccountBalances: vi.fn(),
}))

// Passthrough so numeric formatting doesn't obscure assertions
vi.mock('@/lib/format', () => ({
  formatGhs: (n: number) => String(n),
}))

import { db } from '@/db'
import { getAccountBalances } from '@/lib/reports/engine'
import { handleReadTool } from '../toolHandlers'
import { resolvePeriod } from '../periodResolver'
import type { AccountBalance } from '@/lib/reports/engine'

// ─── Chain helper ─────────────────────────────────────────────────────────────
//
// Returns an object that is both deeply fluent (every method returns the chain)
// and thenable (await chain resolves to result).

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
      // All other method calls return the same chain (fluent)
      return () => chain
    },
  }
  const chain = new Proxy({}, handler)
  return chain
}

// ─── AccountBalance factory ───────────────────────────────────────────────────

function makeBalance(
  accountType: string,
  accountCode: string,
  accountName: string,
  netBalance: number,
): AccountBalance {
  const isDebitNormal = ['asset', 'cogs', 'expense'].includes(accountType)
  return {
    accountId: `acct-${accountCode}`,
    accountCode,
    accountName,
    accountType,
    accountSubtype: null,
    cashFlowActivity: 'operating',
    normalBalance: isDebitNormal ? 'debit' : 'credit',
    totalDebits: isDebitNormal ? netBalance : 0,
    totalCredits: isDebitNormal ? 0 : netBalance,
    netBalance,
  }
}

const BIZ = 'biz-test-001'

beforeEach(() => {
  vi.resetAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// resolvePeriod
// ─────────────────────────────────────────────────────────────────────────────

describe('resolvePeriod', () => {
  it('Test 1 — "today" returns from = to = today ISO date', () => {
    const todayStr = new Date().toISOString().slice(0, 10)
    const result = resolvePeriod('today')
    expect(result.from).toBe(todayStr)
    expect(result.to).toBe(todayStr)
  })

  it('Test 2 — "this_month" returns from = 1st of current month, to = today', () => {
    const today = new Date()
    const todayStr = today.toISOString().slice(0, 10)
    const expectedFrom = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
    const result = resolvePeriod('this_month')
    expect(result.from).toBe(expectedFrom)
    expect(result.to).toBe(todayStr)
  })

  it('Test 3 — "custom" without dates throws', () => {
    expect(() => resolvePeriod('custom')).toThrow(
      'date_from and date_to are required for custom period',
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// querySales — group_by=total
// ─────────────────────────────────────────────────────────────────────────────

describe('querySales — total', () => {
  it('Test 4 — this_month/total returns orderCount and total as numbers', async () => {
    vi.mocked(db.select).mockReturnValueOnce(
      makeChain([{ orderCount: '12', total: '4500.00' }]) as never,
    )

    const raw = await handleReadTool('query_sales', { period: 'this_month', group_by: 'total' }, BIZ)
    const result = JSON.parse(raw)

    expect(result.groupBy).toBe('total')
    expect(result.orderCount).toBe(12)
    expect(result.total).toBe(4500)
    expect(result.period).toMatchObject({ from: expect.any(String), to: expect.any(String) })
  })

  it('Test 5 — today/total with zero aggregate returns orderCount=0 (draft orders excluded)', async () => {
    // The query filters status IN ('confirmed','fulfilled'), so drafts yield zero rows
    vi.mocked(db.select).mockReturnValueOnce(
      makeChain([{ orderCount: '0', total: '0' }]) as never,
    )

    const raw = await handleReadTool('query_sales', { period: 'today', group_by: 'total' }, BIZ)
    const result = JSON.parse(raw)

    expect(result.orderCount).toBe(0)
    expect(result.total).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// querySales — group_by=customer
// ─────────────────────────────────────────────────────────────────────────────

describe('querySales — group_by=customer', () => {
  it('Test 6 — returns customers array with name, orders count, and total', async () => {
    vi.mocked(db.select).mockReturnValueOnce(
      makeChain([
        { customerName: 'Ama Owusu', customerPhone: '0244000001', orderCount: '3', total: '1200.00' },
        { customerName: null, customerPhone: null, orderCount: '2', total: '300.00' },
      ]) as never,
    )

    const raw = await handleReadTool(
      'query_sales',
      { period: 'this_month', group_by: 'customer' },
      BIZ,
    )
    const result = JSON.parse(raw)

    expect(result.groupBy).toBe('customer')
    expect(result.customers).toHaveLength(2)
    expect(result.customers[0]).toMatchObject({ name: 'Ama Owusu', phone: '0244000001', orders: 3, total: 1200 })
    // null customerName → 'Walk-in'
    expect(result.customers[1]).toMatchObject({ name: 'Walk-in', orders: 2, total: 300 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// querySales — customerName filter
// ─────────────────────────────────────────────────────────────────────────────

describe('querySales — customerName filter', () => {
  it('Test 7 — customer found: 2 db.select calls; correct filtered total', async () => {
    // CALL 1: customer ID lookup
    vi.mocked(db.select).mockReturnValueOnce(makeChain([{ id: 'cust-kofi' }]) as never)
    // CALL 2: orders with customerIds filter
    vi.mocked(db.select).mockReturnValueOnce(
      makeChain([{ orderCount: '2', total: '800.00' }]) as never,
    )

    const raw = await handleReadTool(
      'query_sales',
      { period: 'this_month', group_by: 'total', customer_name: 'Kofi' },
      BIZ,
    )
    const result = JSON.parse(raw)

    expect(vi.mocked(db.select)).toHaveBeenCalledTimes(2)
    expect(result.orderCount).toBe(2)
    expect(result.total).toBe(800)
  })

  it('Test 7b — customer not found: 1 db.select call; returns message JSON', async () => {
    vi.mocked(db.select).mockReturnValueOnce(makeChain([]) as never)

    const raw = await handleReadTool(
      'query_sales',
      { period: 'this_month', group_by: 'total', customer_name: 'Ghost' },
      BIZ,
    )
    const result = JSON.parse(raw)

    expect(vi.mocked(db.select)).toHaveBeenCalledTimes(1)
    expect(result.message).toMatch(/No customer found matching "Ghost"/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// queryExpenses
// ─────────────────────────────────────────────────────────────────────────────

describe('queryExpenses — total', () => {
  it('Test 8 — this_month/total returns count and total as numbers (approved only)', async () => {
    vi.mocked(db.select).mockReturnValueOnce(
      makeChain([{ count: '5', total: '2300.00' }]) as never,
    )

    const raw = await handleReadTool(
      'query_expenses',
      { period: 'this_month', group_by: 'total' },
      BIZ,
    )
    const result = JSON.parse(raw)

    expect(result.groupBy).toBe('total')
    expect(result.count).toBe(5)
    expect(result.total).toBe(2300)
  })
})

describe('queryExpenses — group_by=category', () => {
  it('Test 9 — returns categories array; null category becomes "Uncategorised"', async () => {
    vi.mocked(db.select).mockReturnValueOnce(
      makeChain([
        { category: 'Transport', count: '3', total: '900.00' },
        { category: 'Office Supplies', count: '2', total: '400.00' },
        { category: null, count: '1', total: '150.00' },
      ]) as never,
    )

    const raw = await handleReadTool(
      'query_expenses',
      { period: 'this_month', group_by: 'category' },
      BIZ,
    )
    const result = JSON.parse(raw)

    expect(result.groupBy).toBe('category')
    expect(result.categories).toHaveLength(3)
    expect(result.categories[0]).toMatchObject({ category: 'Transport', count: 3, total: 900 })
    expect(result.categories[2]).toMatchObject({ category: 'Uncategorised', count: 1, total: 150 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getCashPosition
// ─────────────────────────────────────────────────────────────────────────────

describe('getCashPosition', () => {
  it('Test 10 — calls getAccountBalances with asOf today and cash codes; returns accounts + total', async () => {
    const today = new Date().toISOString().slice(0, 10)
    vi.mocked(getAccountBalances).mockResolvedValueOnce([
      makeBalance('asset', '1001', 'Cash on Hand', 3000),
      makeBalance('asset', '1002', 'MTN MoMo', 1500),
    ])

    const raw = await handleReadTool('get_cash_position', {}, BIZ)
    const result = JSON.parse(raw)

    expect(vi.mocked(getAccountBalances)).toHaveBeenCalledWith(
      BIZ,
      { type: 'asOf', date: today },
      ['1001', '1002', '1003', '1004', '1005'],
    )
    expect(result.accounts).toHaveLength(2)
    expect(result.accounts[0]).toMatchObject({ code: '1001', name: 'Cash on Hand', balance: 3000 })
    expect(result.accounts[1]).toMatchObject({ code: '1002', name: 'MTN MoMo', balance: 1500 })
    expect(result.total).toBe(4500)
    expect(result.asOf).toBe(today)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getProfit
// ─────────────────────────────────────────────────────────────────────────────

describe('getProfit', () => {
  it('Test 11 — computes grossProfit, netProfit, and margin percentages from account balances', async () => {
    vi.mocked(getAccountBalances).mockResolvedValueOnce([
      makeBalance('revenue', '4001', 'Sales Revenue', 10000),
      makeBalance('cogs', '5001', 'Cost of Goods Sold', 4000),
      makeBalance('expense', '6001', 'Operating Expenses', 1500),
    ])

    const raw = await handleReadTool('get_profit', { period: 'this_month' }, BIZ)
    const result = JSON.parse(raw)

    expect(result.revenue).toBe(10000)
    expect(result.cogs).toBe(4000)
    expect(result.expenses).toBe(1500)
    expect(result.grossProfit).toBe(6000)   // 10000 - 4000
    expect(result.netProfit).toBe(4500)     // 10000 - 4000 - 1500
    expect(result.grossMarginPct).toBe(60)  // Math.round(0.6 * 1000) / 10
    expect(result.netMarginPct).toBe(45)    // Math.round(0.45 * 1000) / 10

    expect(vi.mocked(getAccountBalances)).toHaveBeenCalledWith(
      BIZ,
      expect.objectContaining({ type: 'range' }),
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getCustomerBalance
// ─────────────────────────────────────────────────────────────────────────────

describe('getCustomerBalance', () => {
  it('Test 12 — single match returns found=true with outstanding balance as number', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(
        makeChain([{ id: 'cust-abc', name: 'Ama Owusu', phone: '0244111222' }]) as never,
      )
      .mockReturnValueOnce(makeChain([{ outstanding: '750.00' }]) as never)

    const raw = await handleReadTool(
      'get_customer_balance',
      { customer_name_or_phone: 'Ama' },
      BIZ,
    )
    const result = JSON.parse(raw)

    expect(vi.mocked(db.select)).toHaveBeenCalledTimes(2)
    expect(result.found).toBe(true)
    expect(result.customer).toMatchObject({ name: 'Ama Owusu', phone: '0244111222' })
    expect(result.outstanding).toBe(750)
  })

  it('Test 13 — multiple matches returns found="multiple" with candidates; stops at 1 query', async () => {
    vi.mocked(db.select).mockReturnValueOnce(
      makeChain([
        { id: 'c1', name: 'Kofi Asante', phone: '0244000001' },
        { id: 'c2', name: 'Kofi Mensah', phone: '0244000002' },
      ]) as never,
    )

    const raw = await handleReadTool(
      'get_customer_balance',
      { customer_name_or_phone: 'Kofi' },
      BIZ,
    )
    const result = JSON.parse(raw)

    expect(vi.mocked(db.select)).toHaveBeenCalledTimes(1)
    expect(result.found).toBe('multiple')
    expect(result.candidates).toHaveLength(2)
    expect(result.candidates[0]).toMatchObject({ name: 'Kofi Asante', phone: '0244000001' })
    expect(result.message).toMatch(/Multiple customers found/)
  })

  it('Test 14 — no match returns found=false with message; no second query', async () => {
    vi.mocked(db.select).mockReturnValueOnce(makeChain([]) as never)

    const raw = await handleReadTool(
      'get_customer_balance',
      { customer_name_or_phone: 'Ghost' },
      BIZ,
    )
    const result = JSON.parse(raw)

    expect(vi.mocked(db.select)).toHaveBeenCalledTimes(1)
    expect(result.found).toBe(false)
    expect(result.message).toMatch(/No customer found matching "Ghost"/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// checkStock — specific product
// ─────────────────────────────────────────────────────────────────────────────

describe('checkStock — specific product', () => {
  it('Test 15 — single product below reorder level: found=true, lowStock=true', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(
        makeChain([{ id: 'prod-rice', name: 'Basmati Rice 5kg', unit: 'bags', reorderLevel: 10 }]) as never,
      )
      .mockReturnValueOnce(makeChain([{ total: '7' }]) as never)

    const raw = await handleReadTool('check_stock', { product_name: 'rice' }, BIZ)
    const result = JSON.parse(raw)

    expect(vi.mocked(db.select)).toHaveBeenCalledTimes(2)
    expect(result.found).toBe(true)
    expect(result.product.name).toBe('Basmati Rice 5kg')
    expect(result.product.stock).toBe(7)
    expect(result.product.reorderLevel).toBe(10)
    expect(result.product.lowStock).toBe(true)  // 7 <= 10
  })

  it('Test 15b — single product above reorder level: lowStock=false', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(
        makeChain([{ id: 'prod-oil', name: 'Palm Oil 1L', unit: 'bottles', reorderLevel: 5 }]) as never,
      )
      .mockReturnValueOnce(makeChain([{ total: '25' }]) as never)

    const raw = await handleReadTool('check_stock', { product_name: 'oil' }, BIZ)
    const result = JSON.parse(raw)

    expect(result.product.stock).toBe(25)
    expect(result.product.lowStock).toBe(false)  // 25 > 5
  })

  it('Test 17 — multiple product matches returns found="multiple"; stops at 1 query', async () => {
    vi.mocked(db.select).mockReturnValueOnce(
      makeChain([
        { id: 'p1', name: 'Rice 5kg', unit: 'bags', reorderLevel: 5 },
        { id: 'p2', name: 'Rice 25kg', unit: 'bags', reorderLevel: 3 },
      ]) as never,
    )

    const raw = await handleReadTool('check_stock', { product_name: 'Rice' }, BIZ)
    const result = JSON.parse(raw)

    expect(vi.mocked(db.select)).toHaveBeenCalledTimes(1)
    expect(result.found).toBe('multiple')
    expect(result.message).toMatch(/Rice 5kg/)
    expect(result.message).toMatch(/Rice 25kg/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// checkStock — no product name (low-stock scan)
// ─────────────────────────────────────────────────────────────────────────────

describe('checkStock — low-stock scan (no product_name)', () => {
  it('Test 16 — returns lowStockItems sorted ascending by stock level', async () => {
    // CALL 1: all tracked active products
    vi.mocked(db.select).mockReturnValueOnce(
      makeChain([
        { id: 'prod-a', name: 'Maize Flour', unit: 'bags', reorderLevel: 20 },
        { id: 'prod-b', name: 'Sugar 1kg', unit: 'packs', reorderLevel: 15 },
        { id: 'prod-c', name: 'Cooking Oil', unit: 'bottles', reorderLevel: 10 },
      ]) as never,
    )
    // CALL 2: stock aggregates by productId
    vi.mocked(db.select).mockReturnValueOnce(
      makeChain([
        { productId: 'prod-a', total: '8' },   // low
        { productId: 'prod-b', total: '25' },  // ok
        { productId: 'prod-c', total: '3' },   // low
      ]) as never,
    )

    const raw = await handleReadTool('check_stock', {}, BIZ)
    const result = JSON.parse(raw)

    expect(vi.mocked(db.select)).toHaveBeenCalledTimes(2)
    expect(result.count).toBe(2)
    expect(result.lowStockItems).toHaveLength(2)
    // Sorted ascending by stock: Cooking Oil (3) before Maize Flour (8)
    expect(result.lowStockItems[0]).toMatchObject({ name: 'Cooking Oil', stock: 3, reorderLevel: 10 })
    expect(result.lowStockItems[1]).toMatchObject({ name: 'Maize Flour', stock: 8, reorderLevel: 20 })
  })

  it('Test 16b — all products adequately stocked returns message string', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(
        makeChain([{ id: 'prod-a', name: 'Rice', unit: 'bags', reorderLevel: 5 }]) as never,
      )
      .mockReturnValueOnce(makeChain([{ productId: 'prod-a', total: '50' }]) as never)

    const raw = await handleReadTool('check_stock', {}, BIZ)
    const result = JSON.parse(raw)

    expect(result.message).toBe('All products are adequately stocked.')
  })

  it('Test 16c — no tracked products: 1 db.select call; returns early message', async () => {
    vi.mocked(db.select).mockReturnValueOnce(makeChain([]) as never)

    const raw = await handleReadTool('check_stock', {}, BIZ)
    const result = JSON.parse(raw)

    expect(vi.mocked(db.select)).toHaveBeenCalledTimes(1)
    expect(result.message).toBe('No tracked products found.')
  })
})
