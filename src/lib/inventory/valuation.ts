import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { products, accounts, journalLines } from '@/db/schema'
import { getProductTransactions } from './queries'
import { computeFifoInventoryValue } from './fifo'

// ─── Types ───────────────────────────────────────────────────────────────────

export type ValuationLineItem = {
  productId: string
  productName: string
  sku: string | null
  category: string | null
  unit: string | null
  currentQuantity: number
  fifoUnitCost: number
  totalValue: number
  reorderLevel: number
  isLowStock: boolean
}

export type ValuationReport = {
  generatedAt: Date
  lines: ValuationLineItem[]
  grandTotalValue: number
  lowStockCount: number
  glAccountBalance: number
  isReconciled: boolean
  discrepancy: number
}

// ─── computeInventoryValuation ──────────────────────────────────────────────

export async function computeInventoryValuation(
  businessId: string,
): Promise<ValuationReport> {
  // 1. Fetch all active products with inventory tracking
  const activeProducts = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      category: products.category,
      unit: products.unit,
      reorderLevel: products.reorderLevel,
    })
    .from(products)
    .where(
      and(
        eq(products.businessId, businessId),
        eq(products.isActive, true),
        eq(products.trackInventory, true),
      ),
    )

  // 2. Compute FIFO value for each product
  const lines: ValuationLineItem[] = []
  for (const product of activeProducts) {
    const transactions = await getProductTransactions(product.id, businessId)
    const fifoValue = computeFifoInventoryValue(transactions)

    const currentQuantity = fifoValue.totalQuantity
    const totalValue = fifoValue.totalValue
    const fifoUnitCost =
      currentQuantity > 0
        ? Math.round((totalValue / currentQuantity) * 100) / 100
        : 0

    const isLowStock =
      product.reorderLevel > 0 &&
      currentQuantity > 0 &&
      currentQuantity <= product.reorderLevel

    lines.push({
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      category: product.category,
      unit: product.unit,
      currentQuantity,
      fifoUnitCost,
      totalValue,
      reorderLevel: product.reorderLevel,
      isLowStock,
    })
  }

  // 3. Aggregate totals
  const grandTotalValue = Math.round(
    lines.reduce((sum, l) => sum + l.totalValue, 0) * 100,
  ) / 100
  const lowStockCount = lines.filter((l) => l.isLowStock).length

  // 4. Fetch GL account 1200 balance for reconciliation
  const glResult = await db
    .select({
      balance: sql<string>`COALESCE(SUM(${journalLines.debitAmount}), 0) - COALESCE(SUM(${journalLines.creditAmount}), 0)`,
    })
    .from(accounts)
    .leftJoin(journalLines, eq(journalLines.accountId, accounts.id))
    .where(
      and(
        eq(accounts.businessId, businessId),
        eq(accounts.code, '1200'),
      ),
    )

  const glAccountBalance = Math.round(Number(glResult[0]?.balance ?? 0) * 100) / 100
  const discrepancy = Math.round((grandTotalValue - glAccountBalance) * 100) / 100
  const isReconciled = Math.abs(discrepancy) < 0.01

  return {
    generatedAt: new Date(),
    lines,
    grandTotalValue,
    lowStockCount,
    glAccountBalance,
    isReconciled,
    discrepancy,
  }
}
