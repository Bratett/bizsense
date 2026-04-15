/**
 * PAYE computation engine — pure functions, no DB calls.
 *
 * Ghana GRA PAYE is a progressive marginal-rate tax applied to annual gross income.
 * Monthly computations annualise the gross, apply bands, then de-annualise.
 *
 * Journal entry balance proof for payroll approval:
 *   Dr  Salaries & Wages      = sum(totalCostToEmployer)
 *                             = sum((grossSalary − otherDeductions) + ssnitEmployer)
 *   Cr  SSNIT Payable         = sum(ssnitEmployee + ssnitEmployer)
 *   Cr  PAYE Payable          = sum(payeTax)
 *   Cr  Net Salaries Payable  = sum(netSalary)
 *                             = sum(grossSalary − ssnitEmployee − payeTax − otherDeductions)
 *
 * Proof Dr = Cr:
 *   Cr = ssnitEmployee + ssnitEmployer + payeTax + grossSalary − ssnitEmployee − payeTax − otherDeductions
 *      = grossSalary + ssnitEmployer − otherDeductions
 *      = (grossSalary − otherDeductions) + ssnitEmployer  ✓
 */

export type PayeBand = {
  lowerBound: number
  upperBound: number | null // null = no ceiling (highest bracket)
  rate: number // decimal, e.g. 0.175 for 17.5%
}

export type PayrollDeductions = {
  grossSalary: number
  ssnitEmployee: number // grossSalary × SSNIT_EMPLOYEE_RATE — deducted from employee pay
  ssnitEmployer: number // grossSalary × SSNIT_EMPLOYER_RATE — additional employer cost
  payeTax: number
  otherDeductions: number // manual adjustments (leave without pay, etc.)
  netSalary: number // grossSalary − ssnitEmployee − payeTax − otherDeductions
  totalCostToEmployer: number // (grossSalary − otherDeductions) + ssnitEmployer
}

// Statutory SSNIT rates — update via code change if GRA revises
export const SSNIT_EMPLOYEE_RATE = 0.055 // 5.5%
export const SSNIT_EMPLOYER_RATE = 0.13 // 13%

/**
 * Compute annual PAYE tax for a given annual gross salary.
 *
 * Applies progressive marginal rates: each portion of income within a band
 * is taxed at that band's rate only.
 *
 * @param annualGross - Annual gross salary in GHS (before any deductions)
 * @param bands       - PAYE bands (any order — will be sorted ascending)
 * @returns           - Annual PAYE tax amount, rounded to 2 dp
 */
export function computeAnnualPaye(annualGross: number, bands: PayeBand[]): number {
  if (annualGross <= 0) return 0

  const sorted = [...bands].sort((a, b) => a.lowerBound - b.lowerBound)

  let tax = 0

  for (const band of sorted) {
    if (annualGross <= band.lowerBound) break

    const bandCeiling = band.upperBound ?? Infinity
    const taxableInBand = Math.min(annualGross, bandCeiling) - band.lowerBound

    if (taxableInBand <= 0) continue

    tax += taxableInBand * band.rate
  }

  return Math.round(tax * 100) / 100
}

/**
 * Compute monthly PAYE from monthly gross.
 * Annualises the gross, applies bands, then de-annualises.
 */
export function computeMonthlyPaye(monthlyGross: number, bands: PayeBand[]): number {
  if (monthlyGross <= 0) return 0
  const annualPaye = computeAnnualPaye(monthlyGross * 12, bands)
  return Math.round((annualPaye / 12) * 100) / 100
}

/**
 * Compute all payroll deductions for a single staff member for one month.
 *
 * IMPORTANT: totalCostToEmployer uses (grossSalary − otherDeductions) as the
 * effective gross on the debit side. This is required for the payroll journal
 * entry to balance when otherDeductions > 0.
 */
export function computePayrollDeductions(
  grossSalary: number,
  bands: PayeBand[],
  otherDeductions = 0,
): PayrollDeductions {
  const ssnitEmployee = Math.round(grossSalary * SSNIT_EMPLOYEE_RATE * 100) / 100
  const ssnitEmployer = Math.round(grossSalary * SSNIT_EMPLOYER_RATE * 100) / 100
  const payeTax = computeMonthlyPaye(grossSalary, bands)
  const netSalary =
    Math.round((grossSalary - ssnitEmployee - payeTax - otherDeductions) * 100) / 100
  // Debit side: uses (gross - other) so that Dr = Cr when otherDeductions > 0
  const totalCostToEmployer =
    Math.round((grossSalary - otherDeductions + ssnitEmployer) * 100) / 100

  return {
    grossSalary,
    ssnitEmployee,
    ssnitEmployer,
    payeTax,
    otherDeductions,
    netSalary,
    totalCostToEmployer,
  }
}

/**
 * Verify that the payroll journal entry will balance across all lines.
 * Must return isBalanced = true before any journal entry is posted.
 *
 * debitTotal  = sum(totalCostToEmployer)
 * creditTotal = sum(ssnitEmployee + ssnitEmployer + payeTax + netSalary)
 */
export function verifyPayrollBalance(lines: PayrollDeductions[]): {
  debitTotal: number
  creditTotal: number
  isBalanced: boolean
} {
  const debitTotal = Math.round(
    lines.reduce((s, l) => s + l.totalCostToEmployer, 0) * 100,
  ) / 100
  const creditTotal = Math.round(
    lines.reduce((s, l) => s + l.ssnitEmployee + l.ssnitEmployer + l.payeTax + l.netSalary, 0) *
      100,
  ) / 100

  return {
    debitTotal,
    creditTotal,
    isBalanced: Math.abs(debitTotal - creditTotal) < 0.02, // 2-cent tolerance for rounding
  }
}
