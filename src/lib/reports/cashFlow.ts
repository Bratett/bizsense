import { and, eq, gte, inArray, lte } from 'drizzle-orm'
import { db } from '@/db'
import { accounts, journalEntries, journalLines } from '@/db/schema'
import { getAccountBalances } from './engine'
import type { PeriodParams } from './engine'

// ─── Constants ────────────────────────────────────────────────────────────────

const CASH_CODES = ['1001', '1002', '1003', '1004', '1005']

const SOURCE_TYPE_LABELS: Record<string, string> = {
  order:           'Sale',
  expense:         'Expense',
  payment:         'Payment Received',
  payroll:         'Payroll',
  manual:          'Journal Entry',
  ai_recorded:     'AI Entry',
  reversal:        'Reversal',
  opening_balance: 'Opening Balance',
}

function sourceTypeLabel(st: string): string {
  return SOURCE_TYPE_LABELS[st] ?? st
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type CashFlowLine = {
  description: string
  amount:      number    // positive = inflow, negative = outflow
}

export type CashFlowSection = {
  label:     string
  lines:     CashFlowLine[]
  netAmount: number
}

export type CashFlowStatement = {
  period:                 { from: string; to: string }
  operating:              CashFlowSection
  investing:              CashFlowSection
  financing:              CashFlowSection
  netChange:              number
  openingCashBalance:     number
  /** openingCash + netChange — statement arithmetic */
  closingCashBalance:     number
  /** Direct ledger query — the authoritative figure shown on the Balance Sheet */
  closingCashCrossCheck:  number
  /** |closingCashBalance - closingCashCrossCheck| < 0.01 */
  isReconciled:           boolean
  /** Cash movements where every offsetting account has null or 'none' cash_flow_activity */
  unclassifiedAmount:     number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function roundCents(n: number): number {
  return Math.round(n * 100) / 100
}

function sectionNetAmount(lines: CashFlowLine[]): number {
  return roundCents(lines.reduce((s, l) => s + l.amount, 0))
}

function makeSection(label: string, lines: CashFlowLine[]): CashFlowSection {
  return { label, lines, netAmount: sectionNetAmount(lines) }
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Compute a Cash Flow Statement for the given date range (direct method).
 *
 * A "cash movement" is any journal line whose account is a cash account
 * (codes 1001–1005). Each such movement is classified by the cash_flow_activity
 * of the offsetting (non-cash) account(s) in the same journal entry.
 *
 * Cross-check: openingCash + netChange should equal the direct ledger closing
 * balance. If they differ, some cash movements are unclassified (missing
 * cash_flow_activity on one or more accounts).
 *
 * @param businessId - from server-side session, never from client
 * @param period     - inclusive date range { type:'range', from, to }
 */
export async function getCashFlowStatement(
  businessId: string,
  period: Extract<PeriodParams, { type: 'range' }>,
): Promise<CashFlowStatement> {

  // ── Step 1: Find journal entry IDs that touch a cash account in this period ─
  const cashEntryRows = await db
    .select({ entryId: journalLines.journalEntryId })
    .from(journalLines)
    .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
    .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
    .where(
      and(
        eq(journalEntries.businessId, businessId),
        gte(journalEntries.entryDate, period.from),
        lte(journalEntries.entryDate, period.to),
        inArray(accounts.code, CASH_CODES),
      ),
    )

  const entryIds = [...new Set(cashEntryRows.map(r => r.entryId))]

  // ── Step 2: Opening & closing cash from the ledger ────────────────────────
  const dayBefore = new Date(
    new Date(period.from + 'T00:00:00Z').getTime() - 86_400_000,
  ).toISOString().slice(0, 10)

  const [openingBals, closingBals] = await Promise.all([
    getAccountBalances(businessId, { type: 'asOf', date: dayBefore }, CASH_CODES),
    getAccountBalances(businessId, { type: 'asOf', date: period.to  }, CASH_CODES),
  ])

  // openingCashFromLedger = direct ledger balance of cash accounts as of the day before
  // the period. opening_balance source entries dated within the period will be added to
  // this figure separately (they represent the starting position, not period cash flows).
  const openingCashFromLedger  = roundCents(openingBals.reduce((s, a) => s + a.netBalance, 0))
  const closingCashCrossCheck  = roundCents(closingBals.reduce((s, a) => s + a.netBalance, 0))

  // ── Early return for periods with no cash-touching entries ────────────────
  const emptySection = (label: string): CashFlowSection =>
    makeSection(label, [])

  if (entryIds.length === 0) {
    const netChange          = 0
    const openingCashBalance = openingCashFromLedger
    const closingCashBalance = roundCents(openingCashBalance + netChange)
    return {
      period:       { from: period.from, to: period.to },
      operating:    emptySection('Operating Activities'),
      investing:    emptySection('Investing Activities'),
      financing:    emptySection('Financing Activities'),
      netChange,
      openingCashBalance,
      closingCashBalance,
      closingCashCrossCheck,
      isReconciled:        Math.abs(closingCashBalance - closingCashCrossCheck) < 0.01,
      unclassifiedAmount:  0,
    }
  }

  // ── Step 3: Fetch ALL lines for those entries ─────────────────────────────
  const allLines = await db
    .select({
      lineId:           journalLines.id,
      entryId:          journalLines.journalEntryId,
      entryDate:        journalEntries.entryDate,
      entryDesc:        journalEntries.description,
      sourceType:       journalEntries.sourceType,
      debitAmount:      journalLines.debitAmount,
      creditAmount:     journalLines.creditAmount,
      accountCode:      accounts.code,
      accountName:      accounts.name,
      accountType:      accounts.type,
      cashFlowActivity: accounts.cashFlowActivity,
    })
    .from(journalLines)
    .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
    .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
    .where(inArray(journalLines.journalEntryId, entryIds))
    .orderBy(journalEntries.entryDate, journalLines.journalEntryId, journalLines.id)

  // ── Step 4: Classify each entry's cash movement ───────────────────────────

  // Group rows by entryId
  type LineRow = typeof allLines[number]
  const byEntry = new Map<string, LineRow[]>()
  for (const row of allLines) {
    const existing = byEntry.get(row.entryId)
    if (existing) {
      existing.push(row)
    } else {
      byEntry.set(row.entryId, [row])
    }
  }

  const operatingLines: CashFlowLine[] = []
  const investingLines: CashFlowLine[] = []
  const financingLines: CashFlowLine[] = []
  let unclassifiedAmount = 0
  // Cash from opening_balance entries dated within the period. These represent the
  // business's starting position, not cash flows, so they are excluded from the three
  // activity sections and folded into the Opening Cash Balance instead.
  let openingBalanceCashMovement = 0

  const sectionMap: Record<string, CashFlowLine[]> = {
    operating: operatingLines,
    investing:  investingLines,
    financing:  financingLines,
  }

  for (const [, lines] of byEntry) {
    const cashLines    = lines.filter(l => CASH_CODES.includes(l.accountCode))
    const nonCashLines = lines.filter(l => !CASH_CODES.includes(l.accountCode))

    // Net cash movement: positive = inflow (more debits than credits on cash accounts)
    const cashMovement = roundCents(
      cashLines.reduce(
        (s, l) => s + (Number(l.debitAmount) - Number(l.creditAmount)),
        0,
      ),
    )

    const description =
      lines[0].entryDesc ?? sourceTypeLabel(lines[0].sourceType)

    // Opening balance entries represent the starting cash position, not period cash flows.
    // Accumulate their net cash movement and add to openingCashFromLedger below.
    if (lines[0].sourceType === 'opening_balance') {
      openingBalanceCashMovement = roundCents(openingBalanceCashMovement + cashMovement)
      continue
    }

    // Classify by non-cash accounts' cash_flow_activity
    const classifiedActivities = nonCashLines
      .map(l => l.cashFlowActivity)
      .filter((a): a is string => !!a && a !== 'none')
    const uniqueActs = [...new Set(classifiedActivities)]
    const hasUnclassified = nonCashLines.some(
      l => !l.cashFlowActivity || l.cashFlowActivity === 'none',
    )

    if (uniqueActs.length === 0) {
      // All non-cash accounts are unclassified
      unclassifiedAmount = roundCents(unclassifiedAmount + Math.abs(cashMovement))
      continue
    }

    if (uniqueActs.length === 1) {
      // Simple case — one activity
      if (hasUnclassified) {
        console.warn(
          `[cashFlow] Entry has mixed classified/unclassified non-cash accounts. ` +
          `Assigning entire cash movement to '${uniqueActs[0]}'.`,
        )
      }
      const target = sectionMap[uniqueActs[0]]
      if (target) target.push({ description, amount: cashMovement })
      continue
    }

    // Multiple distinct activities — proportional allocation by non-cash amount
    console.warn(
      `[cashFlow] Entry has multiple cash_flow_activity values (${uniqueActs.join(', ')}). ` +
      `Applying proportional allocation.`,
    )

    const totalNonCashAbs = nonCashLines.reduce(
      (s, l) => s + Math.abs(Number(l.debitAmount) - Number(l.creditAmount)),
      0,
    )

    for (const act of uniqueActs) {
      const actLines = nonCashLines.filter(
        l => l.cashFlowActivity === act,
      )
      const actWeight = actLines.reduce(
        (s, l) => s + Math.abs(Number(l.debitAmount) - Number(l.creditAmount)),
        0,
      )
      const allocated = totalNonCashAbs > 0
        ? roundCents(cashMovement * (actWeight / totalNonCashAbs))
        : 0
      const target = sectionMap[act]
      if (target && allocated !== 0) {
        target.push({ description: `${description} (${act})`, amount: allocated })
      }
    }

    // Unclassified portion within a mixed entry
    if (hasUnclassified) {
      const nullLines = nonCashLines.filter(
        l => !l.cashFlowActivity || l.cashFlowActivity === 'none',
      )
      const nullWeight = nullLines.reduce(
        (s, l) => s + Math.abs(Number(l.debitAmount) - Number(l.creditAmount)),
        0,
      )
      const unclassifiedPortion = totalNonCashAbs > 0
        ? roundCents(Math.abs(cashMovement) * (nullWeight / totalNonCashAbs))
        : 0
      unclassifiedAmount = roundCents(unclassifiedAmount + unclassifiedPortion)
    }
  }

  // ── Step 5: Assemble result ────────────────────────────────────────────────
  const operating = makeSection('Operating Activities', operatingLines)
  const investing  = makeSection('Investing Activities',  investingLines)
  const financing  = makeSection('Financing Activities',  financingLines)

  // Opening cash = ledger balance before the period + any opening_balance entries
  // dated within the period (they set the starting position, not cash flows).
  const openingCashBalance = roundCents(openingCashFromLedger + openingBalanceCashMovement)
  const netChange          = roundCents(operating.netAmount + investing.netAmount + financing.netAmount)
  const closingCashBalance = roundCents(openingCashBalance + netChange)
  const isReconciled       = Math.abs(closingCashBalance - closingCashCrossCheck) < 0.01

  return {
    period:       { from: period.from, to: period.to },
    operating,
    investing,
    financing,
    netChange,
    openingCashBalance,
    closingCashBalance,
    closingCashCrossCheck,
    isReconciled,
    unclassifiedAmount: roundCents(unclassifiedAmount),
  }
}
