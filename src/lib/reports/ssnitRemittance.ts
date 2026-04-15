import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { payrollRuns, payrollLines, staff } from '@/db/schema'

// ─── Types ────────────────────────────────────────────────────────────────────

export type SsnitRemittanceLine = {
  staffId: string
  staffName: string
  ssnitNumber: string | null
  grossSalary: number
  ssnitEmployee: number // 5.5% — deducted from employee
  ssnitEmployer: number // 13% — additional employer cost
  totalSsnit: number // both portions — what gets remitted to SSNIT
}

export type SsnitRemittanceReport = {
  period: { start: string; end: string }
  payrollRunId: string
  lines: SsnitRemittanceLine[]
  totalGross: number
  totalEmployee: number
  totalEmployer: number
  totalRemittable: number // totalEmployee + totalEmployer
  dueDate: string // 15th of the following month
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Build the SSNIT remittance summary for a given payroll run.
 * SSNIT payment is due by the 15th of the month following the pay period.
 *
 * @param businessId   - from server-side session, never from client
 * @param payrollRunId - the payroll run to summarise
 */
export async function getSsnitRemittanceReport(
  businessId: string,
  payrollRunId: string,
): Promise<SsnitRemittanceReport> {
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
      ssnitNumber: staff.ssnitNumber,
      grossSalary: payrollLines.grossSalary,
      ssnitEmployee: payrollLines.ssnitEmployee,
      ssnitEmployer: payrollLines.ssnitEmployer,
    })
    .from(payrollLines)
    .innerJoin(staff, eq(staff.id, payrollLines.staffId))
    .where(eq(payrollLines.payrollRunId, payrollRunId))

  // ── 3. Build typed lines (convert numeric strings at map time) ────────────
  const lines: SsnitRemittanceLine[] = rows.map((r) => {
    const emp = Number(r.ssnitEmployee)
    const empr = Number(r.ssnitEmployer)
    return {
      staffId: r.staffId,
      staffName: r.staffName,
      ssnitNumber: r.ssnitNumber ?? null,
      grossSalary: Number(r.grossSalary),
      ssnitEmployee: emp,
      ssnitEmployer: empr,
      totalSsnit: Math.round((emp + empr) * 100) / 100,
    }
  })

  // ── 4. Totals ─────────────────────────────────────────────────────────────
  const totalGross = Math.round(lines.reduce((s, l) => s + l.grossSalary, 0) * 100) / 100
  const totalEmployee = Math.round(lines.reduce((s, l) => s + l.ssnitEmployee, 0) * 100) / 100
  const totalEmployer = Math.round(lines.reduce((s, l) => s + l.ssnitEmployer, 0) * 100) / 100
  const totalRemittable = Math.round((totalEmployee + totalEmployer) * 100) / 100

  // ── 5. Due date: 15th of month following periodEnd ────────────────────────
  const periodEnd = new Date(run.periodEnd + 'T00:00:00Z')
  const dueMonth = new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth() + 1, 15))
  const dueDate = dueMonth.toISOString().slice(0, 10)

  return {
    period: { start: run.periodStart, end: run.periodEnd },
    payrollRunId,
    lines,
    totalGross,
    totalEmployee,
    totalEmployer,
    totalRemittable,
    dueDate,
  }
}
