'use server'

import { and, eq, desc, asc, gte, lte, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  purchaseOrders,
  purchaseOrderLines,
  goodsReceivedNotes,
  grnLines,
  suppliers,
} from '@/db/schema'
import { requireRole } from '@/lib/auth/requireRole'
import { isValidPoNumber } from '@/lib/poNumber'

// ─── Types ───────────────────────────────────────────────────────────────────

export type CreatePoInput = {
  supplierId: string
  orderDate: string
  expectedDate?: string
  currency: 'GHS' | 'USD'
  fxRate?: number
  lines: Array<{
    productId?: string
    description: string
    quantity: number
    unitCost: number
  }>
  notes?: string
  poNumber: string
}

export type UpdatePoInput = {
  expectedDate?: string
  notes?: string
  lines: CreatePoInput['lines']
}

export type PoActionResult =
  | { success: true; poId: string; poNumber: string }
  | { success: false; error: string; fieldErrors?: Record<string, string> }

export type PurchaseOrderWithSupplier = {
  id: string
  poNumber: string
  localPoNumber: string | null
  supplierName: string
  supplierId: string
  orderDate: string
  expectedDate: string | null
  status: string
  currency: string
  subtotal: string | null
  totalAmount: string | null
}

export type PoLineWithReceipt = {
  id: string
  productId: string | null
  description: string | null
  quantity: string
  unitCost: string
  lineTotal: string
  quantityReceived: string
  quantityOutstanding: string
}

export type PoGrnSummary = {
  id: string
  grnNumber: string
  receivedDate: string
  status: string
  totalCost: string | null
}

export type PoWithLinesAndGrns = {
  id: string
  poNumber: string
  localPoNumber: string | null
  supplierId: string
  supplierName: string
  supplierPhone: string | null
  orderDate: string
  expectedDate: string | null
  status: string
  currency: string
  fxRate: string | null
  fxRateLockedAt: Date | null
  subtotal: string | null
  totalAmount: string | null
  notes: string | null
  createdAt: Date
  lines: PoLineWithReceipt[]
  grns: PoGrnSummary[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeLines(lines: CreatePoInput['lines'], currency: 'GHS' | 'USD', fxRate: number) {
  return lines.map((l) => {
    const unitCostGHS = currency === 'USD' ? l.unitCost * fxRate : l.unitCost
    const lineTotal = l.quantity * unitCostGHS
    return {
      productId: l.productId ?? null,
      description: l.description,
      quantity: l.quantity,
      unitCostGHS,
      lineTotal,
    }
  })
}

// ─── Create Purchase Order ────────────────────────────────────────────────────

export async function createPurchaseOrder(input: CreatePoInput): Promise<PoActionResult> {
  const user = await requireRole(['owner', 'manager', 'accountant'])
  const { businessId, id: userId } = user

  // Validate PO number format
  if (!isValidPoNumber(input.poNumber)) {
    return { success: false, error: 'Invalid PO number format.' }
  }

  // Validate lines
  const fieldErrors: Record<string, string> = {}
  if (!input.lines || input.lines.length === 0) {
    return { success: false, error: 'At least one line item is required.' }
  }
  input.lines.forEach((l, i) => {
    if (!l.description?.trim()) {
      fieldErrors[`line_${i}_description`] = 'Description is required.'
    }
    if (!l.quantity || l.quantity <= 0) {
      fieldErrors[`line_${i}_quantity`] = 'Quantity must be greater than 0.'
    }
    if (l.unitCost < 0) {
      fieldErrors[`line_${i}_unitCost`] = 'Unit cost cannot be negative.'
    }
  })

  // Validate FX rate for USD orders
  if (input.currency === 'USD') {
    if (!input.fxRate || input.fxRate <= 0) {
      fieldErrors['fxRate'] = 'Exchange rate is required for USD orders.'
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, error: 'Validation failed.', fieldErrors }
  }

  const fxRate = input.currency === 'USD' ? input.fxRate! : 1
  const fxRateLockedAt = input.currency === 'USD' ? new Date() : null

  // Verify supplier belongs to this business
  const [supplier] = await db
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.businessId, businessId)))
    .limit(1)

  if (!supplier) {
    return { success: false, error: 'Supplier not found.' }
  }

  const computed = computeLines(input.lines, input.currency, fxRate)
  const subtotal = computed.reduce((s, l) => s + l.lineTotal, 0)
  const totalAmount = subtotal

  // Plain db.transaction() — POs post no journal entry
  const poRow = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(purchaseOrders)
      .values({
        businessId,
        poNumber: input.poNumber,
        localPoNumber: input.poNumber,
        supplierId: input.supplierId,
        orderDate: input.orderDate,
        expectedDate: input.expectedDate ?? null,
        status: 'draft',
        currency: input.currency,
        fxRate: input.currency === 'USD' ? fxRate.toFixed(4) : null,
        fxRateLockedAt,
        subtotal: subtotal.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        notes: input.notes ?? null,
        createdBy: userId,
      })
      .returning()

    await tx.insert(purchaseOrderLines).values(
      computed.map((l) => ({
        poId: created.id,
        productId: l.productId,
        description: l.description,
        quantity: l.quantity.toFixed(2),
        unitCost: l.unitCostGHS.toFixed(2),
        lineTotal: l.lineTotal.toFixed(2),
      })),
    )

    return created
  })

  return { success: true, poId: poRow.id, poNumber: input.poNumber }
}

// ─── Update Purchase Order ────────────────────────────────────────────────────

export async function updatePurchaseOrder(
  id: string,
  input: UpdatePoInput,
): Promise<PoActionResult> {
  const user = await requireRole(['owner', 'manager', 'accountant'])
  const { businessId } = user

  const [po] = await db
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.businessId, businessId)))
    .limit(1)

  if (!po) {
    return { success: false, error: 'Purchase order not found.' }
  }

  if (po.status !== 'draft') {
    return {
      success: false,
      error:
        'Purchase orders can only be edited before being sent. To correct a sent PO, cancel it and create a new one.',
    }
  }

  // Validate lines
  const fieldErrors: Record<string, string> = {}
  if (!input.lines || input.lines.length === 0) {
    return { success: false, error: 'At least one line item is required.' }
  }
  input.lines.forEach((l, i) => {
    if (!l.description?.trim()) {
      fieldErrors[`line_${i}_description`] = 'Description is required.'
    }
    if (!l.quantity || l.quantity <= 0) {
      fieldErrors[`line_${i}_quantity`] = 'Quantity must be greater than 0.'
    }
    if (l.unitCost < 0) {
      fieldErrors[`line_${i}_unitCost`] = 'Unit cost cannot be negative.'
    }
  })
  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, error: 'Validation failed.', fieldErrors }
  }

  const fxRate = po.currency === 'USD' ? Number(po.fxRate ?? 1) : 1
  const computed = computeLines(input.lines, po.currency as 'GHS' | 'USD', fxRate)
  const subtotal = computed.reduce((s, l) => s + l.lineTotal, 0)

  await db.transaction(async (tx) => {
    // Replace all lines
    await tx.delete(purchaseOrderLines).where(eq(purchaseOrderLines.poId, id))

    await tx.insert(purchaseOrderLines).values(
      computed.map((l) => ({
        poId: id,
        productId: l.productId,
        description: l.description,
        quantity: l.quantity.toFixed(2),
        unitCost: l.unitCostGHS.toFixed(2),
        lineTotal: l.lineTotal.toFixed(2),
      })),
    )

    await tx
      .update(purchaseOrders)
      .set({
        expectedDate: input.expectedDate ?? po.expectedDate,
        notes: input.notes !== undefined ? input.notes : po.notes,
        subtotal: subtotal.toFixed(2),
        totalAmount: subtotal.toFixed(2),
        updatedAt: new Date(),
      })
      .where(eq(purchaseOrders.id, id))
  })

  return { success: true, poId: id, poNumber: po.poNumber }
}

// ─── Mark PO Sent ─────────────────────────────────────────────────────────────

export async function markPoSent(id: string): Promise<PoActionResult> {
  const user = await requireRole(['owner', 'manager', 'accountant'])
  const { businessId } = user

  const [po] = await db
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.businessId, businessId)))
    .limit(1)

  if (!po) {
    return { success: false, error: 'Purchase order not found.' }
  }

  if (po.status !== 'draft') {
    return { success: false, error: 'PO has already been sent.' }
  }

  await db
    .update(purchaseOrders)
    .set({ status: 'sent', updatedAt: new Date() })
    .where(eq(purchaseOrders.id, id))

  return { success: true, poId: id, poNumber: po.poNumber }
}

// ─── Cancel Purchase Order ────────────────────────────────────────────────────

export async function cancelPurchaseOrder(id: string, reason?: string): Promise<void> {
  const user = await requireRole(['owner', 'manager'])
  const { businessId } = user

  const [po] = await db
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.businessId, businessId)))
    .limit(1)

  if (!po) {
    throw new Error('Purchase order not found.')
  }

  if (po.status === 'partially_received' || po.status === 'received') {
    throw new Error(
      'Cannot cancel a PO that has already had goods received. Create a purchase return from the GRN instead.',
    )
  }

  if (po.status === 'cancelled') {
    throw new Error('PO is already cancelled.')
  }

  const updatedNotes = reason
    ? [po.notes, `Cancelled: ${reason}`].filter(Boolean).join('\n')
    : po.notes

  await db
    .update(purchaseOrders)
    .set({ status: 'cancelled', notes: updatedNotes, updatedAt: new Date() })
    .where(eq(purchaseOrders.id, id))
}

// ─── List Purchase Orders ─────────────────────────────────────────────────────

export type ListPoFilters = {
  supplierId?: string
  status?: string
  dateFrom?: string
  dateTo?: string
}

export async function listPurchaseOrders(
  filters?: ListPoFilters,
): Promise<PurchaseOrderWithSupplier[]> {
  const user = await requireRole(['owner', 'manager', 'accountant'])
  const { businessId } = user

  const conditions = [eq(purchaseOrders.businessId, businessId)]

  if (filters?.supplierId) {
    conditions.push(eq(purchaseOrders.supplierId, filters.supplierId))
  }
  if (filters?.status) {
    conditions.push(eq(purchaseOrders.status, filters.status))
  }
  if (filters?.dateFrom) {
    conditions.push(gte(purchaseOrders.orderDate, filters.dateFrom))
  }
  if (filters?.dateTo) {
    conditions.push(lte(purchaseOrders.orderDate, filters.dateTo))
  }

  const rows = await db
    .select({
      id: purchaseOrders.id,
      poNumber: purchaseOrders.poNumber,
      localPoNumber: purchaseOrders.localPoNumber,
      supplierId: purchaseOrders.supplierId,
      supplierName: suppliers.name,
      orderDate: purchaseOrders.orderDate,
      expectedDate: purchaseOrders.expectedDate,
      status: purchaseOrders.status,
      currency: purchaseOrders.currency,
      subtotal: purchaseOrders.subtotal,
      totalAmount: purchaseOrders.totalAmount,
    })
    .from(purchaseOrders)
    .leftJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .where(and(...conditions))
    .orderBy(desc(purchaseOrders.orderDate))

  return rows.map((r) => ({
    ...r,
    supplierName: r.supplierName ?? 'Unknown Supplier',
  }))
}

// ─── Get Purchase Order By ID ─────────────────────────────────────────────────

export async function getPurchaseOrderById(id: string): Promise<PoWithLinesAndGrns> {
  const user = await requireRole(['owner', 'manager', 'accountant'])
  const { businessId } = user

  const [po] = await db
    .select({
      id: purchaseOrders.id,
      poNumber: purchaseOrders.poNumber,
      localPoNumber: purchaseOrders.localPoNumber,
      supplierId: purchaseOrders.supplierId,
      supplierName: suppliers.name,
      supplierPhone: suppliers.phone,
      orderDate: purchaseOrders.orderDate,
      expectedDate: purchaseOrders.expectedDate,
      status: purchaseOrders.status,
      currency: purchaseOrders.currency,
      fxRate: purchaseOrders.fxRate,
      fxRateLockedAt: purchaseOrders.fxRateLockedAt,
      subtotal: purchaseOrders.subtotal,
      totalAmount: purchaseOrders.totalAmount,
      notes: purchaseOrders.notes,
      createdAt: purchaseOrders.createdAt,
    })
    .from(purchaseOrders)
    .leftJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.businessId, businessId)))
    .limit(1)

  if (!po) {
    throw new Error('Purchase order not found.')
  }

  // Lines with received/outstanding quantities from confirmed GRNs
  const linesWithReceipt = await db
    .select({
      id: purchaseOrderLines.id,
      productId: purchaseOrderLines.productId,
      description: purchaseOrderLines.description,
      quantity: purchaseOrderLines.quantity,
      unitCost: purchaseOrderLines.unitCost,
      lineTotal: purchaseOrderLines.lineTotal,
      quantityReceived: sql<string>`COALESCE(SUM(CASE WHEN ${goodsReceivedNotes.status} = 'confirmed' THEN ${grnLines.quantityReceived}::numeric ELSE 0 END), 0)`,
    })
    .from(purchaseOrderLines)
    .leftJoin(grnLines, eq(grnLines.poLineId, purchaseOrderLines.id))
    .leftJoin(goodsReceivedNotes, eq(goodsReceivedNotes.id, grnLines.grnId))
    .where(eq(purchaseOrderLines.poId, id))
    .groupBy(
      purchaseOrderLines.id,
      purchaseOrderLines.productId,
      purchaseOrderLines.description,
      purchaseOrderLines.quantity,
      purchaseOrderLines.unitCost,
      purchaseOrderLines.lineTotal,
    )
    .orderBy(asc(purchaseOrderLines.createdAt))

  const lines: PoLineWithReceipt[] = linesWithReceipt.map((l) => {
    const ordered = Number(l.quantity)
    const received = Number(l.quantityReceived)
    const outstanding = Math.max(0, ordered - received)
    return {
      id: l.id,
      productId: l.productId,
      description: l.description,
      quantity: l.quantity,
      unitCost: l.unitCost,
      lineTotal: l.lineTotal,
      quantityReceived: received.toFixed(2),
      quantityOutstanding: outstanding.toFixed(2),
    }
  })

  // GRNs linked to this PO
  const grnRows = await db
    .select({
      id: goodsReceivedNotes.id,
      grnNumber: goodsReceivedNotes.grnNumber,
      receivedDate: goodsReceivedNotes.receivedDate,
      status: goodsReceivedNotes.status,
      totalCost: goodsReceivedNotes.totalCost,
    })
    .from(goodsReceivedNotes)
    .where(and(eq(goodsReceivedNotes.poId, id), eq(goodsReceivedNotes.businessId, businessId)))
    .orderBy(asc(goodsReceivedNotes.receivedDate))

  return {
    id: po.id,
    poNumber: po.poNumber,
    localPoNumber: po.localPoNumber,
    supplierId: po.supplierId,
    supplierName: po.supplierName ?? 'Unknown Supplier',
    supplierPhone: po.supplierPhone ?? null,
    orderDate: po.orderDate,
    expectedDate: po.expectedDate,
    status: po.status,
    currency: po.currency,
    fxRate: po.fxRate,
    fxRateLockedAt: po.fxRateLockedAt,
    subtotal: po.subtotal,
    totalAmount: po.totalAmount,
    notes: po.notes,
    createdAt: po.createdAt,
    lines,
    grns: grnRows,
  }
}
