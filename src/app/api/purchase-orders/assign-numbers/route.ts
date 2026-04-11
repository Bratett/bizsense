import { NextResponse } from 'next/server'
import { and, eq, asc, sql } from 'drizzle-orm'
import { db } from '@/db'
import { purchaseOrders } from '@/db/schema'
import { getServerSession } from '@/lib/session'

export async function POST() {
  const session = await getServerSession()
  const { businessId } = session.user

  const lockKey = `assign_po_numbers_${businessId}`
  const assigned: Array<{ poId: string; poNumber: string }> = []

  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`)

    // Find POs that still have device-format numbers (poNumber = localPoNumber)
    const unassigned = await tx
      .select({
        id: purchaseOrders.id,
        poNumber: purchaseOrders.poNumber,
      })
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.businessId, businessId),
          sql`${purchaseOrders.poNumber} = ${purchaseOrders.localPoNumber}`,
          sql`${purchaseOrders.poNumber} ~ '^PO-[A-Z2-9]{4}-\\d{4,}$'`,
        ),
      )
      .orderBy(asc(purchaseOrders.createdAt))

    if (unassigned.length === 0) return

    // Get the highest clean server-assigned number
    const [maxRow] = await tx
      .select({
        maxNum: sql<string | null>`MAX(${purchaseOrders.poNumber})`,
      })
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.businessId, businessId),
          sql`${purchaseOrders.poNumber} ~ '^PO-\\d{4,}$'`,
        ),
      )

    let nextSeq = 1
    if (maxRow?.maxNum) {
      const match = maxRow.maxNum.match(/^PO-(\d+)$/)
      if (match) nextSeq = parseInt(match[1], 10) + 1
    }

    for (const row of unassigned) {
      const newNumber = `PO-${String(nextSeq).padStart(4, '0')}`
      await tx
        .update(purchaseOrders)
        .set({ poNumber: newNumber })
        .where(eq(purchaseOrders.id, row.id))

      assigned.push({ poId: row.id, poNumber: newNumber })
      nextSeq++
    }
  })

  return NextResponse.json({ assigned })
}
