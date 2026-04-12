import { and, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  customers,
  expenses,
  inventoryTransactions,
  orders,
  orderLines,
  products,
} from '@/db/schema'
import { getAccountBalances } from '@/lib/reports/engine'
import { formatGhs } from '@/lib/format'
import { resolvePeriod } from './periodResolver'

// ─── Main dispatcher ──────────────────────────────────────────────────────────

export async function handleReadTool(
  toolName: string,
  input: Record<string, unknown>,
  businessId: string,
): Promise<string> {
  switch (toolName) {
    case 'query_sales':
      return querySales(input, businessId)
    case 'query_expenses':
      return queryExpenses(input, businessId)
    case 'get_cash_position':
      return getCashPosition(businessId)
    case 'get_profit':
      return getProfit(input, businessId)
    case 'get_customer_balance':
      return getCustomerBalance(input, businessId)
    case 'check_stock':
      return checkStock(input, businessId)
    case 'generate_report':
      return generateReport(input)
    default:
      throw new Error(`Unknown read tool: ${toolName}`)
  }
}

// ─── query_sales ──────────────────────────────────────────────────────────────

async function querySales(
  input: Record<string, unknown>,
  businessId: string,
): Promise<string> {
  const { from, to } = resolvePeriod(
    input.period as string,
    input.date_from as string | undefined,
    input.date_to as string | undefined,
  )

  const groupBy = (input.group_by as string | undefined) ?? 'total'
  const customerName = input.customer_name as string | undefined

  const baseConditions = [
    eq(orders.businessId, businessId),
    gte(orders.orderDate, from),
    lte(orders.orderDate, to),
    inArray(orders.status, ['confirmed', 'fulfilled']),
  ]

  // Customer name filter — look up customer IDs first
  if (customerName) {
    const matched = await db
      .select({ id: customers.id })
      .from(customers)
      .where(
        and(
          eq(customers.businessId, businessId),
          ilike(customers.name, `%${customerName}%`),
        ),
      )
    if (matched.length === 0) {
      return JSON.stringify({ message: `No customer found matching "${customerName}".` })
    }
    baseConditions.push(inArray(orders.customerId, matched.map((c) => c.id)))
  }

  if (groupBy === 'product') {
    const rows = await db
      .select({
        itemName: sql<string>`COALESCE(${orderLines.description}, 'Unknown Item')`,
        qty: sql<string>`SUM(${orderLines.quantity})`,
        total: sql<string>`SUM(${orderLines.lineTotal})`,
      })
      .from(orders)
      .innerJoin(orderLines, eq(orderLines.orderId, orders.id))
      .where(and(...baseConditions))
      .groupBy(sql`COALESCE(${orderLines.description}, 'Unknown Item')`)
      .orderBy(sql`SUM(${orderLines.lineTotal}) DESC`)
      .limit(20)

    return JSON.stringify({
      period: { from, to },
      groupBy: 'product',
      items: rows.map((r) => ({
        name: r.itemName,
        qty: Number(r.qty),
        total: Number(r.total),
        totalFormatted: formatGhs(Number(r.total)),
      })),
    })
  }

  if (groupBy === 'customer') {
    const rows = await db
      .select({
        customerName: customers.name,
        customerPhone: customers.phone,
        orderCount: sql<string>`COUNT(${orders.id})`,
        total: sql<string>`SUM(${orders.totalAmount})`,
      })
      .from(orders)
      .leftJoin(customers, eq(customers.id, orders.customerId))
      .where(and(...baseConditions))
      .groupBy(customers.name, customers.phone)
      .orderBy(sql`SUM(${orders.totalAmount}) DESC`)
      .limit(20)

    return JSON.stringify({
      period: { from, to },
      groupBy: 'customer',
      customers: rows.map((r) => ({
        name: r.customerName ?? 'Walk-in',
        phone: r.customerPhone,
        orders: Number(r.orderCount),
        total: Number(r.total),
        totalFormatted: formatGhs(Number(r.total)),
      })),
    })
  }

  if (groupBy === 'day') {
    const rows = await db
      .select({
        date: orders.orderDate,
        orderCount: sql<string>`COUNT(${orders.id})`,
        total: sql<string>`SUM(${orders.totalAmount})`,
      })
      .from(orders)
      .where(and(...baseConditions))
      .groupBy(orders.orderDate)
      .orderBy(orders.orderDate)

    return JSON.stringify({
      period: { from, to },
      groupBy: 'day',
      days: rows.map((r) => ({
        date: r.date,
        orders: Number(r.orderCount),
        total: Number(r.total),
        totalFormatted: formatGhs(Number(r.total)),
      })),
    })
  }

  // Default: total
  const [row] = await db
    .select({
      orderCount: sql<string>`COUNT(${orders.id})`,
      total: sql<string>`COALESCE(SUM(${orders.totalAmount}), 0)`,
    })
    .from(orders)
    .where(and(...baseConditions))

  return JSON.stringify({
    period: { from, to },
    groupBy: 'total',
    orderCount: Number(row?.orderCount ?? 0),
    total: Number(row?.total ?? 0),
    totalFormatted: formatGhs(Number(row?.total ?? 0)),
  })
}

// ─── query_expenses ───────────────────────────────────────────────────────────

async function queryExpenses(
  input: Record<string, unknown>,
  businessId: string,
): Promise<string> {
  const { from, to } = resolvePeriod(
    input.period as string,
    input.date_from as string | undefined,
    input.date_to as string | undefined,
  )

  const groupBy = (input.group_by as string | undefined) ?? 'total'
  const category = input.category as string | undefined

  const baseConditions = [
    eq(expenses.businessId, businessId),
    gte(expenses.expenseDate, from),
    lte(expenses.expenseDate, to),
    eq(expenses.approvalStatus, 'approved'),
    ...(category ? [eq(expenses.category, category)] : []),
  ]

  if (groupBy === 'category') {
    const rows = await db
      .select({
        category: expenses.category,
        count: sql<string>`COUNT(${expenses.id})`,
        total: sql<string>`SUM(${expenses.amount})`,
      })
      .from(expenses)
      .where(and(...baseConditions))
      .groupBy(expenses.category)
      .orderBy(sql`SUM(${expenses.amount}) DESC`)

    return JSON.stringify({
      period: { from, to },
      groupBy: 'category',
      categories: rows.map((r) => ({
        category: r.category ?? 'Uncategorised',
        count: Number(r.count),
        total: Number(r.total),
        totalFormatted: formatGhs(Number(r.total)),
      })),
    })
  }

  if (groupBy === 'day') {
    const rows = await db
      .select({
        date: expenses.expenseDate,
        count: sql<string>`COUNT(${expenses.id})`,
        total: sql<string>`SUM(${expenses.amount})`,
      })
      .from(expenses)
      .where(and(...baseConditions))
      .groupBy(expenses.expenseDate)
      .orderBy(expenses.expenseDate)

    return JSON.stringify({
      period: { from, to },
      groupBy: 'day',
      days: rows.map((r) => ({
        date: r.date,
        count: Number(r.count),
        total: Number(r.total),
        totalFormatted: formatGhs(Number(r.total)),
      })),
    })
  }

  // Default: total
  const [row] = await db
    .select({
      count: sql<string>`COUNT(${expenses.id})`,
      total: sql<string>`COALESCE(SUM(${expenses.amount}), 0)`,
    })
    .from(expenses)
    .where(and(...baseConditions))

  return JSON.stringify({
    period: { from, to },
    groupBy: 'total',
    count: Number(row?.count ?? 0),
    total: Number(row?.total ?? 0),
    totalFormatted: formatGhs(Number(row?.total ?? 0)),
  })
}

// ─── get_cash_position ────────────────────────────────────────────────────────

async function getCashPosition(businessId: string): Promise<string> {
  const today = new Date().toISOString().slice(0, 10)
  const balances = await getAccountBalances(
    businessId,
    { type: 'asOf', date: today },
    ['1001', '1002', '1003', '1004', '1005'],
  )

  const accounts = balances.map((a) => ({
    name: a.accountName,
    code: a.accountCode,
    balance: a.netBalance,
    balanceFormatted: formatGhs(a.netBalance),
  }))

  const total = balances.reduce((s, a) => s + a.netBalance, 0)

  return JSON.stringify({
    accounts,
    total,
    totalFormatted: formatGhs(total),
    asOf: today,
  })
}

// ─── get_profit ───────────────────────────────────────────────────────────────

async function getProfit(
  input: Record<string, unknown>,
  businessId: string,
): Promise<string> {
  const { from, to } = resolvePeriod(
    input.period as string,
    input.date_from as string | undefined,
    input.date_to as string | undefined,
  )

  const balances = await getAccountBalances(businessId, { type: 'range', from, to })

  const revenue = balances
    .filter((a) => a.accountType === 'revenue')
    .reduce((s, a) => s + a.netBalance, 0)

  const cogs = balances
    .filter((a) => a.accountType === 'cogs')
    .reduce((s, a) => s + a.netBalance, 0)

  const expensesTotal = balances
    .filter((a) => a.accountType === 'expense')
    .reduce((s, a) => s + a.netBalance, 0)

  const grossProfit = revenue - cogs
  const netProfit = revenue - cogs - expensesTotal

  return JSON.stringify({
    period: { from, to },
    revenue,
    revenueFormatted: formatGhs(revenue),
    cogs,
    cogsFormatted: formatGhs(cogs),
    grossProfit,
    grossProfitFormatted: formatGhs(grossProfit),
    expenses: expensesTotal,
    expensesFormatted: formatGhs(expensesTotal),
    netProfit,
    netProfitFormatted: formatGhs(netProfit),
    grossMarginPct:
      revenue > 0 ? Math.round((grossProfit / revenue) * 100 * 10) / 10 : 0,
    netMarginPct: revenue > 0 ? Math.round((netProfit / revenue) * 100 * 10) / 10 : 0,
  })
}

// ─── get_customer_balance ─────────────────────────────────────────────────────

async function getCustomerBalance(
  input: Record<string, unknown>,
  businessId: string,
): Promise<string> {
  const identifier = input.customer_name_or_phone as string

  const matches = await db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
    })
    .from(customers)
    .where(
      and(
        eq(customers.businessId, businessId),
        eq(customers.isActive, true),
        or(ilike(customers.name, `%${identifier}%`), eq(customers.phone, identifier)),
      ),
    )
    .limit(5)

  if (matches.length === 0) {
    return JSON.stringify({
      found: false,
      message: `No customer found matching "${identifier}".`,
    })
  }

  if (matches.length > 1) {
    return JSON.stringify({
      found: 'multiple',
      candidates: matches.map((c) => ({ name: c.name, phone: c.phone ?? '' })),
      message: 'Multiple customers found. Ask the user to clarify which one.',
    })
  }

  const customer = matches[0]

  const [balRow] = await db
    .select({
      outstanding: sql<string>`COALESCE(SUM(${orders.totalAmount} - ${orders.amountPaid}), 0)`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.businessId, businessId),
        eq(orders.customerId, customer.id),
        inArray(orders.paymentStatus, ['unpaid', 'partial']),
        inArray(orders.status, ['confirmed', 'fulfilled']),
      ),
    )

  const outstanding = Number(balRow?.outstanding ?? 0)

  return JSON.stringify({
    found: true,
    customer: { name: customer.name, phone: customer.phone },
    outstanding,
    outstandingFormatted: formatGhs(outstanding),
  })
}

// ─── check_stock ──────────────────────────────────────────────────────────────

async function checkStock(
  input: Record<string, unknown>,
  businessId: string,
): Promise<string> {
  const productName = input.product_name as string | undefined

  if (productName) {
    const matched = await db
      .select({
        id: products.id,
        name: products.name,
        unit: products.unit,
        reorderLevel: products.reorderLevel,
      })
      .from(products)
      .where(
        and(
          eq(products.businessId, businessId),
          ilike(products.name, `%${productName}%`),
          eq(products.isActive, true),
        ),
      )
      .limit(5)

    if (matched.length === 0) {
      return JSON.stringify({
        found: false,
        message: `No product found matching "${productName}".`,
      })
    }

    if (matched.length > 1) {
      const names = matched.map((p) => p.name).join(', ')
      return JSON.stringify({
        found: 'multiple',
        message: `Multiple products found: ${names}. Which one did you mean?`,
      })
    }

    const product = matched[0]

    const [stockRow] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${inventoryTransactions.quantity}), 0)`,
      })
      .from(inventoryTransactions)
      .where(
        and(
          eq(inventoryTransactions.businessId, businessId),
          eq(inventoryTransactions.productId, product.id),
        ),
      )

    const stock = Number(stockRow?.total ?? 0)

    return JSON.stringify({
      found: true,
      product: {
        name: product.name,
        unit: product.unit ?? 'units',
        stock,
        reorderLevel: product.reorderLevel,
        lowStock: stock <= product.reorderLevel,
      },
    })
  }

  // No product name: return all low-stock items
  const allProducts = await db
    .select({
      id: products.id,
      name: products.name,
      unit: products.unit,
      reorderLevel: products.reorderLevel,
    })
    .from(products)
    .where(
      and(
        eq(products.businessId, businessId),
        eq(products.trackInventory, true),
        eq(products.isActive, true),
      ),
    )

  if (allProducts.length === 0) {
    return JSON.stringify({ message: 'No tracked products found.' })
  }

  const stockData = await db
    .select({
      productId: inventoryTransactions.productId,
      total: sql<string>`COALESCE(SUM(${inventoryTransactions.quantity}), 0)`,
    })
    .from(inventoryTransactions)
    .where(
      and(
        eq(inventoryTransactions.businessId, businessId),
        inArray(
          inventoryTransactions.productId,
          allProducts.map((p) => p.id),
        ),
      ),
    )
    .groupBy(inventoryTransactions.productId)

  const stockMap = new Map(stockData.map((s) => [s.productId, Number(s.total)]))

  const lowStock = allProducts
    .map((p) => ({ ...p, stock: stockMap.get(p.id) ?? 0 }))
    .filter((p) => p.stock <= p.reorderLevel)
    .sort((a, b) => a.stock - b.stock)

  if (lowStock.length === 0) {
    return JSON.stringify({ message: 'All products are adequately stocked.' })
  }

  return JSON.stringify({
    lowStockItems: lowStock.map((p) => ({
      name: p.name,
      unit: p.unit ?? 'units',
      stock: p.stock,
      reorderLevel: p.reorderLevel,
    })),
    count: lowStock.length,
  })
}

// ─── generate_report ─────────────────────────────────────────────────────────

const REPORT_URLS: Record<string, string> = {
  profit_and_loss: '/reports/profit-loss',
  balance_sheet: '/reports/balance-sheet',
  trial_balance: '/reports/trial-balance',
  cash_flow: '/reports/cash-flow',
  ar_aging: '/reports/ar-aging',
  vat_report: '/reports/vat',
  sales_report: '/sales',
  expense_report: '/expenses',
  inventory_valuation: '/inventory',
}

const REPORT_LABELS: Record<string, string> = {
  profit_and_loss: 'Profit & Loss',
  balance_sheet: 'Balance Sheet',
  trial_balance: 'Trial Balance',
  cash_flow: 'Cash Flow Statement',
  ar_aging: 'Accounts Receivable Aging',
  vat_report: 'VAT Report',
  sales_report: 'Sales Report',
  expense_report: 'Expense Report',
  inventory_valuation: 'Inventory Valuation',
}

async function generateReport(input: Record<string, unknown>): Promise<string> {
  const reportType = input.report_type as string
  const period = input.period as string | undefined

  const url = REPORT_URLS[reportType] ?? '/reports'
  const label = REPORT_LABELS[reportType] ?? reportType

  return JSON.stringify({
    url,
    label,
    period: period ?? 'current period',
    message: `The ${label} report is available at ${url}.`,
  })
}
