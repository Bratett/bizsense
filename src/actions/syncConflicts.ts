'use server'

import { and, eq, isNull, sql } from 'drizzle-orm'
import { db } from '@/db'
import { syncConflicts } from '@/db/schema'
import { requireRole } from '@/lib/auth/requireRole'

// ─── Types ───────────────────────────────────────────────────────────────────

export type SyncConflictRecord = {
  id: string
  tableName: string
  recordId: string
  localValue: unknown
  serverValue: unknown
  conflictedAt: Date | null
  reviewedAt: Date | null
  resolution: string | null
  notes: string | null
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function getUnreviewedSyncConflicts(): Promise<SyncConflictRecord[]> {
  const user = await requireRole(['owner', 'accountant'])
  const { businessId } = user

  return db
    .select({
      id: syncConflicts.id,
      tableName: syncConflicts.tableName,
      recordId: syncConflicts.recordId,
      localValue: syncConflicts.localValue,
      serverValue: syncConflicts.serverValue,
      conflictedAt: syncConflicts.conflictedAt,
      reviewedAt: syncConflicts.reviewedAt,
      resolution: syncConflicts.resolution,
      notes: syncConflicts.notes,
    })
    .from(syncConflicts)
    .where(and(eq(syncConflicts.businessId, businessId), isNull(syncConflicts.reviewedAt)))
    .orderBy(syncConflicts.conflictedAt)
}

export async function getUnreviewedSyncConflictsCount(): Promise<number> {
  try {
    const session = await import('@/lib/session').then((m) => m.getServerSession())
    const { businessId } = session.user

    const [row] = await db
      .select({ count: sql<number>`COUNT(*)`.mapWith(Number) })
      .from(syncConflicts)
      .where(and(eq(syncConflicts.businessId, businessId), isNull(syncConflicts.reviewedAt)))

    return row?.count ?? 0
  } catch {
    return 0
  }
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function markConflictReviewed(id: string, notes?: string): Promise<void> {
  const user = await requireRole(['owner', 'accountant'])
  const { businessId, id: userId } = user

  await db
    .update(syncConflicts)
    .set({
      reviewedAt: new Date(),
      reviewedBy: userId,
      resolution: 'server_kept',
      notes: notes ?? null,
    })
    .where(and(eq(syncConflicts.id, id), eq(syncConflicts.businessId, businessId)))
}

export async function markAllConflictsReviewed(): Promise<void> {
  const user = await requireRole(['owner', 'accountant'])
  const { businessId, id: userId } = user

  await db
    .update(syncConflicts)
    .set({
      reviewedAt: new Date(),
      reviewedBy: userId,
      resolution: 'server_kept',
    })
    .where(and(eq(syncConflicts.businessId, businessId), isNull(syncConflicts.reviewedAt)))
}
