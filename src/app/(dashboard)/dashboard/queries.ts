import { eq, and, ne, sql } from 'drizzle-orm'
import { db } from '@/db'
import { businesses, accounts, journalEntries, journalLines } from '@/db/schema'

export type DashboardData = {
  businessName: string
  openingPosition: {
    cashTotal: number
    inventoryTotal: number
    receivablesTotal: number
    payablesTotal: number
  }
  hasLiveTransactions: boolean
}

export async function getDashboardData(businessId: string): Promise<DashboardData> {
  const [businessResult, positionRows, liveCountResult] = await Promise.all([
    db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, businessId)),

    db
      .select({
        accountCode: accounts.code,
        debitAmount: journalLines.debitAmount,
        creditAmount: journalLines.creditAmount,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
      .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
      .where(eq(journalEntries.businessId, businessId)),

    db
      .select({ count: sql<number>`count(*)` })
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.businessId, businessId),
          ne(journalEntries.sourceType, 'opening_balance'),
        ),
      ),
  ])

  const businessName = businessResult[0]?.name ?? 'Your Business'

  let cashTotal = 0
  let inventoryTotal = 0
  let receivablesTotal = 0
  let payablesTotal = 0

  for (const row of positionRows) {
    const debit = Number(row.debitAmount)
    const credit = Number(row.creditAmount)
    const code = row.accountCode

    if (code >= '1001' && code <= '1008') {
      cashTotal += debit - credit
    } else if (code === '1200') {
      inventoryTotal += debit - credit
    } else if (code === '1100') {
      receivablesTotal += debit - credit
    } else if (code === '2001') {
      payablesTotal += credit - debit
    }
  }

  const hasLiveTransactions = Number(liveCountResult[0]?.count ?? 0) > 0

  return {
    businessName,
    openingPosition: {
      cashTotal: Math.round(cashTotal * 100) / 100,
      inventoryTotal: Math.round(inventoryTotal * 100) / 100,
      receivablesTotal: Math.round(receivablesTotal * 100) / 100,
      payablesTotal: Math.round(payablesTotal * 100) / 100,
    },
    hasLiveTransactions,
  }
}
