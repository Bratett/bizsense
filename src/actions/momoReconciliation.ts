'use server'

import { db } from '@/db'
import { momoReconciliationSnapshots } from '@/db/schema'
import { getServerSession } from '@/lib/session'
import { getMoMoBookBalances } from '@/lib/momo/reconciliation'
import type { MoMoAccount } from '@/lib/momo/variance'

// ─── Fetch ────────────────────────────────────────────────────────────────────

// Fetch book balances for the reconciliation screen.
// businessId is always from the server-side session.
export async function getMoMoReconciliationData(): Promise<MoMoAccount[]> {
  const session = await getServerSession()
  const businessId = session.user.businessId
  return getMoMoBookBalances(businessId)
}

// ─── Save Snapshot ────────────────────────────────────────────────────────────

export type SnapshotLine = {
  accountCode: string
  accountName: string
  bookBalance: number
  actualBalance: number
  variance: number
}

export async function saveMoMoReconciliationSnapshot(input: {
  lines: SnapshotLine[]
  totalBookBalance: number
  totalActualBalance: number
  netVariance: number
}): Promise<{ success: true }> {
  const session = await getServerSession()
  const { businessId } = session.user
  const today = new Date().toISOString().slice(0, 10)

  await db.insert(momoReconciliationSnapshots).values({
    businessId,
    snapshotDate: today,
    lines: JSON.stringify(input.lines),
    totalBookBalance: String(input.totalBookBalance),
    totalActualBalance: String(input.totalActualBalance),
    netVariance: String(input.netVariance),
  })

  return { success: true }
}
