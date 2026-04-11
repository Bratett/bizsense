'use server'

import { and, eq, isNull, sql, desc } from 'drizzle-orm'
import { db } from '@/db'
import { products, stocktakes, stocktakeLines } from '@/db/schema'
import { requireRole } from '@/lib/auth/requireRole'
import { getServerSession } from '@/lib/session'
import { getProductTransactions } from '@/lib/inventory/queries'
import { computeFifoInventoryValue } from '@/lib/inventory/fifo'
import { adjustStock } from '@/actions/inventory'

// ─── Types ───────────────────────────────────────────────────────────────────

export type StocktakeActionResult =
  | { success: true; stocktakeId: string }
  | { success: false; error: string }

export type StocktakeUpdateResult =
  | { success: true }
  | { success: false; error: string }

export type StocktakeLineData = {
  id: string
  productId: string
  productName: string
  productSku: string | null
  productCategory: string | null
  productUnit: string | null
  expectedQuantity: number
  countedQuantity: number | null
  varianceQuantity: number | null
  varianceValue: number | null
  adjustmentPosted: boolean
  notes: string | null
}

export type ActiveStocktake = {
  id: string
  status: string
  initiatedAt: Date
  confirmedAt: Date | null
  notes: string | null
  lines: StocktakeLineData[]
}

export type StocktakeHistoryItem = {
  id: string
  status: string
  initiatedAt: Date
  confirmedAt: Date | null
  notes: string | null
  lineCount: number
  totalVarianceValue: number
}

// ─── initiateStocktake ──────────────────────────────────────────────────────

export async function initiateStocktake(
  notes?: string,
): Promise<StocktakeActionResult> {
  const user = await requireRole(['owner', 'manager', 'accountant'])
  const { businessId } = user

  // Block if a stocktake is already in progress
  const existing = await db
    .select({ id: stocktakes.id })
    .from(stocktakes)
    .where(
      and(
        eq(stocktakes.businessId, businessId),
        eq(stocktakes.status, 'in_progress'),
      ),
    )
    .limit(1)

  if (existing.length > 0) {
    return {
      success: false,
      error: 'A stocktake is already in progress. Complete or cancel it before starting a new one.',
    }
  }

  // Fetch all active products that track inventory
  const activeProducts = await db
    .select({
      id: products.id,
      name: products.name,
    })
    .from(products)
    .where(
      and(
        eq(products.businessId, businessId),
        eq(products.isActive, true),
        eq(products.trackInventory, true),
      ),
    )

  if (activeProducts.length === 0) {
    return {
      success: false,
      error: 'No active products with inventory tracking. Add products before starting a stocktake.',
    }
  }

  // Compute expected quantities via FIFO for each product
  const productSnapshots: Array<{ productId: string; expectedQuantity: number }> = []
  for (const product of activeProducts) {
    const transactions = await getProductTransactions(product.id, businessId)
    const fifoValue = computeFifoInventoryValue(transactions)
    productSnapshots.push({
      productId: product.id,
      expectedQuantity: fifoValue.totalQuantity,
    })
  }

  // Atomic insert: stocktake + all lines
  const stocktakeId = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(stocktakes)
      .values({
        businessId,
        status: 'in_progress',
        initiatedBy: user.id,
        notes: notes?.trim() || null,
      })
      .returning({ id: stocktakes.id })

    if (productSnapshots.length > 0) {
      await tx.insert(stocktakeLines).values(
        productSnapshots.map((snap) => ({
          stocktakeId: row.id,
          productId: snap.productId,
          expectedQuantity: snap.expectedQuantity.toFixed(2),
        })),
      )
    }

    return row.id
  })

  return { success: true, stocktakeId }
}

// ─── updateStocktakeCount ───────────────────────────────────────────────────

export async function updateStocktakeCount(
  stocktakeId: string,
  productId: string,
  countedQuantity: number,
): Promise<StocktakeUpdateResult> {
  const user = await requireRole(['owner', 'manager', 'accountant'])
  const { businessId } = user

  if (countedQuantity < 0) {
    return { success: false, error: 'Counted quantity cannot be negative' }
  }

  // Verify stocktake is in_progress and belongs to this business
  const [stocktake] = await db
    .select({ id: stocktakes.id, status: stocktakes.status })
    .from(stocktakes)
    .where(
      and(
        eq(stocktakes.id, stocktakeId),
        eq(stocktakes.businessId, businessId),
      ),
    )

  if (!stocktake) {
    return { success: false, error: 'Stocktake not found' }
  }
  if (stocktake.status !== 'in_progress') {
    return { success: false, error: 'Stocktake is not in progress' }
  }

  // Find the matching line
  const [line] = await db
    .select({
      id: stocktakeLines.id,
      expectedQuantity: stocktakeLines.expectedQuantity,
    })
    .from(stocktakeLines)
    .where(
      and(
        eq(stocktakeLines.stocktakeId, stocktakeId),
        eq(stocktakeLines.productId, productId),
      ),
    )

  if (!line) {
    return { success: false, error: 'Product not found in this stocktake' }
  }

  const expectedQty = Number(line.expectedQuantity)
  const varianceQuantity = Math.round((countedQuantity - expectedQty) * 100) / 100

  // Compute FIFO unit cost for variance value
  let fifoUnitCost = 0
  if (varianceQuantity !== 0) {
    const transactions = await getProductTransactions(productId, businessId)
    const fifoValue = computeFifoInventoryValue(transactions)
    if (fifoValue.totalQuantity > 0) {
      fifoUnitCost = Math.round((fifoValue.totalValue / fifoValue.totalQuantity) * 100) / 100
    } else {
      // Fallback to product cost price
      const [product] = await db
        .select({ costPrice: products.costPrice })
        .from(products)
        .where(eq(products.id, productId))
      fifoUnitCost = Number(product?.costPrice ?? 0)
    }
  }

  const varianceValue = Math.round(varianceQuantity * fifoUnitCost * 100) / 100

  await db
    .update(stocktakeLines)
    .set({
      countedQuantity: countedQuantity.toFixed(2),
      varianceQuantity: varianceQuantity.toFixed(2),
      varianceValue: varianceValue.toFixed(2),
      updatedAt: new Date(),
    })
    .where(eq(stocktakeLines.id, line.id))

  return { success: true }
}

// ─── confirmStocktake ───────────────────────────────────────────────────────

export async function confirmStocktake(
  stocktakeId: string,
): Promise<StocktakeUpdateResult> {
  const user = await requireRole(['owner', 'manager'])
  const { businessId } = user

  // Verify stocktake
  const [stocktake] = await db
    .select({ id: stocktakes.id, status: stocktakes.status })
    .from(stocktakes)
    .where(
      and(
        eq(stocktakes.id, stocktakeId),
        eq(stocktakes.businessId, businessId),
      ),
    )

  if (!stocktake) {
    return { success: false, error: 'Stocktake not found' }
  }
  if (stocktake.status !== 'in_progress') {
    return { success: false, error: 'Stocktake is not in progress' }
  }

  // Fetch all lines
  const lines = await db
    .select({
      id: stocktakeLines.id,
      productId: stocktakeLines.productId,
      countedQuantity: stocktakeLines.countedQuantity,
      varianceQuantity: stocktakeLines.varianceQuantity,
      varianceValue: stocktakeLines.varianceValue,
      adjustmentPosted: stocktakeLines.adjustmentPosted,
    })
    .from(stocktakeLines)
    .where(eq(stocktakeLines.stocktakeId, stocktakeId))

  // Verify all lines have been counted
  const uncountedLines = lines.filter((l) => l.countedQuantity === null)
  if (uncountedLines.length > 0) {
    return {
      success: false,
      error: `Count not complete. ${uncountedLines.length} ${uncountedLines.length === 1 ? 'product has' : 'products have'} not been counted yet.`,
    }
  }

  // Post adjustments for each line with variance
  const errors: string[] = []
  for (const line of lines) {
    const variance = Number(line.varianceQuantity ?? 0)
    if (Math.abs(variance) < 0.001 || line.adjustmentPosted) continue

    const absVariance = Math.abs(variance)
    const varianceVal = Number(line.varianceValue ?? 0)

    if (variance > 0) {
      // Surplus — add stock
      const unitCost = absVariance > 0 ? Math.round((Math.abs(varianceVal) / absVariance) * 100) / 100 : 0
      const result = await adjustStock({
        productId: line.productId,
        adjustmentType: 'add',
        quantity: absVariance,
        unitCost,
        reason: 'Stocktake adjustment',
        notes: `Stocktake ID: ${stocktakeId}`,
      })
      if (!result.success) {
        errors.push(`Failed to adjust product ${line.productId}: ${result.error}`)
        continue
      }
    } else {
      // Shortage — remove stock
      const result = await adjustStock({
        productId: line.productId,
        adjustmentType: 'remove',
        quantity: absVariance,
        reason: 'Stocktake adjustment',
        notes: `Stocktake ID: ${stocktakeId}`,
      })
      if (!result.success) {
        errors.push(`Failed to adjust product ${line.productId}: ${result.error}`)
        continue
      }
    }

    // Mark line as posted
    await db
      .update(stocktakeLines)
      .set({ adjustmentPosted: true, updatedAt: new Date() })
      .where(eq(stocktakeLines.id, line.id))
  }

  // Mark stocktake as confirmed regardless of individual line errors
  await db
    .update(stocktakes)
    .set({
      status: 'confirmed',
      confirmedAt: new Date(),
      confirmedBy: user.id,
      updatedAt: new Date(),
    })
    .where(eq(stocktakes.id, stocktakeId))

  if (errors.length > 0) {
    return {
      success: false,
      error: `Stocktake confirmed with ${errors.length} adjustment error(s): ${errors.join('; ')}`,
    }
  }

  return { success: true }
}

// ─── cancelStocktake ────────────────────────────────────────────────────────

export async function cancelStocktake(
  stocktakeId: string,
): Promise<StocktakeUpdateResult> {
  const user = await requireRole(['owner', 'manager'])
  const { businessId } = user

  const [stocktake] = await db
    .select({ id: stocktakes.id, status: stocktakes.status })
    .from(stocktakes)
    .where(
      and(
        eq(stocktakes.id, stocktakeId),
        eq(stocktakes.businessId, businessId),
      ),
    )

  if (!stocktake) {
    return { success: false, error: 'Stocktake not found' }
  }
  if (stocktake.status !== 'in_progress') {
    return { success: false, error: 'Only in-progress stocktakes can be cancelled' }
  }

  await db
    .update(stocktakes)
    .set({
      status: 'cancelled',
      updatedAt: new Date(),
    })
    .where(eq(stocktakes.id, stocktakeId))

  return { success: true }
}

// ─── getActiveStocktake ─────────────────────────────────────────────────────

export async function getActiveStocktake(): Promise<ActiveStocktake | null> {
  const session = await getServerSession()
  const { businessId } = session.user

  const [stocktake] = await db
    .select({
      id: stocktakes.id,
      status: stocktakes.status,
      initiatedAt: stocktakes.initiatedAt,
      confirmedAt: stocktakes.confirmedAt,
      notes: stocktakes.notes,
    })
    .from(stocktakes)
    .where(
      and(
        eq(stocktakes.businessId, businessId),
        eq(stocktakes.status, 'in_progress'),
      ),
    )
    .limit(1)

  if (!stocktake) return null

  const lines = await db
    .select({
      id: stocktakeLines.id,
      productId: stocktakeLines.productId,
      productName: products.name,
      productSku: products.sku,
      productCategory: products.category,
      productUnit: products.unit,
      expectedQuantity: stocktakeLines.expectedQuantity,
      countedQuantity: stocktakeLines.countedQuantity,
      varianceQuantity: stocktakeLines.varianceQuantity,
      varianceValue: stocktakeLines.varianceValue,
      adjustmentPosted: stocktakeLines.adjustmentPosted,
      notes: stocktakeLines.notes,
    })
    .from(stocktakeLines)
    .innerJoin(products, eq(stocktakeLines.productId, products.id))
    .where(eq(stocktakeLines.stocktakeId, stocktake.id))

  return {
    id: stocktake.id,
    status: stocktake.status,
    initiatedAt: stocktake.initiatedAt,
    confirmedAt: stocktake.confirmedAt,
    notes: stocktake.notes,
    lines: lines.map((l) => ({
      id: l.id,
      productId: l.productId,
      productName: l.productName,
      productSku: l.productSku,
      productCategory: l.productCategory,
      productUnit: l.productUnit,
      expectedQuantity: Number(l.expectedQuantity),
      countedQuantity: l.countedQuantity !== null ? Number(l.countedQuantity) : null,
      varianceQuantity: l.varianceQuantity !== null ? Number(l.varianceQuantity) : null,
      varianceValue: l.varianceValue !== null ? Number(l.varianceValue) : null,
      adjustmentPosted: l.adjustmentPosted,
      notes: l.notes,
    })),
  }
}

// ─── getStocktakeHistory ────────────────────────────────────────────────────

export async function getStocktakeHistory(): Promise<StocktakeHistoryItem[]> {
  const session = await getServerSession()
  const { businessId } = session.user

  const rows = await db
    .select({
      id: stocktakes.id,
      status: stocktakes.status,
      initiatedAt: stocktakes.initiatedAt,
      confirmedAt: stocktakes.confirmedAt,
      notes: stocktakes.notes,
      lineCount: sql<number>`COUNT(${stocktakeLines.id})::int`,
      totalVarianceValue: sql<string>`COALESCE(SUM(ABS(${stocktakeLines.varianceValue})), '0')`,
    })
    .from(stocktakes)
    .leftJoin(stocktakeLines, eq(stocktakeLines.stocktakeId, stocktakes.id))
    .where(eq(stocktakes.businessId, businessId))
    .groupBy(stocktakes.id)
    .orderBy(desc(stocktakes.initiatedAt))

  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    initiatedAt: r.initiatedAt,
    confirmedAt: r.confirmedAt,
    notes: r.notes,
    lineCount: r.lineCount,
    totalVarianceValue: Math.round(Number(r.totalVarianceValue) * 100) / 100,
  }))
}
