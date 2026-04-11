import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock both dependencies so no real DB is needed
vi.mock('../engine', () => ({
  getAccountBalances: vi.fn(),
}))
vi.mock('../pl', () => ({
  getProfitAndLoss: vi.fn(),
}))

import { getAccountBalances } from '../engine'
import { getProfitAndLoss } from '../pl'
import { getBalanceSheet, getFinancialYearStart } from '../balanceSheet'
import type { AccountBalance } from '../engine'

// ─── Factory ──────────────────────────────────────────────────────────────────

function makeBalance(overrides: {
  accountId?: string
  accountCode: string
  accountName?: string
  accountType: string
  accountSubtype?: string | null
  netBalance?: number
  cashFlowActivity?: string | null
}): AccountBalance {
  const isDebitNormal = ['asset', 'cogs', 'expense'].includes(overrides.accountType)
  const netBalance = overrides.netBalance ?? 0
  const totalDebits = isDebitNormal ? netBalance : 0
  const totalCredits = isDebitNormal ? 0 : netBalance

  return {
    accountId: overrides.accountId ?? 'uuid-' + overrides.accountCode,
    accountCode: overrides.accountCode,
    accountName: overrides.accountName ?? 'Account ' + overrides.accountCode,
    accountType: overrides.accountType,
    accountSubtype: overrides.accountSubtype ?? null,
    cashFlowActivity: overrides.cashFlowActivity ?? 'operating',
    normalBalance: isDebitNormal ? 'debit' : 'credit',
    totalDebits,
    totalCredits,
    netBalance,
  }
}

// ─── Shared seed ──────────────────────────────────────────────────────────────
//
// Accounting model:
//   Dr Cash (1001)    1000   Cr Equity (3001)   1000   ← opening balance
//   Dr Cash (1001)     500   Cr Revenue (4001)    500   ← sale
//   Dr Expense (6001)  200   Cr Cash (1001)       200   ← expense
//   Dr FA (1500)       300   Cr Cash (1001)       300   ← capital purchase
//
// Balance sheet at this point:
//   Cash = 1000 + 500 - 200 - 300 = 1000
//   FA   = 300
//   Total assets = 1300
//   Equity (capital) = 1000
//   YTD profit = 500 (revenue) - 200 (expense) = 300
//   Total equity = 1300
//   ∴ Assets (1300) = Equity (1300) — balanced ✓

const BALANCED_BALANCES: AccountBalance[] = [
  makeBalance({
    accountCode: '1001',
    accountType: 'asset',
    accountSubtype: 'current_asset',
    netBalance: 1000,
  }),
  makeBalance({
    accountCode: '1500',
    accountType: 'asset',
    accountSubtype: 'fixed_asset',
    netBalance: 300,
  }),
  makeBalance({ accountCode: '1510', accountType: 'asset', accountSubtype: null, netBalance: 0 }),
  makeBalance({
    accountCode: '3001',
    accountType: 'equity',
    accountSubtype: null,
    netBalance: 1000,
  }),
]

const YTD_PROFIT = {
  netProfit: 300,
  period: { from: '2026-01-01', to: '2026-12-31' },
  revenue: { lines: [], total: 500 },
  cogs: { lines: [], total: 0 },
  grossProfit: 500,
  grossMarginPct: 100,
  expenses: { lines: [], total: 200 },
  hasPrior: false,
}

const AS_OF = '2026-12-31'
const BIZ = 'biz-1'
const FY_MONTH = 1 // January start

beforeEach(() => {
  vi.resetAllMocks()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getBalanceSheet', () => {
  it('Test 1 — isBalanced = true with clean seed data', async () => {
    vi.mocked(getAccountBalances).mockResolvedValueOnce(BALANCED_BALANCES)
    vi.mocked(getProfitAndLoss).mockResolvedValueOnce(YTD_PROFIT)

    const bs = await getBalanceSheet(BIZ, AS_OF, FY_MONTH)

    expect(bs.isBalanced).toBe(true)
    expect(bs.imbalanceAmount).toBe(0)
  })

  it('Test 2 — totalAssets = totalLiabilitiesAndEquity', async () => {
    vi.mocked(getAccountBalances).mockResolvedValueOnce(BALANCED_BALANCES)
    vi.mocked(getProfitAndLoss).mockResolvedValueOnce(YTD_PROFIT)

    const bs = await getBalanceSheet(BIZ, AS_OF, FY_MONTH)

    expect(bs.assets.totalAssets).toBe(bs.totalLiabilitiesAndEquity)
  })

  it('Test 3 — currentPeriodProfit = YTD netProfit from P&L (300)', async () => {
    vi.mocked(getAccountBalances).mockResolvedValueOnce(BALANCED_BALANCES)
    vi.mocked(getProfitAndLoss).mockResolvedValueOnce(YTD_PROFIT)

    const bs = await getBalanceSheet(BIZ, AS_OF, FY_MONTH)

    expect(bs.equity.currentPeriodProfit).toBe(300)
  })

  it('Test 4 — fixedAssets.netBookValue = 300 (cost=300, accumulatedDepreciation=0)', async () => {
    vi.mocked(getAccountBalances).mockResolvedValueOnce(BALANCED_BALANCES)
    vi.mocked(getProfitAndLoss).mockResolvedValueOnce(YTD_PROFIT)

    const bs = await getBalanceSheet(BIZ, AS_OF, FY_MONTH)

    expect(bs.assets.fixedAssets.cost).toBe(300)
    expect(bs.assets.fixedAssets.accumulatedDepreciation).toBe(0)
    expect(bs.assets.fixedAssets.netBookValue).toBe(300)
  })

  it('Test 5 — cash account (1001) netBalance = 1000 in current assets', async () => {
    vi.mocked(getAccountBalances).mockResolvedValueOnce(BALANCED_BALANCES)
    vi.mocked(getProfitAndLoss).mockResolvedValueOnce(YTD_PROFIT)

    const bs = await getBalanceSheet(BIZ, AS_OF, FY_MONTH)

    const cash = bs.assets.currentAssets.find((a) => a.accountCode === '1001')
    expect(cash?.netBalance).toBe(1000)
  })

  it('Test 6 — deliberately imbalanced data → isBalanced=false, imbalanceAmount>0', async () => {
    // Add an extra liability of 500 — makes L+E exceed Assets by 500
    const imbalancedBalances: AccountBalance[] = [
      ...BALANCED_BALANCES,
      makeBalance({
        accountCode: '2099',
        accountType: 'liability',
        accountSubtype: 'current_liability',
        netBalance: 500,
      }),
    ]
    vi.mocked(getAccountBalances).mockResolvedValueOnce(imbalancedBalances)
    vi.mocked(getProfitAndLoss).mockResolvedValueOnce(YTD_PROFIT)

    const bs = await getBalanceSheet(BIZ, AS_OF, FY_MONTH)

    expect(bs.isBalanced).toBe(false)
    expect(bs.imbalanceAmount).toBeGreaterThan(0)
    expect(bs.imbalanceAmount).toBeCloseTo(500, 1)
  })
})

// ─── getFinancialYearStart unit tests ─────────────────────────────────────────

describe('getFinancialYearStart', () => {
  it('Jan start — asOf in same calendar year returns Jan 1 of that year', () => {
    expect(getFinancialYearStart('2026-06-15', 1)).toBe('2026-01-01')
  })

  it('Apr start — asOf in May (after start) returns Apr 1 of same year', () => {
    expect(getFinancialYearStart('2026-05-01', 4)).toBe('2026-04-01')
  })

  it('Apr start — asOf in March (before start) returns Apr 1 of prior year', () => {
    expect(getFinancialYearStart('2026-03-15', 4)).toBe('2025-04-01')
  })

  it('asOf exactly on start date → same year', () => {
    expect(getFinancialYearStart('2026-04-01', 4)).toBe('2026-04-01')
  })
})
