import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../engine', () => ({
  getAccountBalances: vi.fn(),
}))

import { getAccountBalances } from '../engine'
import { getTrialBalance } from '../trialBalance'
import type { AccountBalance } from '../engine'

// ─── Factory ──────────────────────────────────────────────────────────────────

function makeBalance(overrides: {
  accountType:   string
  accountCode?:  string
  accountId?:    string
  totalDebits?:  number
  totalCredits?: number
}): AccountBalance {
  const isDebitNormal = ['asset', 'cogs', 'expense'].includes(overrides.accountType)
  const dr = overrides.totalDebits  ?? 0
  const cr = overrides.totalCredits ?? 0
  const netBalance = isDebitNormal ? dr - cr : cr - dr

  return {
    accountId:        overrides.accountId   ?? 'uuid-1',
    accountCode:      overrides.accountCode ?? '1001',
    accountName:      'Test Account',
    accountType:      overrides.accountType,
    accountSubtype:   null,
    cashFlowActivity: 'operating',
    normalBalance:    isDebitNormal ? 'debit' : 'credit',
    totalDebits:      dr,
    totalCredits:     cr,
    netBalance,
  }
}

beforeEach(() => vi.resetAllMocks())

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getTrialBalance', () => {
  it('Test 9 — isBalanced=true when SUM(debits) === SUM(credits)', async () => {
    // Asset 1000 Dr, 200 Cr  → netBalance = 800 (debit-normal)
    // Revenue 0 Dr, 800 Cr   → netBalance = 800 (credit-normal)
    // Total debits: 1000+0 = 1000; Total credits: 200+800 = 1000
    vi.mocked(getAccountBalances).mockResolvedValueOnce([
      makeBalance({ accountType: 'asset',   accountCode: '1001', totalDebits: 1000, totalCredits: 200 }),
      makeBalance({ accountType: 'revenue', accountCode: '4001', totalDebits: 0,    totalCredits: 800 }),
    ])

    const tb = await getTrialBalance('biz-1', '2026-01-31')

    expect(tb.isBalanced).toBe(true)
    expect(tb.imbalanceAmount).toBe(0)
  })

  it('Test 10 — totalDebits === totalCredits when balanced', async () => {
    vi.mocked(getAccountBalances).mockResolvedValueOnce([
      makeBalance({ accountType: 'asset',   accountCode: '1001', totalDebits: 500, totalCredits: 100 }),
      makeBalance({ accountType: 'revenue', accountCode: '4001', totalDebits: 0,   totalCredits: 400 }),
    ])

    const tb = await getTrialBalance('biz-1', '2026-01-31')

    expect(tb.totalDebits).toBe(500)
    expect(tb.totalCredits).toBe(500)
    expect(tb.totalDebits).toBe(tb.totalCredits)
  })

  it('Test 11 — isBalanced=false and imbalanceAmount>0 when debits exceed credits by 50', async () => {
    // Deliberately inject an imbalanced entry: debits 150, credits 100
    vi.mocked(getAccountBalances).mockResolvedValueOnce([
      makeBalance({ accountType: 'asset',   accountCode: '1001', totalDebits: 150, totalCredits: 0   }),
      makeBalance({ accountType: 'revenue', accountCode: '4001', totalDebits: 0,   totalCredits: 100 }),
    ])

    const tb = await getTrialBalance('biz-1', '2026-01-31')

    expect(tb.isBalanced).toBe(false)
    expect(tb.imbalanceAmount).toBe(50)
    expect(tb.totalDebits).toBe(150)
    expect(tb.totalCredits).toBe(100)
  })

  it('Test 12 — zero-balance accounts ARE included in lines (no filtering)', async () => {
    vi.mocked(getAccountBalances).mockResolvedValueOnce([
      makeBalance({ accountType: 'asset',   accountCode: '1001', totalDebits: 500, totalCredits: 0 }),
      makeBalance({ accountType: 'expense', accountCode: '6001', totalDebits: 0,   totalCredits: 0 }),
      makeBalance({ accountType: 'revenue', accountCode: '4001', totalDebits: 0,   totalCredits: 500 }),
    ])

    const tb = await getTrialBalance('biz-1', '2026-01-31')

    // All 3 accounts must appear, including the zero-balance expense account
    expect(tb.lines).toHaveLength(3)
    const zeroline = tb.lines.find(l => l.accountCode === '6001')
    expect(zeroline).toBeDefined()
    expect(zeroline?.cumulativeDebits).toBe(0)
    expect(zeroline?.cumulativeCredits).toBe(0)
  })
})
