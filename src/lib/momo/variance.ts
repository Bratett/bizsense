// ─── Client-safe module ───────────────────────────────────────────────────────
// This file has NO imports from @/db, @/lib/reports/engine, or any server-only
// module. It is safe to import from both Server Components and Client Components.

import { formatGhs } from '@/lib/format'

// ─── Types ────────────────────────────────────────────────────────────────────

export type MoMoAccount = {
  accountCode: string
  accountName: string
  bookBalance: number // from ledger (journal entries)
  network: 'MTN' | 'Telecel' | 'AirtelTigo' | 'Bank'
}

export type ReconciliationLine = MoMoAccount & {
  actualBalance: number | null // entered by user; null = not yet entered
  variance: number | null // actualBalance - bookBalance; null if not entered
  varianceLabel: string | null
  status: 'match' | 'surplus' | 'deficit' | 'pending'
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const MOMO_ACCOUNT_CODES = ['1001', '1002', '1003', '1004', '1005']

// ─── Variance Computation ─────────────────────────────────────────────────────

export function computeVariance(
  bookBalance: number,
  actualBalance: number | null,
): Pick<ReconciliationLine, 'variance' | 'varianceLabel' | 'status'> {
  if (actualBalance === null) {
    return { variance: null, varianceLabel: null, status: 'pending' }
  }

  const variance = actualBalance - bookBalance

  if (Math.abs(variance) < 0.01) {
    return { variance: 0, varianceLabel: 'Matches book balance', status: 'match' }
  }

  if (variance > 0) {
    return {
      variance,
      varianceLabel: `${formatGhs(variance)} more than recorded — possible unrecorded income or MoMo credit`,
      status: 'surplus',
    }
  }

  return {
    variance,
    varianceLabel: `${formatGhs(Math.abs(variance))} less than recorded — possible unrecorded expense or MoMo fee`,
    status: 'deficit',
  }
}
