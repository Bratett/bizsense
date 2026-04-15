import { type NextRequest } from 'next/server'
import { and, eq, gte } from 'drizzle-orm'
import { db } from '@/db'
import {
  businesses,
  businessSettings,
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

  // Run all queries in a single transaction so they share one connection.
  // Promise.all across 13 separate queries exhausts PgBouncer's session-mode pool.
  const {
    businessData,
    businessSettingsData,
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
  } = await db.transaction(async (tx) => {
    const sinceDate = since ? new Date(since) : null

    const [
      businessData,
      businessSettingsData,
      accountsData,
      taxData,
      customersData,
      ordersData,
      orderLinesRaw,
      expensesData,
      productsData,
      inventoryData,
      suppliersData,
      fxData,
      journalEntriesData,
      journalLinesRaw,
    ] = await Promise.all([
      // Business: filtered by id (businesses table has no businessId column)
      tx.select().from(businesses).where(eq(businesses.id, businessId)),

      // Business settings: always return full row — one row per business, no since filter
      tx.select().from(businessSettings).where(eq(businessSettings.businessId, businessId)),

      // Accounts: always return full set — small, critical for offline VAT calculation
      tx.select().from(accounts).where(eq(accounts.businessId, businessId)),

      // Tax components: always return full set — required for offline Ghana cascading VAT
      tx.select().from(taxComponents).where(eq(taxComponents.businessId, businessId)),

      // Customers: with since filter
      tx
        .select()
        .from(customers)
        .where(
          and(
            eq(customers.businessId, businessId),
            sinceDate ? gte(customers.updatedAt, sinceDate) : undefined,
          ),
        ),

      // Orders: with since filter
      tx
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.businessId, businessId),
            sinceDate ? gte(orders.updatedAt, sinceDate) : undefined,
          ),
        ),

      // Order lines: inner join to enforce businessId scope (lines have no businessId)
      tx
        .select()
        .from(orderLines)
        .innerJoin(orders, eq(orders.id, orderLines.orderId))
        .where(eq(orders.businessId, businessId)),

      // Expenses: with since filter
      tx
        .select()
        .from(expenses)
        .where(
          and(
            eq(expenses.businessId, businessId),
            sinceDate ? gte(expenses.updatedAt, sinceDate) : undefined,
          ),
        ),

      // Products: with since filter
      tx
        .select()
        .from(products)
        .where(
          and(
            eq(products.businessId, businessId),
            sinceDate ? gte(products.updatedAt, sinceDate) : undefined,
          ),
        ),

      // Inventory transactions: with since filter
      tx
        .select()
        .from(inventoryTransactions)
        .where(
          and(
            eq(inventoryTransactions.businessId, businessId),
            sinceDate ? gte(inventoryTransactions.updatedAt, sinceDate) : undefined,
          ),
        ),

      // Suppliers: with since filter
      tx
        .select()
        .from(suppliers)
        .where(
          and(
            eq(suppliers.businessId, businessId),
            sinceDate ? gte(suppliers.updatedAt, sinceDate) : undefined,
          ),
        ),

      // FX rates: always return last 90 days — reference data, no since filter
      tx
        .select()
        .from(fxRates)
        .where(and(eq(fxRates.businessId, businessId), gte(fxRates.rateDate, ninetyDaysAgo))),

      // Journal entries: with since filter
      tx
        .select()
        .from(journalEntries)
        .where(
          and(
            eq(journalEntries.businessId, businessId),
            sinceDate ? gte(journalEntries.updatedAt, sinceDate) : undefined,
          ),
        ),

      // Journal lines: inner join to enforce businessId scope (lines have no businessId)
      tx
        .select()
        .from(journalLines)
        .innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalEntryId))
        .where(eq(journalEntries.businessId, businessId)),
    ])

    return {
      businessData,
      businessSettingsData,
      accountsData,
      taxData,
      customersData,
      ordersData,
      orderLinesData: orderLinesRaw.map((r) => r.order_lines),
      expensesData,
      productsData,
      inventoryData,
      suppliersData,
      fxData,
      journalEntriesData,
      journalLinesData: journalLinesRaw.map((r) => r.journal_lines),
    }
  })

  return Response.json({
    pulledAt: new Date().toISOString(),
    data: {
      businesses: businessData,
      businessSettings: businessSettingsData,
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
