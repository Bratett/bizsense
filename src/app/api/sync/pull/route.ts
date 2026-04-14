import { type NextRequest } from 'next/server'
import { and, eq, gte } from 'drizzle-orm'
import { db } from '@/db'
import {
  businesses,
  accounts,
  taxComponents,
  customers,
  orders,
  orderLines,
  expenses,
  products,
  inventoryTransactions,
  suppliers,
  fxRates,
  journalEntries,
  journalLines,
} from '@/db/schema'
import { getServerSession } from '@/lib/session'

export async function GET(req: NextRequest) {
  let session: Awaited<ReturnType<typeof getServerSession>>
  try {
    session = await getServerSession()
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const businessId = session.user.businessId // always from session — never from query params
  const url = new URL(req.url)
  const since = url.searchParams.get('since') // ISO timestamp or null

  // 'since' is optional. null → full bootstrap (all records).
  // provided → only records with updatedAt after that timestamp.

  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10) // YYYY-MM-DD string for date column comparison

  const [
    businessData,
    accountsData,
    taxData,
    customersData,
    ordersData,
    orderLinesData,
    expensesData,
    productsData,
    inventoryData,
    suppliersData,
    fxData,
    journalEntriesData,
    journalLinesData,
  ] = await Promise.all([
    // Business: filtered by id (businesses table has no businessId column)
    db.select().from(businesses).where(eq(businesses.id, businessId)),

    // Accounts: always return full set — small, critical for offline VAT calculation
    db.select().from(accounts).where(eq(accounts.businessId, businessId)),

    // Tax components: always return full set — required for offline Ghana cascading VAT
    db.select().from(taxComponents).where(eq(taxComponents.businessId, businessId)),

    // Customers: with since filter
    db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.businessId, businessId),
          since ? gte(customers.updatedAt, new Date(since)) : undefined,
        ),
      ),

    // Orders: with since filter
    db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.businessId, businessId),
          since ? gte(orders.updatedAt, new Date(since)) : undefined,
        ),
      ),

    // Order lines: inner join to enforce businessId scope (lines have no businessId)
    db
      .select()
      .from(orderLines)
      .innerJoin(orders, eq(orders.id, orderLines.orderId))
      .where(eq(orders.businessId, businessId))
      .then((rows) => rows.map((r) => r.order_lines)),

    // Expenses: with since filter
    db
      .select()
      .from(expenses)
      .where(
        and(
          eq(expenses.businessId, businessId),
          since ? gte(expenses.updatedAt, new Date(since)) : undefined,
        ),
      ),

    // Products: with since filter
    db
      .select()
      .from(products)
      .where(
        and(
          eq(products.businessId, businessId),
          since ? gte(products.updatedAt, new Date(since)) : undefined,
        ),
      ),

    // Inventory transactions: with since filter
    db
      .select()
      .from(inventoryTransactions)
      .where(
        and(
          eq(inventoryTransactions.businessId, businessId),
          since ? gte(inventoryTransactions.updatedAt, new Date(since)) : undefined,
        ),
      ),

    // Suppliers: with since filter
    db
      .select()
      .from(suppliers)
      .where(
        and(
          eq(suppliers.businessId, businessId),
          since ? gte(suppliers.updatedAt, new Date(since)) : undefined,
        ),
      ),

    // FX rates: always return last 90 days — reference data, no since filter
    db
      .select()
      .from(fxRates)
      .where(and(eq(fxRates.businessId, businessId), gte(fxRates.rateDate, ninetyDaysAgo))),

    // Journal entries: with since filter
    db
      .select()
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.businessId, businessId),
          since ? gte(journalEntries.updatedAt, new Date(since)) : undefined,
        ),
      ),

    // Journal lines: inner join to enforce businessId scope (lines have no businessId)
    db
      .select()
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalEntryId))
      .where(eq(journalEntries.businessId, businessId))
      .then((rows) => rows.map((r) => r.journal_lines)),
  ])

  return Response.json({
    pulledAt: new Date().toISOString(),
    data: {
      businesses: businessData,
      accounts: accountsData,
      taxComponents: taxData,
      customers: customersData,
      orders: ordersData,
      orderLines: orderLinesData,
      expenses: expensesData,
      products: productsData,
      inventoryTransactions: inventoryData,
      suppliers: suppliersData,
      fxRates: fxData,
      journalEntries: journalEntriesData,
      journalLines: journalLinesData,
    },
  })
}
