// ─── Server-only module ───────────────────────────────────────────────────────
// getMoMoBookBalances calls getAccountBalances → @/db → pg.
// Never import this file from a Client Component.
//
// Pure types and computeVariance live in ./variance (safe for browser).

import { getAccountBalances } from '@/lib/reports/engine'
export type { MoMoAccount, ReconciliationLine } from './variance'
export { MOMO_ACCOUNT_CODES, computeVariance } from './variance'
import type { MoMoAccount } from './variance'
import { MOMO_ACCOUNT_CODES } from './variance'

// ─── Network mapping ──────────────────────────────────────────────────────────

const NETWORK_BY_CODE: Record<string, MoMoAccount['network']> = {
  '1001': 'Bank', // Cash on Hand — included for full picture
  '1002': 'MTN',
  '1003': 'Telecel',
  '1004': 'AirtelTigo',
  '1005': 'Bank',
}

// ─── Book Balance Query ───────────────────────────────────────────────────────

export async function getMoMoBookBalances(businessId: string): Promise<MoMoAccount[]> {
  const today = new Date().toISOString().slice(0, 10)
  const balances = await getAccountBalances(
    businessId,
    { type: 'asOf', date: today },
    MOMO_ACCOUNT_CODES,
  )

  return balances.map((b) => ({
    accountCode: b.accountCode,
    accountName: b.accountName,
    bookBalance: b.netBalance,
    network: NETWORK_BY_CODE[b.accountCode] ?? 'Bank',
  }))
}
