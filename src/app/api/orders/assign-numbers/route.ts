import { NextResponse } from 'next/server'
import { and, eq, asc, sql } from 'drizzle-orm'
import { db } from '@/db'
import { orders } from '@/db/schema'
import { getServerSession } from '@/lib/session'

export async function POST() {
  const session = await getServerSession()
  const { businessId } = session.user

  // Advisory lock keyed on businessId to prevent concurrent assignment
  const lockKey = `assign_order_numbers_${businessId}`

  const assigned: Array<{ orderId: string; orderNumber: string }> = []

  await db.transaction(async (tx) => {
    // Acquire advisory lock within this transaction
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`)

    // Find orders that still have device-format numbers (orderNumber = localOrderNumber)
    const unassigned = await tx
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
      })
      .from(orders)
      .where(
        and(
          eq(orders.businessId, businessId),
          sql`${orders.orderNumber} = ${orders.localOrderNumber}`,
          sql`${orders.orderNumber} ~ '^ORD-[A-Z2-9]{4}-\\d{4,}$'`,
        ),
      )
      .orderBy(asc(orders.createdAt))

    if (unassigned.length === 0) return

    // Get the highest clean server-assigned number
    const [maxRow] = await tx
      .select({
        maxNum: sql<string | null>`MAX(${orders.orderNumber})`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.businessId, businessId),
          sql`${orders.orderNumber} ~ '^ORD-\\d{4,}$'`,
        ),
      )

    let nextSeq = 1
    if (maxRow?.maxNum) {
      const match = maxRow.maxNum.match(/^ORD-(\d+)$/)
      if (match) nextSeq = parseInt(match[1], 10) + 1
    }

    // Assign sequential clean numbers
    for (const row of unassigned) {
      const newNumber = `ORD-${String(nextSeq).padStart(4, '0')}`
      await tx
        .update(orders)
        .set({ orderNumber: newNumber })
        .where(eq(orders.id, row.id))

      assigned.push({ orderId: row.id, orderNumber: newNumber })
      nextSeq++
    }
  })

  return NextResponse.json({ assigned })
}
