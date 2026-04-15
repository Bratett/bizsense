import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Hoisted mock handles ─────────────────────────────────────────────────────

const { mockWhere, mockFrom, mockSelect, mockGetProfitAndLoss, mockGetFinancialYearStart } =
  vi.hoisted(() => {
    const mockWhere = vi.fn()
    const mockFrom = vi.fn(() => ({ where: mockWhere }))
    const mockSelect = vi.fn(() => ({ from: mockFrom }))
    const mockGetProfitAndLoss = vi.fn()
    const mockGetFinancialYearStart = vi.fn()
    return { mockWhere, mockFrom, mockSelect, mockGetProfitAndLoss, mockGetFinancialYearStart }
  })

vi.mock('@/db', () => ({
  db: { select: mockSelect },
}))

vi.mock('@/db/schema', () => ({
  businesses: {},
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
}))

vi.mock('../pl', () => ({
  getProfitAndLoss: mockGetProfitAndLoss,
}))

vi.mock('../balanceSheet', () => ({
  getFinancialYearStart: mockGetFinancialYearStart,
}))

import { getIncomeTaxEstimate } from '../incomeTax'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BIZ_ID = 'biz-1'
const AS_OF = '2026-12-31'
const YEAR_START = '2026-01-01'

const BUSINESS_JAN = { id: BIZ_ID, financialYearStart: '1' } // January FY

// ─── Reset ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockFrom.mockImplementation(() => ({ where: mockWhere }))
  mockSelect.mockImplementation(() => ({ from: mockFrom }))
  mockGetFinancialYearStart.mockReturnValue(YEAR_START)
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getIncomeTaxEstimate', () => {
  it('Test 5 — profitable year: estimatedTax = netProfit × 0.25', async () => {
    mockWhere.mockResolvedValueOnce([BUSINESS_JAN] as never)
    mockGetProfitAndLoss.mockResolvedValueOnce({ netProfit: 40_000 })

    const result = await getIncomeTaxEstimate(BIZ_ID, AS_OF)

    expect(result.estimatedTax).toBe(10_000) // 40000 × 0.25
    expect(result.annualNetProfit).toBe(40_000)
    expect(result.financialYear).toBe('2026')
  })

  it('Test 5b — fractional profit rounds to 2dp', async () => {
    mockWhere.mockResolvedValueOnce([BUSINESS_JAN] as never)
    mockGetProfitAndLoss.mockResolvedValueOnce({ netProfit: 1000.01 })

    const result = await getIncomeTaxEstimate(BIZ_ID, AS_OF)

    // 1000.01 × 0.25 = 250.0025 → rounded to 250.00
    expect(result.estimatedTax).toBe(250)
  })

  it('Test 6 — loss year: estimatedTax = 0', async () => {
    mockWhere.mockResolvedValueOnce([BUSINESS_JAN] as never)
    mockGetProfitAndLoss.mockResolvedValueOnce({ netProfit: -5_000 })

    const result = await getIncomeTaxEstimate(BIZ_ID, AS_OF)

    expect(result.estimatedTax).toBe(0)
    expect(result.annualNetProfit).toBe(-5_000)
  })

  it('Test 6b — break-even (netProfit = 0): estimatedTax = 0', async () => {
    mockWhere.mockResolvedValueOnce([BUSINESS_JAN] as never)
    mockGetProfitAndLoss.mockResolvedValueOnce({ netProfit: 0 })

    const result = await getIncomeTaxEstimate(BIZ_ID, AS_OF)

    expect(result.estimatedTax).toBe(0)
  })

  it('Test 7 — disclaimer is a non-empty string', async () => {
    mockWhere.mockResolvedValueOnce([BUSINESS_JAN] as never)
    mockGetProfitAndLoss.mockResolvedValueOnce({ netProfit: 10_000 })

    const result = await getIncomeTaxEstimate(BIZ_ID, AS_OF)

    expect(typeof result.disclaimer).toBe('string')
    expect(result.disclaimer.length).toBeGreaterThan(0)
  })

  it('Test 8 — getFinancialYearStart called with correct startMonth', async () => {
    const aprilBusiness = { id: BIZ_ID, financialYearStart: '4' }
    mockWhere.mockResolvedValueOnce([aprilBusiness] as never)
    mockGetProfitAndLoss.mockResolvedValueOnce({ netProfit: 20_000 })

    await getIncomeTaxEstimate(BIZ_ID, AS_OF)

    expect(mockGetFinancialYearStart).toHaveBeenCalledWith(AS_OF, 4)
  })

  it('Test 9 — missing business defaults financialYearStart to month 1', async () => {
    mockWhere.mockResolvedValueOnce([] as never) // no business found
    mockGetProfitAndLoss.mockResolvedValueOnce({ netProfit: 5_000 })

    await getIncomeTaxEstimate(BIZ_ID, AS_OF)

    expect(mockGetFinancialYearStart).toHaveBeenCalledWith(AS_OF, 1)
  })
})
