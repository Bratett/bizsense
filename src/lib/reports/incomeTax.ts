import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { businesses } from '@/db/schema'
import { getFinancialYearStart } from './balanceSheet'
import { getProfitAndLoss } from './pl'

// ─── Constants ────────────────────────────────────────────────────────────────

const GHANA_CIT_RATE = 0.25 // 25% corporate income tax (GRA standard rate)

// ─── Types ────────────────────────────────────────────────────────────────────

export type IncomeTaxEstimate = {
  financialYear: string // e.g. "2026"
  annualNetProfit: number // P&L netProfit for the full financial year to date
  estimatedTax: number // netProfit × 0.25 (0 if loss year)
  disclaimer: string
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Estimate corporate income tax liability for the financial year to date.
 * This is a rough awareness figure — not an authoritative tax assessment.
 *
 * @param businessId - from server-side session, never from client
 * @param asOfDate   - "YYYY-MM-DD"; determines the YTD period
 */
export async function getIncomeTaxEstimate(
  businessId: string,
  asOfDate: string,
): Promise<IncomeTaxEstimate> {
  // ── 1. Fetch business for financial year start ────────────────────────────
  const bizRows = await db.select().from(businesses).where(eq(businesses.id, businessId))
  const business = bizRows[0]

  // financialYearStart is stored as text (e.g. "1" for January, "4" for April)
  const startMonth = Number(business?.financialYearStart ?? '1')

  // ── 2. Derive YTD period ──────────────────────────────────────────────────
  const yearStart = getFinancialYearStart(asOfDate, startMonth)

  // ── 3. Compute P&L for the YTD period ────────────────────────────────────
  const pl = await getProfitAndLoss(businessId, { from: yearStart, to: asOfDate })

  // ── 4. Estimate tax (zero for a loss year) ────────────────────────────────
  const estimatedTax =
    pl.netProfit > 0 ? Math.round(pl.netProfit * GHANA_CIT_RATE * 100) / 100 : 0

  const [financialYear] = asOfDate.split('-')

  return {
    financialYear,
    annualNetProfit: pl.netProfit,
    estimatedTax,
    disclaimer:
      `This is an estimate only, based on your recorded income and expenses to date. ` +
      `Actual corporate income tax may differ depending on allowable deductions, tax adjustments, ` +
      `and GRA assessments. Consult a qualified tax professional before filing.`,
  }
}
