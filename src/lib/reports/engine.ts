import { and, eq, sql, inArray, gte, lte } from 'drizzle-orm'
import { db } from '@/db'
import { accounts, journalLines, journalEntries } from '@/db/schema'

// ─── Types ────────────────────────────────────────────────────────────────────

export type AccountBalance = {
  accountId: string
  accountCode: string
  accountName: string
  accountType: string           // asset | liability | equity | revenue | expense | cogs
  accountSubtype: string | null
  cashFlowActivity: string | null
  normalBalance: 'debit' | 'credit'
  totalDebits: number
  totalCredits: number
  netBalance: number            // positive = normal balance direction
                                // negative = unusual (overdraft, negative equity, etc.)
}

// PeriodParams and period helpers live in periods.ts (no DB imports — safe for
// client components). Re-exported here so existing server-side code can import
// from a single location.
export type { PeriodParams } from './periods'
export {
  currentMonthPeriod,
  priorMonthPeriod,
  yearToDatePeriod,
  quarterPeriod,
} from './periods'

import type { PeriodParams } from './periods'

// ─── Core: Account Balances ───────────────────────────────────────────────────

/**
 * Compute balances for all accounts (or a subset) for a given period.
 * This is the single source of truth for all report numbers.
 *
 * The date filter is applied in the LEFT JOIN ON clause — NOT in WHERE.
 * This ensures accounts with zero activity in the period still appear
 * with netBalance = 0, which is required for Balance Sheet and Trial Balance.
 *
 * @param businessId   - session-derived business ID (never from client)
 * @param period       - 'range' for P&L/Cash Flow, 'asOf' for Balance Sheet/Trial Balance
 * @param accountCodes - optional filter to specific account codes
 */
export async function getAccountBalances(
  businessId: string,
  period: PeriodParams,
  accountCodes?: string[],
): Promise<AccountBalance[]> {
  const rows = await db
    .select({
      accountId:        accounts.id,
      accountCode:      accounts.code,
      accountName:      accounts.name,
      accountType:      accounts.type,
      accountSubtype:   accounts.subtype,
      cashFlowActivity: accounts.cashFlowActivity,
      totalDebits:      sql<string>`COALESCE(SUM(CASE WHEN ${journalEntries.id} IS NOT NULL THEN ${journalLines.debitAmount} ELSE 0 END), '0')`,
      totalCredits:     sql<string>`COALESCE(SUM(CASE WHEN ${journalEntries.id} IS NOT NULL THEN ${journalLines.creditAmount} ELSE 0 END), '0')`,
    })
    .from(accounts)
    .leftJoin(journalLines, eq(journalLines.accountId, accounts.id))
    .leftJoin(
      journalEntries,
      and(
        eq(journalEntries.id, journalLines.journalEntryId),
        eq(journalEntries.businessId, businessId),
        period.type === 'range' ? gte(journalEntries.entryDate, period.from) : undefined,
        period.type === 'range' ? lte(journalEntries.entryDate, period.to)   : undefined,
        period.type === 'asOf'  ? lte(journalEntries.entryDate, period.date) : undefined,
      ),
    )
    .where(
      and(
        eq(accounts.businessId, businessId),
        accountCodes ? inArray(accounts.code, accountCodes) : undefined,
      ),
    )
    .groupBy(
      accounts.id,
      accounts.code,
      accounts.name,
      accounts.type,
      accounts.subtype,
      accounts.cashFlowActivity,
    )
    .orderBy(accounts.code)

  return rows.map((row) => {
    const isDebitNormal = ['asset', 'cogs', 'expense'].includes(row.accountType)
    const normalBalance: 'debit' | 'credit' = isDebitNormal ? 'debit' : 'credit'
    const dr = Math.round(Number(row.totalDebits)  * 100) / 100
    const cr = Math.round(Number(row.totalCredits) * 100) / 100
    const netBalance = isDebitNormal ? dr - cr : cr - dr

    return {
      accountId:        row.accountId,
      accountCode:      row.accountCode,
      accountName:      row.accountName,
      accountType:      row.accountType,
      accountSubtype:   row.accountSubtype,
      cashFlowActivity: row.cashFlowActivity,
      normalBalance,
      totalDebits:  dr,
      totalCredits: cr,
      netBalance,
    }
  })
}

// ─── Derived: Balance for a single account ────────────────────────────────────

export async function getSingleAccountBalance(
  businessId: string,
  accountCode: string,
  period: PeriodParams,
): Promise<number> {
  const balances = await getAccountBalances(businessId, period, [accountCode])
  return balances[0]?.netBalance ?? 0
}

// ─── Derived: Account balances grouped by type ────────────────────────────────

export async function getBalancesByType(
  businessId: string,
  period: PeriodParams,
  types: string[],
): Promise<AccountBalance[]> {
  const all = await getAccountBalances(businessId, period)
  return all.filter((a) => types.includes(a.accountType))
}
