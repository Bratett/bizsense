'use server'

import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  accounts,
  goodsReceivedNotes,
  grnLines,
  inventoryTransactions,
  journalLines,
  products,
  purchaseOrderLines,
  purchaseOrders,
  suppliers,
} from '@/db/schema'
import { requireRole } from '@/lib/auth/requireRole'
import { atomicTransactionWrite } from '@/lib/atomic'
import { computeFifoCogs } from '@/lib/inventory/fifo'
import { getProductTransactions } from '@/lib/inventory/queries'
import { isValidGrnNumber } from '@/lib/grnNumber'

// ─── Account codes ────────────────────────────────────────────────────────────

const INVENTORY_ACCOUNT_CODE = '1200'
const AP_ACCOUNT_CODE = '2001'

const PAYMENT_ACCOUNT_CODES: Record<string, string> = {
  cash: '1001',
  momo_mtn: '1002',
  momo_telecel: '1003',
  momo_airtel: '1004',
  bank: '1005',
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type CreateGrnInput = {
  supplierId: string
  poId?: string
  receivedDate: string // ISO date 'YYYY-MM-DD'
  lines: Array<{
    productId: string
    poLineId?: string
    quantityOrdered?: number // display only — not stored
    quantityReceived: number // > 0
    unitCost: number // GHS
  }>
  notes?: string
  grnNumber: string // client-generated (isValidGrnNumber() enforced)
}

export type ConfirmGrnInput = {
  grnId: string
  paymentMethod?: string // if set: cash purchase; AP leg replaced by this account
  momoReference?: string
}

export type ReverseGrnInput = {
  grnId: string
  reason: string
  lines: Array<{
    grnLineId: string
    quantityReturning: number // <= quantityReceived on original line
  }>
}

export type GrnActionResult =
  | { success: true; grnId: string; grnNumber: string }
  | { success: false; error: string; fieldErrors?: Record<string, string> }

export type GrnWithSupplier = {
  id: string
  grnNumber: string
  supplierId: string
  supplierName: string
  poId: string | null
  receivedDate: string
  status: string
  totalCost: string | null
  createdAt: Date
}

export type GrnLineWithProduct = {
  id: string
  grnId: string
  poLineId: string | null
  productId: string
  productName: string
  quantityOrdered: string | null
  quantityReceived: string
  unitCost: string
  lineTotal: string
}

export type GrnJournalSummary = {
  entryDate: string
  reference: string | null
  description: string | null
  sourceType: string
}

export type GrnWithLinesAndJournal = {
  id: string
  grnNumber: string
  supplierId: string
  supplierName: string
  poId: string | null
  poNumber: string | null
  receivedDate: string
  status: string
  totalCost: string | null
  notes: string | null
  journalEntryId: string | null
  journalSummary: GrnJournalSummary | null
  lines: GrnLineWithProduct[]
}

// ─── Create GRN (Draft) ───────────────────────────────────────────────────────

/**
 * Creates a draft GRN with lines. No journal entry, no inventory impact.
 * Journal entry and inventory_transactions are created only on confirmGrn().
 */
export async function createGrn(input: CreateGrnInput): Promise<GrnActionResult> {
  const user = await requireRole(['owner', 'manager', 'accountant'])
  const { businessId, id: userId } = user

  // ── Validate inputs ──────────────────────────────────────────────────────
  if (!isValidGrnNumber(input.grnNumber)) {
    return { success: false, error: 'Invalid GRN number format.' }
  }

  if (!input.lines || input.lines.length === 0) {
    return { success: false, error: 'At least one line item is required.' }
  }

  const fieldErrors: Record<string, string> = {}
  input.lines.forEach((l, i) => {
    if (!l.productId) {
      fieldErrors[`line_${i}_productId`] = 'Product is required.'
    }
    if (!l.quantityReceived || l.quantityReceived <= 0) {
      fieldErrors[`line_${i}_quantityReceived`] = 'Quantity received must be greater than 0.'
    }
    if (l.unitCost < 0) {
      fieldErrors[`line_${i}_unitCost`] = 'Unit cost cannot be negative.'
    }
  })
  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, error: 'Please fix the errors below.', fieldErrors }
  }

  if (!input.receivedDate) {
    return { success: false, error: 'Received date is required.' }
  }

  // ── Verify supplier belongs to this business ──────────────────────────────
  const [supplier] = await db
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers)
    .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.businessId, businessId)))
    .limit(1)

  if (!supplier) {
    return { success: false, error: 'Supplier not found.' }
  }

  // ── Verify PO if provided ─────────────────────────────────────────────────
  if (input.poId) {
    const [po] = await db
      .select({ id: purchaseOrders.id, status: purchaseOrders.status })
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.id, input.poId), eq(purchaseOrders.businessId, businessId)))
      .limit(1)

    if (!po) {
      return { success: false, error: 'Purchase order not found.' }
    }
    if (po.status === 'cancelled') {
      return { success: false, error: 'Cannot receive goods against a cancelled purchase order.' }
    }

    // ── Validate outstanding quantities per PO line ───────────────────────
    for (const line of input.lines) {
      if (!line.poLineId) continue

      const [poLine] = await db
        .select({
          id: purchaseOrderLines.id,
          quantity: purchaseOrderLines.quantity,
          productId: purchaseOrderLines.productId,
        })
        .from(purchaseOrderLines)
        .where(
          and(eq(purchaseOrderLines.id, line.poLineId), eq(purchaseOrderLines.poId, input.poId)),
        )
        .limit(1)

      if (!poLine) {
        return { success: false, error: `PO line not found for line item.` }
      }

      // Sum already received from confirmed GRNs for this PO line
      const [{ alreadyReceived }] = await db
        .select({
          alreadyReceived:
            sql<string>`COALESCE(SUM(CASE WHEN ${goodsReceivedNotes.status} = 'confirmed' THEN ${grnLines.quantityReceived}::numeric ELSE 0 END), 0)`,
        })
        .from(grnLines)
        .leftJoin(goodsReceivedNotes, eq(goodsReceivedNotes.id, grnLines.grnId))
        .where(eq(grnLines.poLineId, line.poLineId))

      const outstanding = Number(poLine.quantity) - Number(alreadyReceived)
      if (line.quantityReceived > outstanding + 0.001) {
        // Look up product name for a clear error message
        const [prod] = await db
          .select({ name: products.name })
          .from(products)
          .where(eq(products.id, line.productId))
          .limit(1)
        const productName = prod?.name ?? 'product'
        return {
          success: false,
          error: `Cannot receive ${line.quantityReceived} units of ${productName} — PO has only ${Math.max(0, outstanding).toFixed(2)} units outstanding.`,
        }
      }
    }
  }

  // ── Compute totalCost ─────────────────────────────────────────────────────
  const totalCost =
    Math.round(input.lines.reduce((s, l) => s + l.quantityReceived * l.unitCost, 0) * 100) / 100

  // ── Insert draft GRN + lines (no journal entry) ───────────────────────────
  const result = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(goodsReceivedNotes)
      .values({
        businessId,
        grnNumber: input.grnNumber,
        poId: input.poId ?? null,
        supplierId: input.supplierId,
        receivedDate: input.receivedDate,
        status: 'draft',
        totalCost: totalCost.toFixed(2),
        journalEntryId: null,
        notes: input.notes?.trim() ?? null,
        createdBy: userId,
      })
      .returning({ id: goodsReceivedNotes.id })

    await tx.insert(grnLines).values(
      input.lines.map((l) => ({
        grnId: created.id,
        poLineId: l.poLineId ?? null,
        productId: l.productId,
        quantityOrdered: l.quantityOrdered != null ? l.quantityOrdered.toFixed(2) : null,
        quantityReceived: l.quantityReceived.toFixed(2),
        unitCost: l.unitCost.toFixed(2),
        lineTotal: (Math.round(l.quantityReceived * l.unitCost * 100) / 100).toFixed(2),
      })),
    )

    return created.id
  })

  return { success: true, grnId: result, grnNumber: input.grnNumber }
}

// ─── Confirm GRN ─────────────────────────────────────────────────────────────

/**
 * Confirms a draft GRN. This is the accounting event that:
 *   1. Posts a balanced journal entry (Dr Inventory / Cr AP or cash account)
 *   2. Inserts inventory_transactions (type='purchase') for each line
 *   3. Updates PO status if a PO is linked
 *
 * Journal entry:
 *   Dr 1200 Inventory           totalCost
 *   Cr 2001 Accounts Payable    totalCost   (credit purchase)
 *   — OR —
 *   Cr [payment account]        totalCost   (cash purchase when paymentMethod set)
 */
export async function confirmGrn(input: ConfirmGrnInput): Promise<GrnActionResult> {
  const user = await requireRole(['owner', 'manager'])
  const { businessId, id: userId } = user

  // ── Fetch GRN ─────────────────────────────────────────────────────────────
  const [grn] = await db
    .select({
      id: goodsReceivedNotes.id,
      grnNumber: goodsReceivedNotes.grnNumber,
      poId: goodsReceivedNotes.poId,
      supplierId: goodsReceivedNotes.supplierId,
      receivedDate: goodsReceivedNotes.receivedDate,
      status: goodsReceivedNotes.status,
    })
    .from(goodsReceivedNotes)
    .where(
      and(eq(goodsReceivedNotes.id, input.grnId), eq(goodsReceivedNotes.businessId, businessId)),
    )
    .limit(1)

  if (!grn) {
    return { success: false, error: 'GRN not found.' }
  }
  if (grn.status !== 'draft') {
    return { success: false, error: 'Only draft GRNs can be confirmed.' }
  }

  // ── Fetch lines ───────────────────────────────────────────────────────────
  const lines = await db
    .select({
      id: grnLines.id,
      productId: grnLines.productId,
      quantityReceived: grnLines.quantityReceived,
      unitCost: grnLines.unitCost,
    })
    .from(grnLines)
    .where(eq(grnLines.grnId, input.grnId))

  if (lines.length === 0) {
    return { success: false, error: 'GRN has no lines.' }
  }

  // ── Compute totalCost ─────────────────────────────────────────────────────
  const totalCost =
    Math.round(
      lines.reduce((s, l) => s + Number(l.quantityReceived) * Number(l.unitCost), 0) * 100,
    ) / 100

  // ── Resolve GL accounts ───────────────────────────────────────────────────
  const creditCode = input.paymentMethod
    ? (PAYMENT_ACCOUNT_CODES[input.paymentMethod] ?? null)
    : AP_ACCOUNT_CODE

  if (!creditCode) {
    return { success: false, error: `Unknown payment method: ${input.paymentMethod}` }
  }

  const accountRows = await db
    .select({ id: accounts.id, code: accounts.code })
    .from(accounts)
    .where(
      and(
        eq(accounts.businessId, businessId),
        inArray(accounts.code, [INVENTORY_ACCOUNT_CODE, creditCode]),
      ),
    )

  const accountMap = Object.fromEntries(accountRows.map((a) => [a.code, a.id]))
  const inventoryAccountId = accountMap[INVENTORY_ACCOUNT_CODE]
  const creditAccountId = accountMap[creditCode]

  if (!inventoryAccountId || !creditAccountId) {
    const missing = [
      !inventoryAccountId && INVENTORY_ACCOUNT_CODE,
      !creditAccountId && creditCode,
    ]
      .filter(Boolean)
      .join(', ')
    return {
      success: false,
      error: `Required accounts (${missing}) not found. Please complete business setup.`,
    }
  }

  // ── Atomic write: journal + inventory_transactions + GRN status update ─────
  await atomicTransactionWrite(
    {
      businessId,
      entryDate: grn.receivedDate,
      reference: grn.grnNumber,
      description: `Goods received — ${grn.grnNumber}`,
      sourceType: 'grn',
      sourceId: grn.id,
      createdBy: userId,
      lines: [
        {
          accountId: inventoryAccountId,
          debitAmount: totalCost,
          creditAmount: 0,
          memo: `Inventory — ${grn.grnNumber}`,
        },
        {
          accountId: creditAccountId,
          debitAmount: 0,
          creditAmount: totalCost,
          memo: input.paymentMethod
            ? `Cash payment — ${grn.grnNumber}`
            : `Accounts payable — ${grn.grnNumber}`,
        },
      ],
    },
    async (tx, journalEntryId) => {
      // 1. Confirm GRN
      await tx
        .update(goodsReceivedNotes)
        .set({
          status: 'confirmed',
          journalEntryId,
          totalCost: totalCost.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(goodsReceivedNotes.id, input.grnId))

      // 2. Insert inventory_transactions — one per line
      for (const line of lines) {
        await tx.insert(inventoryTransactions).values({
          businessId,
          productId: line.productId,
          transactionType: 'purchase',
          quantity: Number(line.quantityReceived).toFixed(2),
          unitCost: Number(line.unitCost).toFixed(2),
          referenceId: grn.id,
          journalEntryId,
          transactionDate: grn.receivedDate,
          notes: `GRN — ${grn.grnNumber}`,
        })
      }

      // 3. Update PO status if linked
      if (grn.poId) {
        await updatePoStatusAfterGrn(tx, grn.poId)
      }

      return grn.id
    },
  )

  return { success: true, grnId: grn.id, grnNumber: grn.grnNumber }
}

// ─── Reverse GRN (Purchase Return) ───────────────────────────────────────────

/**
 * Reverses a confirmed GRN (purchase return). Posts an equal and opposite
 * journal entry using FIFO cost for the inventory reduction. The original GRN
 * and its journal entry are NOT modified — this is append-only.
 *
 * Reversal journal entry:
 *   Dr [AP or payment account]   returnAmount   (mirrors original credit)
 *   Cr 1200 Inventory            returnAmount   (FIFO cost of returned units)
 */
export async function reverseGrn(input: ReverseGrnInput): Promise<GrnActionResult> {
  const user = await requireRole(['owner', 'manager'])
  const { businessId, id: userId } = user

  if (!input.reason?.trim()) {
    return { success: false, error: 'Reason is required for a purchase return.' }
  }
  if (!input.lines || input.lines.length === 0) {
    return { success: false, error: 'At least one return line is required.' }
  }

  // ── Fetch original GRN ────────────────────────────────────────────────────
  const [grn] = await db
    .select({
      id: goodsReceivedNotes.id,
      grnNumber: goodsReceivedNotes.grnNumber,
      poId: goodsReceivedNotes.poId,
      receivedDate: goodsReceivedNotes.receivedDate,
      status: goodsReceivedNotes.status,
      journalEntryId: goodsReceivedNotes.journalEntryId,
    })
    .from(goodsReceivedNotes)
    .where(
      and(eq(goodsReceivedNotes.id, input.grnId), eq(goodsReceivedNotes.businessId, businessId)),
    )
    .limit(1)

  if (!grn) {
    return { success: false, error: 'GRN not found.' }
  }
  if (grn.status !== 'confirmed') {
    return { success: false, error: 'Only confirmed GRNs can be reversed.' }
  }
  if (!grn.journalEntryId) {
    return { success: false, error: 'GRN has no linked journal entry — cannot reverse.' }
  }

  // ── Fetch original GRN lines for validation ───────────────────────────────
  const originalLines = await db
    .select({
      id: grnLines.id,
      productId: grnLines.productId,
      quantityReceived: grnLines.quantityReceived,
    })
    .from(grnLines)
    .where(eq(grnLines.grnId, input.grnId))

  const originalLineMap = Object.fromEntries(originalLines.map((l) => [l.id, l]))

  // ── Validate quantities ───────────────────────────────────────────────────
  for (const returning of input.lines) {
    const orig = originalLineMap[returning.grnLineId]
    if (!orig) {
      return { success: false, error: `GRN line not found: ${returning.grnLineId}` }
    }
    if (returning.quantityReturning <= 0) {
      return { success: false, error: 'Return quantity must be greater than 0.' }
    }
    if (returning.quantityReturning > Number(orig.quantityReceived) + 0.001) {
      return {
        success: false,
        error: `Cannot return ${returning.quantityReturning} units — only ${orig.quantityReceived} were received on this line.`,
      }
    }
  }

  // ── Find original debit account (to debit on reversal) ───────────────────
  // The original credit line (creditAmount > 0) that is NOT the inventory account
  // is what we need to debit in the reversal.
  const inventoryAccountRows = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(eq(accounts.businessId, businessId), eq(accounts.code, INVENTORY_ACCOUNT_CODE)),
    )
    .limit(1)

  const inventoryAccountId = inventoryAccountRows[0]?.id
  if (!inventoryAccountId) {
    return {
      success: false,
      error: 'Inventory account (1200) not found. Please complete business setup.',
    }
  }

  const originalCreditLines = await db
    .select({ accountId: journalLines.accountId, creditAmount: journalLines.creditAmount })
    .from(journalLines)
    .where(
      and(
        eq(journalLines.journalEntryId, grn.journalEntryId),
        sql`${journalLines.creditAmount} > 0`,
        sql`${journalLines.accountId} != ${inventoryAccountId}`,
      ),
    )
    .limit(1)

  if (originalCreditLines.length === 0) {
    return {
      success: false,
      error: 'Cannot determine original credit account for reversal.',
    }
  }

  const debitAccountId = originalCreditLines[0].accountId

  // ── Compute FIFO return amounts per line ──────────────────────────────────
  type ReturningLineWithCost = {
    grnLineId: string
    productId: string
    quantityReturning: number
    fifoReturnCost: number
  }

  const returningLinesWithCost: ReturningLineWithCost[] = []

  for (const returning of input.lines) {
    const orig = originalLineMap[returning.grnLineId]
    const transactions = await getProductTransactions(orig.productId, businessId)
    const fifoResult = computeFifoCogs(transactions, returning.quantityReturning)
    returningLinesWithCost.push({
      grnLineId: returning.grnLineId,
      productId: orig.productId,
      quantityReturning: returning.quantityReturning,
      fifoReturnCost: fifoResult.cogsTotal,
    })
  }

  const returnAmount =
    Math.round(returningLinesWithCost.reduce((s, l) => s + l.fifoReturnCost, 0) * 100) / 100

  if (returnAmount <= 0) {
    return { success: false, error: 'Return amount computed to zero — check FIFO layers.' }
  }

  // ── Atomic write: reversal journal + return_out inventory_transactions ────
  await atomicTransactionWrite(
    {
      businessId,
      entryDate: new Date().toISOString().split('T')[0],
      reference: 'REV-' + grn.grnNumber,
      description: `Purchase return: ${grn.grnNumber} | ${input.reason.trim()}`,
      sourceType: 'reversal',
      sourceId: grn.id,
      reversalOf: grn.journalEntryId,
      createdBy: userId,
      lines: [
        {
          accountId: debitAccountId,
          debitAmount: returnAmount,
          creditAmount: 0,
          memo: `Purchase return — ${grn.grnNumber}`,
        },
        {
          accountId: inventoryAccountId,
          debitAmount: 0,
          creditAmount: returnAmount,
          memo: `Inventory return — ${grn.grnNumber}`,
        },
      ],
    },
    async (tx, reversalEntryId) => {
      for (const line of returningLinesWithCost) {
        const avgUnitCost =
          line.quantityReturning > 0
            ? Math.round((line.fifoReturnCost / line.quantityReturning) * 100) / 100
            : 0

        await tx.insert(inventoryTransactions).values({
          businessId,
          productId: line.productId,
          transactionType: 'return_out',
          quantity: (-line.quantityReturning).toFixed(2), // negative — stock leaving
          unitCost: avgUnitCost.toFixed(2),
          referenceId: grn.id,
          journalEntryId: reversalEntryId,
          transactionDate: new Date().toISOString().split('T')[0],
          notes: `Purchase return — ${grn.grnNumber}`,
        })
      }

      // If PO was 'received', revert to 'partially_received'
      if (grn.poId) {
        const [po] = await tx
          .select({ status: purchaseOrders.status })
          .from(purchaseOrders)
          .where(eq(purchaseOrders.id, grn.poId))
          .limit(1)

        if (po?.status === 'received') {
          await tx
            .update(purchaseOrders)
            .set({ status: 'partially_received', updatedAt: new Date() })
            .where(eq(purchaseOrders.id, grn.poId))
        }
      }

      return grn.id
    },
  )

  return { success: true, grnId: grn.id, grnNumber: grn.grnNumber }
}

// ─── List GRNs ────────────────────────────────────────────────────────────────

export async function listGrns(
  filters?: {
    supplierId?: string
    poId?: string
    status?: 'draft' | 'confirmed'
    dateFrom?: string
    dateTo?: string
  },
): Promise<GrnWithSupplier[]> {
  const user = await requireRole(['owner', 'manager', 'accountant', 'cashier'])
  const { businessId } = user

  const conditions = [eq(goodsReceivedNotes.businessId, businessId)]

  if (filters?.supplierId) {
    conditions.push(eq(goodsReceivedNotes.supplierId, filters.supplierId))
  }
  if (filters?.poId) {
    conditions.push(eq(goodsReceivedNotes.poId, filters.poId))
  }
  if (filters?.status) {
    conditions.push(eq(goodsReceivedNotes.status, filters.status))
  }
  if (filters?.dateFrom) {
    conditions.push(gte(goodsReceivedNotes.receivedDate, filters.dateFrom))
  }
  if (filters?.dateTo) {
    conditions.push(lte(goodsReceivedNotes.receivedDate, filters.dateTo))
  }

  const rows = await db
    .select({
      id: goodsReceivedNotes.id,
      grnNumber: goodsReceivedNotes.grnNumber,
      supplierId: goodsReceivedNotes.supplierId,
      supplierName: suppliers.name,
      poId: goodsReceivedNotes.poId,
      receivedDate: goodsReceivedNotes.receivedDate,
      status: goodsReceivedNotes.status,
      totalCost: goodsReceivedNotes.totalCost,
      createdAt: goodsReceivedNotes.createdAt,
    })
    .from(goodsReceivedNotes)
    .leftJoin(suppliers, eq(goodsReceivedNotes.supplierId, suppliers.id))
    .where(and(...conditions))
    .orderBy(desc(goodsReceivedNotes.receivedDate), desc(goodsReceivedNotes.createdAt))

  return rows.map((r) => ({
    id: r.id,
    grnNumber: r.grnNumber,
    supplierId: r.supplierId,
    supplierName: r.supplierName ?? 'Unknown Supplier',
    poId: r.poId,
    receivedDate: r.receivedDate,
    status: r.status,
    totalCost: r.totalCost,
    createdAt: r.createdAt,
  }))
}

// ─── Get GRN by ID ────────────────────────────────────────────────────────────

export async function getGrnById(id: string): Promise<GrnWithLinesAndJournal> {
  const user = await requireRole(['owner', 'manager', 'accountant', 'cashier'])
  const { businessId } = user

  const [grn] = await db
    .select({
      id: goodsReceivedNotes.id,
      grnNumber: goodsReceivedNotes.grnNumber,
      supplierId: goodsReceivedNotes.supplierId,
      supplierName: suppliers.name,
      poId: goodsReceivedNotes.poId,
      poNumber: purchaseOrders.poNumber,
      receivedDate: goodsReceivedNotes.receivedDate,
      status: goodsReceivedNotes.status,
      totalCost: goodsReceivedNotes.totalCost,
      notes: goodsReceivedNotes.notes,
      journalEntryId: goodsReceivedNotes.journalEntryId,
    })
    .from(goodsReceivedNotes)
    .leftJoin(suppliers, eq(goodsReceivedNotes.supplierId, suppliers.id))
    .leftJoin(purchaseOrders, eq(goodsReceivedNotes.poId, purchaseOrders.id))
    .where(and(eq(goodsReceivedNotes.id, id), eq(goodsReceivedNotes.businessId, businessId)))
    .limit(1)

  if (!grn) {
    throw new Error('GRN not found.')
  }

  // Lines with product names
  const lines = await db
    .select({
      id: grnLines.id,
      grnId: grnLines.grnId,
      poLineId: grnLines.poLineId,
      productId: grnLines.productId,
      productName: products.name,
      quantityOrdered: grnLines.quantityOrdered,
      quantityReceived: grnLines.quantityReceived,
      unitCost: grnLines.unitCost,
      lineTotal: grnLines.lineTotal,
    })
    .from(grnLines)
    .leftJoin(products, eq(grnLines.productId, products.id))
    .where(eq(grnLines.grnId, id))
    .orderBy(asc(grnLines.createdAt))

  // Journal entry summary (if confirmed)
  let journalSummary: GrnJournalSummary | null = null
  if (grn.journalEntryId) {
    const { journalEntries } = await import('@/db/schema')
    const [entry] = await db
      .select({
        entryDate: journalEntries.entryDate,
        reference: journalEntries.reference,
        description: journalEntries.description,
        sourceType: journalEntries.sourceType,
      })
      .from(journalEntries)
      .where(eq(journalEntries.id, grn.journalEntryId))
      .limit(1)

    if (entry) {
      journalSummary = {
        entryDate: entry.entryDate,
        reference: entry.reference,
        description: entry.description,
        sourceType: entry.sourceType,
      }
    }
  }

  return {
    id: grn.id,
    grnNumber: grn.grnNumber,
    supplierId: grn.supplierId,
    supplierName: grn.supplierName ?? 'Unknown Supplier',
    poId: grn.poId,
    poNumber: grn.poNumber ?? null,
    receivedDate: grn.receivedDate,
    status: grn.status,
    totalCost: grn.totalCost,
    notes: grn.notes,
    journalEntryId: grn.journalEntryId,
    journalSummary,
    lines: lines.map((l) => ({
      id: l.id,
      grnId: l.grnId,
      poLineId: l.poLineId,
      productId: l.productId,
      productName: l.productName ?? 'Unknown Product',
      quantityOrdered: l.quantityOrdered,
      quantityReceived: l.quantityReceived,
      unitCost: l.unitCost,
      lineTotal: l.lineTotal,
    })),
  }
}

// ─── Internal helper ─────────────────────────────────────────────────────────

/**
 * After confirming a GRN, check if the PO is now fully received.
 * Must be called within an existing database transaction.
 */
async function updatePoStatusAfterGrn(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  poId: string,
) {
  // Get all PO lines with their totals
  const poLineRows = await tx
    .select({
      id: purchaseOrderLines.id,
      quantity: purchaseOrderLines.quantity,
    })
    .from(purchaseOrderLines)
    .where(eq(purchaseOrderLines.poId, poId))

  if (poLineRows.length === 0) return

  // For each PO line, sum confirmed received quantities
  const receivedSums = await tx
    .select({
      poLineId: grnLines.poLineId,
      totalReceived:
        sql<string>`COALESCE(SUM(CASE WHEN ${goodsReceivedNotes.status} = 'confirmed' THEN ${grnLines.quantityReceived}::numeric ELSE 0 END), 0)`,
    })
    .from(grnLines)
    .leftJoin(goodsReceivedNotes, eq(goodsReceivedNotes.id, grnLines.grnId))
    .where(
      inArray(
        grnLines.poLineId,
        poLineRows.map((l) => l.id),
      ),
    )
    .groupBy(grnLines.poLineId)

  const receivedMap = Object.fromEntries(
    receivedSums.map((r) => [r.poLineId, Number(r.totalReceived)]),
  )

  const allFullyReceived = poLineRows.every((l) => {
    const received = receivedMap[l.id] ?? 0
    return received >= Number(l.quantity) - 0.001
  })

  const newStatus = allFullyReceived ? 'received' : 'partially_received'

  await tx
    .update(purchaseOrders)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(eq(purchaseOrders.id, poId))
}
