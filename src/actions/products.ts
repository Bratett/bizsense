'use server'

import { and, eq, desc, ilike, or, sql, isNotNull } from 'drizzle-orm'
import { db } from '@/db'
import { products, inventoryTransactions, orderLines, orders } from '@/db/schema'
import { getServerSession } from '@/lib/session'
import { requireRole } from '@/lib/auth/requireRole'
import { generateSku } from '@/lib/inventory/generateSku'

// ─── Types ───────────────────────────────────────────────────────────────────

export type CreateProductInput = {
  name: string
  sku?: string
  description?: string
  category?: string
  unit?: string
  costPrice: number
  sellingPrice: number
  sellingPriceUsd?: number
  trackInventory?: boolean
  reorderLevel?: number
}

export type UpdateProductInput = {
  name?: string
  description?: string
  category?: string
  unit?: string
  costPrice?: number
  sellingPrice?: number
  sellingPriceUsd?: number
  trackInventory?: boolean
  reorderLevel?: number
  // SKU is intentionally excluded — immutable after creation
}

export type ProductActionResult =
  | { success: true; productId: string }
  | { success: false; error: string; fieldErrors?: Record<string, string> }

export type DeactivateResult = { success: true } | { success: false; error: string }

export type ProductListItem = {
  id: string
  sku: string | null
  name: string
  description: string | null
  category: string | null
  unit: string | null
  costPrice: string | null
  sellingPrice: string | null
  sellingPriceUsd: string | null
  trackInventory: boolean
  reorderLevel: number
  isActive: boolean
  imageUrl: string | null
  currentStock: number
  stockValue: number
  isLowStock: boolean
}

export type InventoryMovement = {
  id: string
  transactionType: string
  quantity: string
  unitCost: string
  transactionDate: string
  notes: string | null
  referenceId: string | null
  createdAt: Date
}

export type ProductDetail = {
  id: string
  businessId: string
  sku: string | null
  name: string
  description: string | null
  category: string | null
  unit: string | null
  costPrice: string | null
  sellingPrice: string | null
  sellingPriceUsd: string | null
  trackInventory: boolean
  reorderLevel: number
  isActive: boolean
  imageUrl: string | null
  createdAt: Date
  updatedAt: Date
  currentStock: number
  stockValue: number
  isLowStock: boolean
  movements: InventoryMovement[]
}

// ─── Stock Subquery ─────────────────────────────────────────────────────────

/**
 * Correlated subquery that computes current stock for a product.
 * Used in listProducts and getProductById to avoid N+1 queries.
 */
const currentStockSubquery = sql<number>`
  COALESCE((
    SELECT SUM(CAST("inventory_transactions"."quantity" AS numeric))
    FROM "inventory_transactions"
    WHERE "inventory_transactions"."product_id" = "products"."id"
      AND "inventory_transactions"."business_id" = "products"."business_id"
  ), 0)
`.mapWith(Number)

// ─── Create Product ─────────────────────────────────────────────────────────

export async function createProduct(input: CreateProductInput): Promise<ProductActionResult> {
  const user = await requireRole(['owner', 'manager', 'accountant'])
  const { businessId } = user

  // Validation
  const fieldErrors: Record<string, string> = {}

  if (!input.name?.trim() || input.name.trim().length < 2) {
    fieldErrors.name = 'Product name must be at least 2 characters'
  }
  if (input.costPrice == null || input.costPrice < 0) {
    fieldErrors.costPrice = 'Cost price must be 0 or greater'
  }
  if (input.sellingPrice == null || input.sellingPrice <= 0) {
    fieldErrors.sellingPrice = 'Selling price must be greater than 0'
  }
  if (
    input.sellingPriceUsd !== undefined &&
    input.sellingPriceUsd !== null &&
    input.sellingPriceUsd < 0
  ) {
    fieldErrors.sellingPriceUsd = 'USD selling price cannot be negative'
  }
  if (input.reorderLevel !== undefined && input.reorderLevel < 0) {
    fieldErrors.reorderLevel = 'Reorder level cannot be negative'
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, error: 'Validation failed', fieldErrors }
  }

  // SKU handling
  let sku: string
  if (input.sku?.trim()) {
    sku = input.sku.trim()
    // Check uniqueness within this business
    const existing = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.businessId, businessId), eq(products.sku, sku)))
      .limit(1)

    if (existing.length > 0) {
      return {
        success: false,
        error: 'SKU already exists',
        fieldErrors: { sku: 'This SKU is already in use' },
      }
    }
  } else {
    // Auto-generate SKU
    const existingSkus = await db
      .select({ sku: products.sku })
      .from(products)
      .where(and(eq(products.businessId, businessId), isNotNull(products.sku)))

    sku = generateSku(
      input.name.trim(),
      existingSkus.map((r) => r.sku!),
    )
  }

  const [created] = await db
    .insert(products)
    .values({
      businessId,
      sku,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      category: input.category?.trim() || null,
      unit: input.unit?.trim() || null,
      costPrice: String(input.costPrice),
      sellingPrice: String(input.sellingPrice),
      sellingPriceUsd: input.sellingPriceUsd != null ? String(input.sellingPriceUsd) : null,
      trackInventory: input.trackInventory ?? true,
      reorderLevel: input.reorderLevel ?? 0,
    })
    .returning({ id: products.id })

  return { success: true, productId: created.id }
}

// ─── Update Product ─────────────────────────────────────────────────────────

export async function updateProduct(
  id: string,
  input: UpdateProductInput,
): Promise<ProductActionResult> {
  const user = await requireRole(['owner', 'manager', 'accountant'])
  const { businessId } = user

  // Verify product belongs to this business
  const [existing] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, id), eq(products.businessId, businessId)))
    .limit(1)

  if (!existing) {
    return { success: false, error: 'Product not found' }
  }

  // Validation
  const fieldErrors: Record<string, string> = {}

  if (input.name !== undefined && (!input.name.trim() || input.name.trim().length < 2)) {
    fieldErrors.name = 'Product name must be at least 2 characters'
  }
  if (input.costPrice !== undefined && input.costPrice < 0) {
    fieldErrors.costPrice = 'Cost price must be 0 or greater'
  }
  if (input.sellingPrice !== undefined && input.sellingPrice <= 0) {
    fieldErrors.sellingPrice = 'Selling price must be greater than 0'
  }
  if (input.reorderLevel !== undefined && input.reorderLevel < 0) {
    fieldErrors.reorderLevel = 'Reorder level cannot be negative'
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, error: 'Validation failed', fieldErrors }
  }

  // Build update payload — costPrice on product is a default for new purchases;
  // historical FIFO layers in inventory_transactions are immutable.
  const updateData: Record<string, unknown> = { updatedAt: new Date() }
  if (input.name !== undefined) updateData.name = input.name.trim()
  if (input.description !== undefined) updateData.description = input.description?.trim() || null
  if (input.category !== undefined) updateData.category = input.category?.trim() || null
  if (input.unit !== undefined) updateData.unit = input.unit?.trim() || null
  if (input.costPrice !== undefined) updateData.costPrice = String(input.costPrice)
  if (input.sellingPrice !== undefined) updateData.sellingPrice = String(input.sellingPrice)
  if (input.sellingPriceUsd !== undefined)
    updateData.sellingPriceUsd =
      input.sellingPriceUsd != null ? String(input.sellingPriceUsd) : null
  if (input.trackInventory !== undefined) updateData.trackInventory = input.trackInventory
  if (input.reorderLevel !== undefined) updateData.reorderLevel = input.reorderLevel

  await db
    .update(products)
    .set(updateData)
    .where(and(eq(products.id, id), eq(products.businessId, businessId)))

  return { success: true, productId: id }
}

// ─── Deactivate Product ─────────────────────────────────────────────────────

export async function deactivateProduct(id: string): Promise<DeactivateResult> {
  const user = await requireRole(['owner', 'manager'])
  const { businessId } = user

  // Verify product belongs to this business
  const [existing] = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(
      and(eq(products.id, id), eq(products.businessId, businessId), eq(products.isActive, true)),
    )
    .limit(1)

  if (!existing) {
    return { success: false, error: 'Product not found or already deactivated' }
  }

  // Check current stock — block if > 0
  const [stockRow] = await db
    .select({
      total:
        sql<number>`COALESCE(SUM(CAST(${inventoryTransactions.quantity} AS numeric)), 0)`.mapWith(
          Number,
        ),
    })
    .from(inventoryTransactions)
    .where(
      and(
        eq(inventoryTransactions.productId, id),
        eq(inventoryTransactions.businessId, businessId),
      ),
    )

  const currentStock = stockRow?.total ?? 0
  if (currentStock > 0) {
    return {
      success: false,
      error: `This product has ${currentStock} units in stock. Deplete or adjust stock to zero before deactivating.`,
    }
  }

  // Check open orders that reference this product
  const openOrderLines = await db
    .select({ id: orderLines.id })
    .from(orderLines)
    .innerJoin(orders, eq(orders.id, orderLines.orderId))
    .where(
      and(
        eq(orderLines.productId, id),
        eq(orders.businessId, businessId),
        or(eq(orders.status, 'draft'), eq(orders.status, 'confirmed')),
      ),
    )
    .limit(1)

  if (openOrderLines.length > 0) {
    return {
      success: false,
      error:
        'This product appears on open orders. Fulfil or cancel those orders before deactivating.',
    }
  }

  await db
    .update(products)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(products.id, id), eq(products.businessId, businessId)))

  return { success: true }
}

// ─── List Products ──────────────────────────────────────────────────────────

type ProductListFilters = {
  search?: string
  stockFilter?: 'all' | 'low_stock' | 'out_of_stock'
  category?: string
  isActive?: boolean
}

export async function listProducts(filters?: ProductListFilters): Promise<ProductListItem[]> {
  const session = await getServerSession()
  const { businessId } = session.user

  const conditions = [eq(products.businessId, businessId)]

  // Default to active products
  const activeFilter = filters?.isActive ?? true
  conditions.push(eq(products.isActive, activeFilter))

  if (filters?.search) {
    const term = `%${filters.search}%`
    conditions.push(or(ilike(products.name, term), ilike(products.sku, term))!)
  }

  if (filters?.category) {
    conditions.push(eq(products.category, filters.category))
  }

  const rows = await db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      description: products.description,
      category: products.category,
      unit: products.unit,
      costPrice: products.costPrice,
      sellingPrice: products.sellingPrice,
      sellingPriceUsd: products.sellingPriceUsd,
      trackInventory: products.trackInventory,
      reorderLevel: products.reorderLevel,
      isActive: products.isActive,
      imageUrl: products.imageUrl,
      currentStock: currentStockSubquery,
    })
    .from(products)
    .where(and(...conditions))
    .orderBy(products.name)

  let result: ProductListItem[] = rows.map((r) => {
    const stock = r.currentStock ?? 0
    const costPriceNum = Number(r.costPrice ?? 0)
    // Simplified stock value: currentStock × costPrice.
    // FIFO-precise value is computed in the Valuation Report (Task 5.4).
    const stockValue = Math.round(stock * costPriceNum * 100) / 100
    const isLowStock =
      r.trackInventory && r.reorderLevel > 0 && stock > 0 && stock <= r.reorderLevel

    return { ...r, currentStock: stock, stockValue, isLowStock }
  })

  // Apply stock filter client-side after the query since it depends on computed currentStock
  if (filters?.stockFilter === 'low_stock') {
    result = result.filter(
      (p) =>
        p.trackInventory &&
        p.reorderLevel > 0 &&
        p.currentStock > 0 &&
        p.currentStock <= p.reorderLevel,
    )
  } else if (filters?.stockFilter === 'out_of_stock') {
    result = result.filter((p) => p.trackInventory && p.currentStock <= 0)
  }

  return result
}

// ─── Get Product by ID ──────────────────────────────────────────────────────

export async function getProductById(id: string): Promise<ProductDetail | null> {
  const session = await getServerSession()
  const { businessId } = session.user

  const [row] = await db
    .select({
      id: products.id,
      businessId: products.businessId,
      sku: products.sku,
      name: products.name,
      description: products.description,
      category: products.category,
      unit: products.unit,
      costPrice: products.costPrice,
      sellingPrice: products.sellingPrice,
      sellingPriceUsd: products.sellingPriceUsd,
      trackInventory: products.trackInventory,
      reorderLevel: products.reorderLevel,
      isActive: products.isActive,
      imageUrl: products.imageUrl,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
      currentStock: currentStockSubquery,
    })
    .from(products)
    .where(and(eq(products.id, id), eq(products.businessId, businessId)))
    .limit(1)

  if (!row) return null

  const stock = row.currentStock ?? 0
  const costPriceNum = Number(row.costPrice ?? 0)
  // Simplified stock value: currentStock × costPrice.
  // FIFO-precise value is computed in the Valuation Report (Task 5.4).
  const stockValue = Math.round(stock * costPriceNum * 100) / 100
  const isLowStock =
    row.trackInventory && row.reorderLevel > 0 && stock > 0 && stock <= row.reorderLevel

  // Fetch last 50 movements
  const movements = await db
    .select({
      id: inventoryTransactions.id,
      transactionType: inventoryTransactions.transactionType,
      quantity: inventoryTransactions.quantity,
      unitCost: inventoryTransactions.unitCost,
      transactionDate: inventoryTransactions.transactionDate,
      notes: inventoryTransactions.notes,
      referenceId: inventoryTransactions.referenceId,
      createdAt: inventoryTransactions.createdAt,
    })
    .from(inventoryTransactions)
    .where(
      and(
        eq(inventoryTransactions.productId, id),
        eq(inventoryTransactions.businessId, businessId),
      ),
    )
    .orderBy(desc(inventoryTransactions.transactionDate), desc(inventoryTransactions.createdAt))
    .limit(50)

  return {
    ...row,
    currentStock: stock,
    stockValue,
    isLowStock,
    movements,
  }
}

// ─── List Distinct Categories ───────────────────────────────────────────────

export async function listDistinctCategories(): Promise<string[]> {
  const session = await getServerSession()
  const { businessId } = session.user

  const rows = await db
    .selectDistinct({ category: products.category })
    .from(products)
    .where(and(eq(products.businessId, businessId), isNotNull(products.category)))
    .orderBy(products.category)

  return rows.map((r) => r.category!).filter(Boolean)
}
