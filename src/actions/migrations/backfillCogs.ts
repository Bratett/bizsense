'use server'

import { and, eq, isNotNull, sql, lte, asc } from 'drizzle-orm'
import { db } from '@/db'
import {
  orders,
  orderLines,
  products,
  inventoryTransactions,
  accounts,
  journalLines,
} from '@/db/schema'
import { requireRole } from '@/lib/auth/requireRole'
import { computeFifoCogs } from '@/lib/inventory/fifo'
import type { FifoTransactionInput } from '@/lib/inventory/fifo'

// ─── Types ───────────────────────────────────────────────────────────────────

export type BackfillResult = {
  success: boolean
  processed: number
  skipped: number
  errors: Array<{ orderId: string; orderNumber: string; reason: string }>
}

// ─── Account codes ──────────────────────────────────────────────────────────

const COGS_ACCOUNT_CODE = '5001'
const INVENTORY_ACCOUNT_CODE = '1200'

// ─── Backfill COGS ──────────────────────────────────────────────────────────

export async function backfillCogs(): Promise<BackfillResult> {
  const user = await requireRole(['owner', 'accountant'])
  const { businessId } = user

  // 1. Resolve GL accounts
  const [cogsAcct] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.businessId, businessId), eq(accounts.code, COGS_ACCOUNT_CODE)))

  const [invAcct] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.businessId, businessId), eq(accounts.code, INVENTORY_ACCOUNT_CODE)))

  if (!cogsAcct || !invAcct) {
    return {
      success: false,
      processed: 0,
      skipped: 0,
      errors: [
        {
          orderId: '',
          orderNumber: '',
          reason: 'Required accounts (5001, 1200) not found. Complete business setup first.',
        },
      ],
    }
  }

  const cogsAccountId = cogsAcct.id
  const inventoryAccountId = invAcct.id

  // 2. Fetch all fulfilled orders with journal entries
  const allOrders = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      orderDate: orders.orderDate,
      journalEntryId: orders.journalEntryId,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(
      and(
        eq(orders.businessId, businessId),
        eq(orders.status, 'fulfilled'),
        isNotNull(orders.journalEntryId),
      ),
    )

  let processed = 0
  let skipped = 0
  const errors: BackfillResult['errors'] = []

  for (const order of allOrders) {
    // 3. Fetch product-linked order lines
    const lines = await db
      .select({
        id: orderLines.id,
        productId: orderLines.productId,
        quantity: orderLines.quantity,
      })
      .from(orderLines)
      .where(and(eq(orderLines.orderId, order.id), isNotNull(orderLines.productId)))

    if (lines.length === 0) {
      skipped++
      continue
    }

    // 4. Idempotency check: does this journal entry already have COGS lines?
    const existingCogsLines = await db
      .select({ id: journalLines.id })
      .from(journalLines)
      .where(
        and(
          eq(journalLines.journalEntryId, order.journalEntryId!),
          eq(journalLines.accountId, cogsAccountId),
        ),
      )
      .limit(1)

    if (existingCogsLines.length > 0) {
      skipped++
      continue
    }

    // 5. Compute COGS for each product line
    let orderCogsTotal = 0
    let hasError = false
    const lineCogsData: Array<{
      productId: string
      quantity: number
      cogsTotal: number
    }> = []

    for (const line of lines) {
      // Check product tracks inventory
      const [prod] = await db
        .select({
          id: products.id,
          name: products.name,
          trackInventory: products.trackInventory,
        })
        .from(products)
        .where(and(eq(products.id, line.productId!), eq(products.businessId, businessId)))

      if (!prod || !prod.trackInventory) continue

      // Fetch transactions up to and including the order date
      const transactions = await db
        .select({
          id: inventoryTransactions.id,
          transactionType: inventoryTransactions.transactionType,
          quantity: inventoryTransactions.quantity,
          unitCost: inventoryTransactions.unitCost,
          transactionDate: inventoryTransactions.transactionDate,
          createdAt: inventoryTransactions.createdAt,
        })
        .from(inventoryTransactions)
        .where(
          and(
            eq(inventoryTransactions.productId, line.productId!),
            eq(inventoryTransactions.businessId, businessId),
            lte(inventoryTransactions.transactionDate, order.orderDate),
          ),
        )
        .orderBy(asc(inventoryTransactions.transactionDate), asc(inventoryTransactions.createdAt))

      const txInputs: FifoTransactionInput[] = transactions.map((t) => ({
        id: t.id,
        transactionType: t.transactionType as FifoTransactionInput['transactionType'],
        quantity: Number(t.quantity),
        unitCost: Number(t.unitCost),
        transactionDate: t.transactionDate,
        createdAt: t.createdAt,
      }))

      const qty = Number(line.quantity)
      const fifoResult = computeFifoCogs(txInputs, qty)

      if (fifoResult.insufficientStock) {
        errors.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          reason: `Insufficient historical stock for ${prod.name} on ${order.orderDate}`,
        })
        hasError = true
        break
      }

      if (fifoResult.cogsTotal > 0) {
        lineCogsData.push({
          productId: prod.id,
          quantity: qty,
          cogsTotal: fifoResult.cogsTotal,
        })
        orderCogsTotal += fifoResult.cogsTotal
      }
    }

    if (hasError || orderCogsTotal === 0) {
      if (!hasError) skipped++
      continue
    }

    // 6. Append COGS lines to existing journal entry + insert inventory transactions
    try {
      await db.transaction(async (tx) => {
        // a. Append journal lines
        await tx.insert(journalLines).values([
          {
            journalEntryId: order.journalEntryId!,
            accountId: cogsAccountId,
            debitAmount: orderCogsTotal.toFixed(2),
            creditAmount: '0.00',
            currency: 'GHS',
            fxRate: '1.0000',
            memo: `COGS backfill — ${order.orderNumber}`,
          },
          {
            journalEntryId: order.journalEntryId!,
            accountId: inventoryAccountId,
            debitAmount: '0.00',
            creditAmount: orderCogsTotal.toFixed(2),
            currency: 'GHS',
            fxRate: '1.0000',
            memo: `Inventory reduction backfill — ${order.orderNumber}`,
          },
        ])

        // b. Re-verify journal entry balance
        const [balanceCheck] = await tx
          .select({
            totalDebits: sql<string>`SUM(CAST(${journalLines.debitAmount} AS numeric))`,
            totalCredits: sql<string>`SUM(CAST(${journalLines.creditAmount} AS numeric))`,
          })
          .from(journalLines)
          .where(eq(journalLines.journalEntryId, order.journalEntryId!))

        const debits = Number(balanceCheck.totalDebits)
        const credits = Number(balanceCheck.totalCredits)
        if (Math.abs(debits - credits) > 0.001) {
          throw new Error(
            `Journal entry imbalanced after backfill: debits=${debits}, credits=${credits}`,
          )
        }

        // c. Insert inventory transactions for each product line
        for (const lcd of lineCogsData) {
          await tx.insert(inventoryTransactions).values({
            businessId,
            productId: lcd.productId,
            transactionType: 'sale',
            quantity: (-lcd.quantity).toFixed(2),
            unitCost: (lcd.cogsTotal / lcd.quantity).toFixed(2),
            referenceId: order.id,
            journalEntryId: order.journalEntryId!,
            transactionDate: order.orderDate,
            notes: `COGS backfill — ${order.orderNumber}`,
          })
        }
      })

      processed++
    } catch (err) {
      errors.push({
        orderId: order.id,
        orderNumber: order.orderNumber,
        reason: err instanceof Error ? err.message : 'Unknown error during backfill',
      })
    }
  }

  return { success: true, processed, skipped, errors }
}
