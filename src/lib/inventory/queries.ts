import { and, eq, asc } from 'drizzle-orm'
import { db } from '@/db'
import { inventoryTransactions } from '@/db/schema'
import type { DrizzleTransaction } from '@/lib/ledger'
import type { FifoTransactionInput } from './fifo'

/**
 * Fetch all inventory transactions for a product in chronological order.
 * This is the only query the FIFO engine needs.
 *
 * Accepts an optional transaction handle for use within atomicTransactionWrite.
 */
export async function getProductTransactions(
  productId: string,
  businessId: string,
  tx?: DrizzleTransaction,
): Promise<FifoTransactionInput[]> {
  const executor = tx ?? db

  const rows = await executor
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
        eq(inventoryTransactions.productId, productId),
        eq(inventoryTransactions.businessId, businessId),
      ),
    )
    .orderBy(asc(inventoryTransactions.transactionDate), asc(inventoryTransactions.createdAt))

  return rows.map((row) => ({
    id: row.id,
    transactionType: row.transactionType as FifoTransactionInput['transactionType'],
    quantity: Number(row.quantity),
    unitCost: Number(row.unitCost),
    transactionDate: row.transactionDate,
    createdAt: row.createdAt,
  }))
}
