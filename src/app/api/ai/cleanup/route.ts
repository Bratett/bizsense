import { NextResponse } from 'next/server'
import { lt, and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { pendingAiActions } from '@/db/schema/ai'

/**
 * GET /api/ai/cleanup
 *
 * Marks expired pending_ai_actions as 'expired'.
 * Called non-blockingly on app load and by a Vercel cron every 5 minutes.
 * No auth required — this is a safe housekeeping operation that only
 * marks rows, never reads or returns sensitive data.
 */
export async function GET() {
  const { rowCount } = await db
    .update(pendingAiActions)
    .set({ status: 'expired', updatedAt: new Date() })
    .where(
      and(eq(pendingAiActions.status, 'pending'), lt(pendingAiActions.expiresAt, new Date())),
    )

  return NextResponse.json({ ok: true, expired: rowCount ?? 0 })
}
