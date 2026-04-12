import { and, eq, gt } from 'drizzle-orm'
import { db } from '@/db'
import { pendingAiActions } from '@/db/schema/ai'
import { getServerSession } from '@/lib/session'

/**
 * GET /api/ai/pending-actions?sessionId=<uuid>
 *
 * Returns all non-expired pending AI actions for the current session.
 * businessId is always sourced from the server-side session — the sessionId
 * query param only narrows results within the authenticated tenant.
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession()
    const businessId = session.user.businessId

    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get('sessionId')

    if (!sessionId) {
      return Response.json({ actions: [] })
    }

    const actions = await db
      .select()
      .from(pendingAiActions)
      .where(
        and(
          eq(pendingAiActions.businessId, businessId),
          eq(pendingAiActions.sessionId, sessionId),
          eq(pendingAiActions.status, 'pending'),
          gt(pendingAiActions.expiresAt, new Date()),
        ),
      )

    return Response.json({ actions })
  } catch {
    return Response.json({ error: 'Unauthenticated' }, { status: 401 })
  }
}
