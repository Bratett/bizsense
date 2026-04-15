import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { payrollRuns, payrollLines, staff } from '@/db/schema'

// ─── Types ────────────────────────────────────────────────────────────────────

export type PayeRemittanceLine = {
  staffId: string
  staffName: string
  tin: string | null
  grossSalary: number
  payeTax: number
}

export type PayeRemittanceReport = {
  period: { start: string; end: string }
  payrollRunId: string
  lines: PayeRemittanceLine[]
  totalGross: number
  totalPaye: number
  dueDate: string // last calendar day of the period month
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Build the PAYE remittance summary for a given payroll run.
 * GRA requires PAYE withheld in a month to be remitted by the last working
 * day of that same month. This approximates the due date as the last calendar
 * day of the pay-period month.
 *
 * @param businessId   - from server-side session, never from client
 * @param payrollRunId - the payroll run to summarise
 */
export async function getPayeRemittanceReport(
  businessId: string,
  payrollRunId: string,
): Promise<PayeRemittanceReport> {
  // ── 1. Fetch the payroll run ──────────────────────────────────────────────
  const runRows = await db
    .select()
    .from(payrollRuns)
    .where(and(eq(payrollRuns.id, payrollRunId), eq(payrollRuns.businessId, businessId)))

  const run = runRows[0]
  if (!run) throw new Error('Payroll run not found.')

  // ── 2. Fetch payroll lines joined to staff ────────────────────────────────
  const rows = await db
    .select({
      staffId: payrollLines.staffId,
      staffName: staff.fullName,
      tin: staff.tin,
      grossSalary: payrollLines.grossSalary,
      payeTax: payrollLines.payeTax,
    })
    .from(payrollLines)
    .innerJoin(staff, eq(staff.id, payrollLines.staffId))
    .where(eq(payrollLines.payrollRunId, payrollRunId))

  // ── 3. Build typed lines ──────────────────────────────────────────────────
  const lines: PayeRemittanceLine[] = rows.map((r) => ({
    staffId: r.staffId,
    staffName: r.staffName,
    tin: r.tin ?? null,
    grossSalary: Number(r.grossSalary),
    payeTax: Number(r.payeTax),
  }))

  // ── 4. Totals ─────────────────────────────────────────────────────────────
  const totalGross = Math.round(lines.reduce((s, l) => s + l.grossSalary, 0) * 100) / 100
  const totalPaye = Math.round(lines.reduce((s, l) => s + l.payeTax, 0) * 100) / 100

  // ── 5. Due date: last calendar day of the period month ────────────────────
  // new Date(year, month + 1, 0) = day 0 of next month = last day of this month
  const periodEnd = new Date(run.periodEnd + 'T00:00:00Z')
  const lastDay = new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth() + 1, 0))
  const dueDate = lastDay.toISOString().slice(0, 10)

  return {
    period: { start: run.periodStart, end: run.periodEnd },
    payrollRunId,
    lines,
    totalGross,
    totalPaye,
    dueDate,
  }
}
