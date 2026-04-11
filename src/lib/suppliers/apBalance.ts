import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { goodsReceivedNotes, supplierPayments } from '@/db/schema'

/**
 * getSupplierApBalance — returns the net outstanding payable for a supplier.
 *
 * Outstanding = SUM(confirmed GRN totalCost) - SUM(supplier payments made)
 *
 * A negative value means the business has overpaid (supplier credit).
 * We do NOT clamp to 0 — overpayments are valid in advance-payment workflows.
 */
export async function getSupplierApBalance(
  supplierId: string,
  businessId: string,
): Promise<number> {
  const [owedResult] = await db
    .select({
      totalOwed: sql<string>`COALESCE(SUM(CAST(${goodsReceivedNotes.totalCost} AS numeric)), 0)`,
    })
    .from(goodsReceivedNotes)
    .where(
      and(
        eq(goodsReceivedNotes.supplierId, supplierId),
        eq(goodsReceivedNotes.businessId, businessId),
        eq(goodsReceivedNotes.status, 'confirmed'),
      ),
    )

  const [paidResult] = await db
    .select({
      totalPaid: sql<string>`COALESCE(SUM(CAST(${supplierPayments.amount} AS numeric)), 0)`,
    })
    .from(supplierPayments)
    .where(
      and(
        eq(supplierPayments.supplierId, supplierId),
        eq(supplierPayments.businessId, businessId),
      ),
    )

  const totalOwed = Number(owedResult?.totalOwed ?? '0')
  const totalPaid = Number(paidResult?.totalPaid ?? '0')

  return Math.round((totalOwed - totalPaid) * 100) / 100
}
