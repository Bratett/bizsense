import { and, eq, gte, lte, inArray, sql } from 'drizzle-orm'
import { db } from '@/db'
import { businesses, accounts, journalLines, journalEntries } from '@/db/schema'

// ─── Types ────────────────────────────────────────────────────────────────────

export type VatReportLine = {
  entryDate: string
  reference: string
  description: string
  netSupplyAmount: number // revenue credits (output) or expense debits (input) in same entry
  vatAmount: number // VAT component only
  sourceType: string
}

export type VatReport = {
  period: { from: string; to: string }
  vatRegistrationNumber: string | null
  outputVat: {
    lines: VatReportLine[]
    totalNetSupply: number
    totalVat: number
  }
  inputVat: {
    lines: VatReportLine[]
    totalNetPurchase: number
    totalVat: number
    graPurchasesNote: string
  }
  netVatPayable: number // positive = payable to GRA; negative = refund due
}

// ─── Internal raw type ────────────────────────────────────────────────────────

type RawVatLine = {
  entryId: string
  entryDate: string
  reference: string | null
  description: string | null
  sourceType: string
  vatAmount: string // numeric string from Drizzle
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GRA_PURCHASES_NOTE =
  'This report now includes input VAT from expense receipts and confirmed supplier invoices. Verify your VAT return with your accountant before filing.'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Compute the VAT report for a given period.
 * Returns null if the business is not VAT-registered.
 *
 * Uses direct ledger queries (not getAccountBalances) because the report needs
 * individual transaction lines, not aggregated account balances.
 *
 * @param businessId - from server-side session, never from client
 * @param period     - inclusive date range { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
 */
export async function getVatReport(
  businessId: string,
  period: { from: string; to: string },
): Promise<VatReport | null> {
  // ── 1. Check vatRegistered ────────────────────────────────────────────────
  const businessRows = await db.select().from(businesses).where(eq(businesses.id, businessId))
  const business = businessRows[0]
  if (!business?.vatRegistered) return null

  // ── 2. Find account 2100 (VAT Payable) ───────────────────────────────────
  const vatPayableRows = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.businessId, businessId), eq(accounts.code, '2100')))
  const vatPayableAccount = vatPayableRows[0]
  if (!vatPayableAccount) {
    throw new Error(
      'VAT Payable account (2100) not found. Ensure Chart of Accounts is correctly seeded.',
    )
  }

  // ── 3. Find account 1101 (Input VAT Recoverable) ─────────────────────────
  const inputVatRows = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.businessId, businessId), eq(accounts.code, '1101')))
  const inputVatAccount = inputVatRows[0]
  if (!inputVatAccount) {
    throw new Error(
      'Input VAT Recoverable account (1101) not found. Ensure Chart of Accounts is correctly seeded.',
    )
  }

  // ── 4. Output VAT lines (credits to account 2100) ────────────────────────
  const rawOutputLines: RawVatLine[] = await db
    .select({
      entryId: journalEntries.id,
      entryDate: journalEntries.entryDate,
      reference: journalEntries.reference,
      description: journalEntries.description,
      sourceType: journalEntries.sourceType,
      vatAmount: journalLines.creditAmount,
    })
    .from(journalLines)
    .innerJoin(
      journalEntries,
      and(
        eq(journalEntries.id, journalLines.journalEntryId),
        eq(journalEntries.businessId, businessId),
        gte(journalEntries.entryDate, period.from),
        lte(journalEntries.entryDate, period.to),
        inArray(journalEntries.sourceType, ['order', 'ai_recorded']),
      ),
    )
    .where(eq(journalLines.accountId, vatPayableAccount.id))
    .orderBy(journalEntries.entryDate)

  // ── 5. Net supply per entry (revenue credits in the same entry) ───────────
  const netSupplyMap = new Map<string, number>()
  if (rawOutputLines.length > 0) {
    const outputEntryIds = rawOutputLines.map((l) => l.entryId)
    const netSupplyRows = await db
      .select({
        entryId: journalLines.journalEntryId,
        netAmount: sql<string>`SUM(${journalLines.creditAmount})`,
      })
      .from(journalLines)
      .innerJoin(
        accounts,
        and(
          eq(accounts.id, journalLines.accountId),
          eq(accounts.type, 'revenue'),
          eq(accounts.businessId, businessId),
        ),
      )
      .where(inArray(journalLines.journalEntryId, outputEntryIds))
      .groupBy(journalLines.journalEntryId)

    for (const r of netSupplyRows) {
      netSupplyMap.set(r.entryId, round2(Number(r.netAmount)))
    }
  }

  // ── 6. Input VAT lines (debits to account 1101) ───────────────────────────
  const rawInputLines: RawVatLine[] = await db
    .select({
      entryId: journalEntries.id,
      entryDate: journalEntries.entryDate,
      reference: journalEntries.reference,
      description: journalEntries.description,
      sourceType: journalEntries.sourceType,
      vatAmount: journalLines.debitAmount,
    })
    .from(journalLines)
    .innerJoin(
      journalEntries,
      and(
        eq(journalEntries.id, journalLines.journalEntryId),
        eq(journalEntries.businessId, businessId),
        gte(journalEntries.entryDate, period.from),
        lte(journalEntries.entryDate, period.to),
        inArray(journalEntries.sourceType, ['expense', 'ai_recorded', 'grn']),
      ),
    )
    .where(eq(journalLines.accountId, inputVatAccount.id))
    .orderBy(journalEntries.entryDate)

  // ── 7. Net purchase per entry (expense debits in the same entry) ──────────
  const netPurchaseMap = new Map<string, number>()
  if (rawInputLines.length > 0) {
    const inputEntryIds = rawInputLines.map((l) => l.entryId)
    const netPurchaseRows = await db
      .select({
        entryId: journalLines.journalEntryId,
        netAmount: sql<string>`SUM(${journalLines.debitAmount})`,
      })
      .from(journalLines)
      .innerJoin(
        accounts,
        and(
          eq(accounts.id, journalLines.accountId),
          eq(accounts.type, 'expense'),
          eq(accounts.businessId, businessId),
        ),
      )
      .where(inArray(journalLines.journalEntryId, inputEntryIds))
      .groupBy(journalLines.journalEntryId)

    for (const r of netPurchaseRows) {
      netPurchaseMap.set(r.entryId, round2(Number(r.netAmount)))
    }
  }

  // ── 8. Build VatReportLines ───────────────────────────────────────────────
  const outputVatLines: VatReportLine[] = rawOutputLines.map((r) => ({
    entryDate: r.entryDate,
    reference: r.reference ?? '',
    description: r.description ?? '',
    netSupplyAmount: netSupplyMap.get(r.entryId) ?? 0,
    vatAmount: round2(Number(r.vatAmount)),
    sourceType: r.sourceType,
  }))

  const inputVatLines: VatReportLine[] = rawInputLines.map((r) => ({
    entryDate: r.entryDate,
    reference: r.reference ?? '',
    description: r.description ?? '',
    netSupplyAmount: netPurchaseMap.get(r.entryId) ?? 0, // netSupplyAmount holds net purchase for input lines
    vatAmount: round2(Number(r.vatAmount)),
    sourceType: r.sourceType,
  }))

  // ── 9. Compute totals ─────────────────────────────────────────────────────
  const totalOutputVat = round2(rawOutputLines.reduce((s, l) => s + Number(l.vatAmount), 0))
  const totalInputVat = round2(rawInputLines.reduce((s, l) => s + Number(l.vatAmount), 0))
  const totalNetSupply = round2(outputVatLines.reduce((s, l) => s + l.netSupplyAmount, 0))
  const totalNetPurchase = round2(inputVatLines.reduce((s, l) => s + l.netSupplyAmount, 0))

  return {
    period,
    vatRegistrationNumber: business.vatNumber ?? null,
    outputVat: {
      lines: outputVatLines,
      totalNetSupply,
      totalVat: totalOutputVat,
    },
    inputVat: {
      lines: inputVatLines,
      totalNetPurchase,
      totalVat: totalInputVat,
      graPurchasesNote: GRA_PURCHASES_NOTE,
    },
    netVatPayable: round2(totalOutputVat - totalInputVat),
  }
}
