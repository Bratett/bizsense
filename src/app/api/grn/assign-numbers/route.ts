import { NextResponse } from 'next/server'
import { and, eq, asc, sql } from 'drizzle-orm'
import { db } from '@/db'
import { goodsReceivedNotes } from '@/db/schema'
import { getServerSession } from '@/lib/session'

export async function POST() {
  const session = await getServerSession()
  const { businessId } = session.user

  const lockKey = `assign_grn_numbers_${businessId}`
  const assigned: Array<{ grnId: string; grnNumber: string }> = []

  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`)

    // Find GRNs that still have device-format numbers (grnNumber = localGrnNumber)
    const unassigned = await tx
      .select({
        id: goodsReceivedNotes.id,
        grnNumber: goodsReceivedNotes.grnNumber,
      })
      .from(goodsReceivedNotes)
      .where(
        and(
          eq(goodsReceivedNotes.businessId, businessId),
          sql`${goodsReceivedNotes.grnNumber} = ${goodsReceivedNotes.localGrnNumber}`,
          sql`${goodsReceivedNotes.grnNumber} ~ '^GRN-[A-Z2-9]{4}-\\d{4,}$'`,
        ),
      )
      .orderBy(asc(goodsReceivedNotes.createdAt))

    if (unassigned.length === 0) return

    // Get the highest clean server-assigned number
    const [maxRow] = await tx
      .select({
        maxNum: sql<string | null>`MAX(${goodsReceivedNotes.grnNumber})`,
      })
      .from(goodsReceivedNotes)
      .where(
        and(
          eq(goodsReceivedNotes.businessId, businessId),
          sql`${goodsReceivedNotes.grnNumber} ~ '^GRN-\\d{4,}$'`,
        ),
      )

    let nextSeq = 1
    if (maxRow?.maxNum) {
      const match = maxRow.maxNum.match(/^GRN-(\d+)$/)
      if (match) nextSeq = parseInt(match[1], 10) + 1
    }

    for (const row of unassigned) {
      const newNumber = `GRN-${String(nextSeq).padStart(4, '0')}`
      await tx
        .update(goodsReceivedNotes)
        .set({ grnNumber: newNumber })
        .where(eq(goodsReceivedNotes.id, row.id))

      assigned.push({ grnId: row.id, grnNumber: newNumber })
      nextSeq++
    }
  })

  return NextResponse.json({ assigned })
}
