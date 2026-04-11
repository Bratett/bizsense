import { and, between, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/db'
import { accounts, journalEntries, journalLines } from '@/db/schema'

// ─── Types ────────────────────────────────────────────────────────────────────

export type JournalLine = {
  accountId: string
  accountCode: string
  accountName: string
  debitAmount: string
  creditAmount: string
  memo: string | null
}

export type JournalEntryRow = {
  id: string
  entryDate: string
  reference: string | null
  description: string | null
  sourceType: string
  aiGenerated: boolean
  reversalOf: string | null
  drTotal: string
  crTotal: string
  isImbalanced: boolean
  lines: JournalLine[]
}

export type JournalEntriesResult = {
  entries: JournalEntryRow[]
  page: number
  hasMore: boolean
}

export type JournalEntryFilters = {
  dateFrom?: string
  dateTo?: string
  sourceType?: string
  accountId?: string
  aiGenerated?: boolean
  unbalancedOnly?: boolean
}

export type TrialBalanceRow = {
  code: string
  name: string
  type: string
  totalDebits: string
  totalCredits: string
  balance: string
}

export type TrialBalanceResult = {
  rows: TrialBalanceRow[]
  grandTotalDebits: number
  grandTotalCredits: number
  isBalanced: boolean
}

// ─── getJournalEntries ────────────────────────────────────────────────────────

export async function getJournalEntries(
  businessId: string,
  filters: JournalEntryFilters,
  page: number = 1,
): Promise<JournalEntriesResult> {
  const { dateFrom, dateTo, sourceType, accountId, aiGenerated, unbalancedOnly } = filters

  // If accountId filter is set, pre-fetch the matching entry IDs
  let accountEntryIds: string[] | undefined
  if (accountId) {
    const rows = await db
      .selectDistinct({ journalEntryId: journalLines.journalEntryId })
      .from(journalLines)
      .where(eq(journalLines.accountId, accountId))
    accountEntryIds = rows.map((r) => r.journalEntryId)
    // If no entries touch this account, return early
    if (accountEntryIds.length === 0) {
      return { entries: [], page, hasMore: false }
    }
  }

  // Build WHERE conditions
  const conditions = [eq(journalEntries.businessId, businessId)]
  if (dateFrom && dateTo) {
    conditions.push(between(journalEntries.entryDate, dateFrom, dateTo))
  } else if (dateFrom) {
    conditions.push(sql`${journalEntries.entryDate} >= ${dateFrom}`)
  } else if (dateTo) {
    conditions.push(sql`${journalEntries.entryDate} <= ${dateTo}`)
  }
  if (sourceType) {
    conditions.push(eq(journalEntries.sourceType, sourceType))
  }
  if (aiGenerated === true) {
    conditions.push(eq(journalEntries.aiGenerated, true))
  }
  if (accountEntryIds) {
    conditions.push(inArray(journalEntries.id, accountEntryIds))
  }

  // Step A: Paginated entries with per-entry totals
  const PAGE_SIZE = 50
  const offset = (page - 1) * PAGE_SIZE

  const rawEntries = await db
    .select({
      id: journalEntries.id,
      entryDate: journalEntries.entryDate,
      reference: journalEntries.reference,
      description: journalEntries.description,
      sourceType: journalEntries.sourceType,
      aiGenerated: journalEntries.aiGenerated,
      reversalOf: journalEntries.reversalOf,
      drTotal: sql<string>`COALESCE(SUM(${journalLines.debitAmount}), '0')`,
      crTotal: sql<string>`COALESCE(SUM(${journalLines.creditAmount}), '0')`,
      isImbalanced: sql<boolean>`ABS(COALESCE(SUM(${journalLines.debitAmount}), 0) - COALESCE(SUM(${journalLines.creditAmount}), 0)) > 0.001`,
    })
    .from(journalEntries)
    .leftJoin(journalLines, eq(journalLines.journalEntryId, journalEntries.id))
    .where(and(...conditions))
    .groupBy(
      journalEntries.id,
      journalEntries.entryDate,
      journalEntries.reference,
      journalEntries.description,
      journalEntries.sourceType,
      journalEntries.aiGenerated,
      journalEntries.reversalOf,
    )
    .having(
      unbalancedOnly
        ? sql`ABS(COALESCE(SUM(${journalLines.debitAmount}), 0) - COALESCE(SUM(${journalLines.creditAmount}), 0)) > 0.001`
        : sql`1=1`,
    )
    .orderBy(desc(journalEntries.entryDate), desc(journalEntries.createdAt))
    .limit(PAGE_SIZE + 1)
    .offset(offset)

  const hasMore = rawEntries.length > PAGE_SIZE
  const pageEntries = rawEntries.slice(0, PAGE_SIZE)

  if (pageEntries.length === 0) {
    return { entries: [], page, hasMore: false }
  }

  // Step B: Lines for this page's entries
  const entryIds = pageEntries.map((e) => e.id)
  const lines = await db
    .select({
      journalEntryId: journalLines.journalEntryId,
      accountId: journalLines.accountId,
      accountCode: accounts.code,
      accountName: accounts.name,
      debitAmount: journalLines.debitAmount,
      creditAmount: journalLines.creditAmount,
      memo: journalLines.memo,
    })
    .from(journalLines)
    .innerJoin(accounts, eq(accounts.id, journalLines.accountId))
    .where(inArray(journalLines.journalEntryId, entryIds))

  // Group lines by entry ID
  const linesByEntryId = lines.reduce<Record<string, JournalLine[]>>((acc, line) => {
    if (!acc[line.journalEntryId]) acc[line.journalEntryId] = []
    acc[line.journalEntryId].push({
      accountId: line.accountId,
      accountCode: line.accountCode,
      accountName: line.accountName,
      debitAmount: line.debitAmount ?? '0',
      creditAmount: line.creditAmount ?? '0',
      memo: line.memo,
    })
    return acc
  }, {})

  const entries: JournalEntryRow[] = pageEntries.map((e) => ({
    id: e.id,
    entryDate: e.entryDate,
    reference: e.reference,
    description: e.description,
    sourceType: e.sourceType,
    aiGenerated: e.aiGenerated,
    reversalOf: e.reversalOf,
    drTotal: e.drTotal,
    crTotal: e.crTotal,
    isImbalanced: Boolean(e.isImbalanced),
    lines: linesByEntryId[e.id] ?? [],
  }))

  return { entries, page, hasMore }
}

// ─── getTrialBalance ──────────────────────────────────────────────────────────

export async function getTrialBalance(
  businessId: string,
  dateFrom: string,
  dateTo: string,
): Promise<TrialBalanceResult> {
  const rows = await db
    .select({
      code: accounts.code,
      name: accounts.name,
      type: accounts.type,
      totalDebits: sql<string>`SUM(${journalLines.debitAmount})`,
      totalCredits: sql<string>`SUM(${journalLines.creditAmount})`,
      balance: sql<string>`SUM(${journalLines.debitAmount}) - SUM(${journalLines.creditAmount})`,
    })
    .from(journalLines)
    .innerJoin(accounts, eq(accounts.id, journalLines.accountId))
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalEntryId))
    .where(
      and(
        eq(journalEntries.businessId, businessId),
        between(journalEntries.entryDate, dateFrom, dateTo),
      ),
    )
    .groupBy(accounts.id, accounts.code, accounts.name, accounts.type)
    .orderBy(accounts.code)

  const typedRows: TrialBalanceRow[] = rows.map((r) => ({
    code: r.code,
    name: r.name,
    type: r.type,
    totalDebits: r.totalDebits ?? '0',
    totalCredits: r.totalCredits ?? '0',
    balance: r.balance ?? '0',
  }))

  const grandTotalDebits = typedRows.reduce((s, r) => s + Number(r.totalDebits), 0)
  const grandTotalCredits = typedRows.reduce((s, r) => s + Number(r.totalCredits), 0)
  const isBalanced = Math.abs(grandTotalDebits - grandTotalCredits) < 0.01

  return { rows: typedRows, grandTotalDebits, grandTotalCredits, isBalanced }
}
