'use server'

import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { products, inventoryTransactions, accounts } from '@/db/schema'
import { requireRole } from '@/lib/auth/requireRole'
import { postJournalEntry } from '@/lib/ledger'
import { getProductTransactions } from '@/lib/inventory/queries'
import { computeFifoCogs } from '@/lib/inventory/fifo'
import { getAllowNegativeStock } from '@/lib/inventory/settings'

// ─── Types ───────────────────────────────────────────────────────────────────

export type RecordOpeningStockInput = {
  productId: string
  quantity: number
  unitCost: number
  transactionDate: string // YYYY-MM-DD
  notes?: string
}

export type AdjustStockInput = {
  productId: string
  adjustmentType: 'add' | 'remove'
  quantity: number // always positive
  unitCost?: number // required for 'add'
  reason: string
  notes?: string
  transactionDate?: string // defaults to today
}

export type InventoryActionResult =
  | { success: true; transactionId: string }
  | { success: false; error: string; fieldErrors?: Record<string, string> }

// ─── Account codes ──────────────────────────────────────────────────────────

const INVENTORY_ACCOUNT_CODE = '1200'
const EQUITY_ACCOUNT_CODE = '3001'
const MISC_EXPENSE_ACCOUNT_CODE = '6009'

// ─── Record Opening Stock ───────────────────────────────────────────────────

export async function recordOpeningStock(
  input: RecordOpeningStockInput,
): Promise<InventoryActionResult> {
  const user = await requireRole(['owner', 'manager', 'accountant'])
  const { businessId } = user

  // 1. Validate inputs
  const fieldErrors: Record<string, string> = {}
  if (!input.productId) {
    return { success: false, error: 'Product ID is required' }
  }
  if (!input.quantity || input.quantity <= 0) {
    fieldErrors.quantity = 'Quantity must be greater than 0'
  }
  if (input.unitCost == null || input.unitCost < 0) {
    fieldErrors.unitCost = 'Cost price must be 0 or greater'
  }
  if (!input.transactionDate) {
    fieldErrors.transactionDate = 'Date is required'
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, error: 'Please fix the errors below', fieldErrors }
  }

  // 2. Verify product belongs to this business and tracks inventory
  const [product] = await db
    .select({
      id: products.id,
      name: products.name,
      trackInventory: products.trackInventory,
      businessId: products.businessId,
    })
    .from(products)
    .where(and(eq(products.id, input.productId), eq(products.businessId, businessId)))

  if (!product) {
    return { success: false, error: 'Product not found' }
  }
  if (!product.trackInventory) {
    return { success: false, error: 'This product does not track inventory' }
  }

  // 3. Block duplicate opening stock
  const existingOpening = await db
    .select({ id: inventoryTransactions.id })
    .from(inventoryTransactions)
    .where(
      and(
        eq(inventoryTransactions.productId, input.productId),
        eq(inventoryTransactions.businessId, businessId),
        eq(inventoryTransactions.transactionType, 'opening'),
      ),
    )
    .limit(1)

  if (existingOpening.length > 0) {
    return {
      success: false,
      error:
        'Opening stock has already been set for this product. Use Stock Adjustment to correct quantities.',
    }
  }

  // 4. Resolve GL accounts
  const accountRows = await db
    .select({ id: accounts.id, code: accounts.code })
    .from(accounts)
    .where(
      and(
        eq(accounts.businessId, businessId),
        inArray(accounts.code, [INVENTORY_ACCOUNT_CODE, EQUITY_ACCOUNT_CODE]),
      ),
    )

  const accountMap = Object.fromEntries(accountRows.map((a) => [a.code, a.id]))
  const inventoryAccountId = accountMap[INVENTORY_ACCOUNT_CODE]
  const equityAccountId = accountMap[EQUITY_ACCOUNT_CODE]

  if (!inventoryAccountId || !equityAccountId) {
    return {
      success: false,
      error: 'Required accounts (1200, 3001) not found. Please complete business setup.',
    }
  }

  // 5. Compute total value
  const totalValue = Math.round(input.quantity * input.unitCost * 100) / 100

  // 6. Atomic write — journal entry + inventory transaction
  const transactionId = await db.transaction(async (tx) => {
    // a. Post journal entry
    const journalEntryId = await postJournalEntry(tx, {
      businessId,
      entryDate: input.transactionDate,
      reference: 'STOCK-OPEN-' + input.productId.slice(0, 6).toUpperCase(),
      description: `Opening stock: ${product.name}`,
      sourceType: 'opening_stock',
      sourceId: input.productId,
      createdBy: user.id,
      lines: [
        {
          accountId: inventoryAccountId,
          debitAmount: totalValue,
          creditAmount: 0,
          memo: `Opening stock — ${product.name}`,
        },
        {
          accountId: equityAccountId,
          debitAmount: 0,
          creditAmount: totalValue,
          memo: `Opening stock — ${product.name}`,
        },
      ],
    })

    // b. Insert inventory transaction
    const [row] = await tx
      .insert(inventoryTransactions)
      .values({
        businessId,
        productId: input.productId,
        transactionType: 'opening',
        quantity: input.quantity.toFixed(2),
        unitCost: input.unitCost.toFixed(2),
        transactionDate: input.transactionDate,
        journalEntryId,
        notes: input.notes?.trim() || 'Opening stock',
      })
      .returning({ id: inventoryTransactions.id })

    return row.id
  })

  return { success: true, transactionId }
}

// ─── Adjust Stock ───────────────────────────────────────────────────────────

export async function adjustStock(input: AdjustStockInput): Promise<InventoryActionResult> {
  const user = await requireRole(['owner', 'manager'])
  const { businessId } = user

  // 1. Validate inputs
  const fieldErrors: Record<string, string> = {}
  if (!input.productId) {
    return { success: false, error: 'Product ID is required' }
  }
  if (!input.quantity || input.quantity <= 0) {
    fieldErrors.quantity = 'Quantity must be greater than 0'
  }
  if (input.adjustmentType !== 'add' && input.adjustmentType !== 'remove') {
    return { success: false, error: 'Invalid adjustment type' }
  }
  if (input.adjustmentType === 'add' && (input.unitCost == null || input.unitCost < 0)) {
    fieldErrors.unitCost = 'Cost price is required for adding stock'
  }
  if (!input.reason?.trim()) {
    fieldErrors.reason = 'Reason is required'
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, error: 'Please fix the errors below', fieldErrors }
  }

  const transactionDate = input.transactionDate || new Date().toISOString().split('T')[0]

  // 2. Verify product
  const [product] = await db
    .select({
      id: products.id,
      name: products.name,
      trackInventory: products.trackInventory,
      unit: products.unit,
    })
    .from(products)
    .where(and(eq(products.id, input.productId), eq(products.businessId, businessId)))

  if (!product) {
    return { success: false, error: 'Product not found' }
  }
  if (!product.trackInventory) {
    return { success: false, error: 'This product does not track inventory' }
  }

  // 3. For REMOVE: compute FIFO cost and check stock
  let cogsTotal = 0
  if (input.adjustmentType === 'remove') {
    const transactions = await getProductTransactions(input.productId, businessId)
    const fifoResult = computeFifoCogs(transactions, input.quantity)

    if (fifoResult.insufficientStock && !getAllowNegativeStock(businessId)) {
      const available = Math.round((input.quantity - fifoResult.shortfall) * 100) / 100
      return {
        success: false,
        error: `Cannot remove ${input.quantity} ${product.unit ?? 'units'} — only ${available} in stock.`,
      }
    }

    cogsTotal = fifoResult.cogsTotal
  }

  // 4. Resolve GL accounts
  const isAdd = input.adjustmentType === 'add'
  const neededCodes = isAdd
    ? [INVENTORY_ACCOUNT_CODE, EQUITY_ACCOUNT_CODE]
    : [INVENTORY_ACCOUNT_CODE, MISC_EXPENSE_ACCOUNT_CODE]

  const accountRows = await db
    .select({ id: accounts.id, code: accounts.code })
    .from(accounts)
    .where(and(eq(accounts.businessId, businessId), inArray(accounts.code, neededCodes)))

  const accountMap = Object.fromEntries(accountRows.map((a) => [a.code, a.id]))
  const inventoryAccountId = accountMap[INVENTORY_ACCOUNT_CODE]
  const counterAccountId = isAdd
    ? accountMap[EQUITY_ACCOUNT_CODE]
    : accountMap[MISC_EXPENSE_ACCOUNT_CODE]

  if (!inventoryAccountId || !counterAccountId) {
    return {
      success: false,
      error: `Required accounts not found. Please complete business setup.`,
    }
  }

  // 5. Compute journal amounts
  const journalAmount = isAdd ? Math.round(input.quantity * input.unitCost! * 100) / 100 : cogsTotal

  const notesText = input.reason + (input.notes?.trim() ? ': ' + input.notes.trim() : '')

  // 6. Atomic write
  const transactionId = await db.transaction(async (tx) => {
    const journalEntryId = await postJournalEntry(tx, {
      businessId,
      entryDate: transactionDate,
      reference: 'ADJ-' + Date.now(),
      description: `Stock adjustment: ${product.name} | ${input.reason}`,
      sourceType: 'manual',
      createdBy: user.id,
      lines: isAdd
        ? [
            {
              accountId: inventoryAccountId,
              debitAmount: journalAmount,
              creditAmount: 0,
              memo: `Stock add — ${product.name}`,
            },
            {
              accountId: counterAccountId,
              debitAmount: 0,
              creditAmount: journalAmount,
              memo: `Stock add — ${product.name}`,
            },
          ]
        : [
            {
              accountId: counterAccountId,
              debitAmount: journalAmount,
              creditAmount: 0,
              memo: `Stock write-off — ${product.name} (${input.reason})`,
            },
            {
              accountId: inventoryAccountId,
              debitAmount: 0,
              creditAmount: journalAmount,
              memo: `Stock write-off — ${product.name} (${input.reason})`,
            },
          ],
    })

    const qty = isAdd ? input.quantity : -input.quantity
    const unitCost = isAdd
      ? input.unitCost!
      : input.quantity > 0
        ? Math.round((cogsTotal / input.quantity) * 100) / 100
        : 0

    const [row] = await tx
      .insert(inventoryTransactions)
      .values({
        businessId,
        productId: input.productId,
        transactionType: 'adjustment',
        quantity: qty.toFixed(2),
        unitCost: unitCost.toFixed(2),
        transactionDate,
        journalEntryId,
        notes: notesText,
      })
      .returning({ id: inventoryTransactions.id })

    return row.id
  })

  return { success: true, transactionId }
}
