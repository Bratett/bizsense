/**
 * Period types and pure helper functions — no DB imports.
 * Safe to import from both Server Components and Client Components.
 * engine.ts re-exports these; use this file directly in client components.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type PeriodParams =
  | { type: 'range'; from: string; to: string }   // ISO dates, inclusive
  | { type: 'asOf'; date: string }                // cumulative to this date

// ─── Period helpers ───────────────────────────────────────────────────────────

export function currentMonthPeriod(): PeriodParams {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10)
  return { type: 'range', from, to }
}

export function priorMonthPeriod(): PeriodParams {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    .toISOString()
    .slice(0, 10)
  const to = new Date(now.getFullYear(), now.getMonth(), 0)
    .toISOString()
    .slice(0, 10)
  return { type: 'range', from, to }
}

export function yearToDatePeriod(financialYearStartMonth: number = 1): PeriodParams {
  const now = new Date()
  let yearStart = now.getFullYear()
  if (now.getMonth() + 1 < financialYearStartMonth) yearStart -= 1
  const from = `${yearStart}-${String(financialYearStartMonth).padStart(2, '0')}-01`
  const to = now.toISOString().slice(0, 10)
  return { type: 'range', from, to }
}

export function quarterPeriod(year: number, quarter: 1 | 2 | 3 | 4): PeriodParams {
  const startMonth = (quarter - 1) * 3 + 1
  const endMonth = startMonth + 2
  const from = `${year}-${String(startMonth).padStart(2, '0')}-01`
  const lastDay = new Date(year, endMonth, 0).getDate()
  const to = `${year}-${String(endMonth).padStart(2, '0')}-${lastDay}`
  return { type: 'range', from, to }
}
