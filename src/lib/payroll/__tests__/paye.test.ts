import { describe, it, expect } from 'vitest'
import {
  computeAnnualPaye,
  computeMonthlyPaye,
  computePayrollDeductions,
  verifyPayrollBalance,
  type PayeBand,
} from '../paye'

// Standard GRA 2024 annual PAYE bands used throughout tests
const DEFAULT_BANDS: PayeBand[] = [
  { lowerBound: 0, upperBound: 4380, rate: 0 },
  { lowerBound: 4380, upperBound: 5100, rate: 0.05 },
  { lowerBound: 5100, upperBound: 6420, rate: 0.1 },
  { lowerBound: 6420, upperBound: 47880, rate: 0.175 },
  { lowerBound: 47880, upperBound: 240000, rate: 0.25 },
  { lowerBound: 240000, upperBound: null, rate: 0.3 },
]

describe('computeAnnualPaye', () => {
  it('1. returns 0 for income below first threshold (GHS 3,000)', () => {
    expect(computeAnnualPaye(3000, DEFAULT_BANDS)).toBe(0)
  })

  it('2. taxes only the portion in the 5% band for GHS 4,500', () => {
    // (4500 - 4380) × 0.05 = 120 × 0.05 = 6.00
    expect(computeAnnualPaye(4500, DEFAULT_BANDS)).toBe(6.0)
  })

  it('3. spans 0%, 5%, and 10% bands for GHS 6,000', () => {
    // 0 + (5100 - 4380) × 0.05 + (6000 - 5100) × 0.10
    // = 0 + 720 × 0.05 + 900 × 0.10
    // = 0 + 36 + 90 = 126.00
    expect(computeAnnualPaye(6000, DEFAULT_BANDS)).toBe(126.0)
  })
})

describe('computeMonthlyPaye', () => {
  it('4. monthly gross GHS 2,500 (annual 30,000) — into 17.5% band', () => {
    // Annual 30,000
    // 0 + (5100-4380)×0.05 + (6420-5100)×0.10 + (30000-6420)×0.175
    // = 0 + 36 + 132 + 23580×0.175
    // = 0 + 36 + 132 + 4126.50 = 4294.50
    // Monthly = 4294.50 / 12 = 357.875 → 357.88
    expect(computeMonthlyPaye(2500, DEFAULT_BANDS)).toBe(357.88)
  })

  it('5. monthly gross GHS 500 (annual 6,000) — matches test 3 ÷ 12', () => {
    // Annual tax = 126.00; monthly = 126.00 / 12 = 10.50
    expect(computeMonthlyPaye(500, DEFAULT_BANDS)).toBe(10.5)
  })
})

describe('computePayrollDeductions', () => {
  it('6. grossSalary 2000 with zero otherDeductions', () => {
    const result = computePayrollDeductions(2000, DEFAULT_BANDS, 0)

    expect(result.grossSalary).toBe(2000)
    expect(result.ssnitEmployee).toBe(110) // 2000 × 0.055
    expect(result.ssnitEmployer).toBe(260) // 2000 × 0.13
    expect(result.otherDeductions).toBe(0)
    // payeTax = computeMonthlyPaye(2000) — annual 24000
    // 0 + 36 + 132 + (24000-6420)×0.175 / 12 = (0+36+132+3076.50)/12 = 3244.50/12 = 270.375 → 270.38
    expect(result.payeTax).toBe(270.38)
    expect(result.netSalary).toBe(
      Math.round((2000 - 110 - 270.38 - 0) * 100) / 100,
    ) // 1619.62
    expect(result.totalCostToEmployer).toBe(
      Math.round((2000 - 0 + 260) * 100) / 100,
    ) // 2260
  })
})

describe('verifyPayrollBalance', () => {
  it('7. multiple lines with otherDeductions=0 balance exactly', () => {
    const lines = [
      computePayrollDeductions(2000, DEFAULT_BANDS, 0),
      computePayrollDeductions(3000, DEFAULT_BANDS, 0),
      computePayrollDeductions(1500, DEFAULT_BANDS, 0),
    ]
    const { isBalanced, debitTotal, creditTotal } = verifyPayrollBalance(lines)
    expect(isBalanced).toBe(true)
    expect(Math.abs(debitTotal - creditTotal)).toBeLessThan(0.02)
  })

  it('8. single line with otherDeductions > 0 still balances', () => {
    // otherDeductions reduces both netSalary (credit) and totalCostToEmployer (debit)
    // by the same amount, so the entry stays balanced
    const line = computePayrollDeductions(2000, DEFAULT_BANDS, 200)
    const { isBalanced, debitTotal, creditTotal } = verifyPayrollBalance([line])

    expect(isBalanced).toBe(true)
    expect(Math.abs(debitTotal - creditTotal)).toBeLessThan(0.02)

    // Manual verification: totalCostToEmployer = (2000 - 200) + 2000×0.13 = 1800 + 260 = 2060
    expect(line.totalCostToEmployer).toBe(2060)
    // netSalary = 2000 - 110 - payeTax - 200
    expect(line.netSalary).toBe(
      Math.round((2000 - line.ssnitEmployee - line.payeTax - 200) * 100) / 100,
    )
  })
})
