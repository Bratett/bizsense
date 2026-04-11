import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the engine so pl.ts does not need a real DB
vi.mock('../engine', () => ({
  getAccountBalances: vi.fn(),
}))

import { getAccountBalances } from '../engine'
import { getProfitAndLoss } from '../pl'
import type { AccountBalance } from '../engine'

// ─── Factory ──────────────────────────────────────────────────────────────────

function makeBalance(overrides: {
  accountType:  string
  accountCode?: string
  accountName?: string
  accountId?:   string
  netBalance?:  number
  totalDebits?: number
  totalCredits?: number
}): AccountBalance {
  const isDebitNormal = ['asset', 'cogs', 'expense'].includes(overrides.accountType)
  const netBalance    = overrides.netBalance ?? 0
  const totalDebits   = overrides.totalDebits  ?? (isDebitNormal ? netBalance : 0)
  const totalCredits  = overrides.totalCredits ?? (isDebitNormal ? 0 : netBalance)

  return {
    accountId:        overrides.accountId   ?? 'uuid-1',
    accountCode:      overrides.accountCode ?? '9999',
    accountName:      overrides.accountName ?? 'Test Account',
    accountType:      overrides.accountType,
    accountSubtype:   null,
    cashFlowActivity: 'operating',
    normalBalance:    isDebitNormal ? 'debit' : 'credit',
    totalDebits,
    totalCredits,
    netBalance,
  }
}

const JAN: { from: string; to: string } = { from: '2026-01-01', to: '2026-01-31' }

beforeEach(() => vi.resetAllMocks())

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getProfitAndLoss', () => {
  it('Test 1 — revenue total is sum of all revenue account netBalances', async () => {
    vi.mocked(getAccountBalances).mockResolvedValueOnce([
      makeBalance({ accountType: 'revenue', accountCode: '4001', netBalance: 500 }),
      makeBalance({ accountType: 'revenue', accountCode: '4002', netBalance: 300 }),
    ])

    const pl = await getProfitAndLoss('biz-1', JAN)

    expect(pl.revenue.total).toBe(800)
    expect(pl.revenue.lines).toHaveLength(2)
  })

  it('Test 2 — COGS total is sum of all cogs account netBalances', async () => {
    vi.mocked(getAccountBalances).mockResolvedValueOnce([
      makeBalance({ accountType: 'cogs', accountCode: '5001', netBalance: 200 }),
    ])

    const pl = await getProfitAndLoss('biz-1', JAN)

    expect(pl.cogs.total).toBe(200)
  })

  it('Test 3 — grossProfit = revenue - COGS', async () => {
    vi.mocked(getAccountBalances).mockResolvedValueOnce([
      makeBalance({ accountType: 'revenue', netBalance: 800 }),
      makeBalance({ accountType: 'cogs',    netBalance: 200 }),
    ])

    const pl = await getProfitAndLoss('biz-1', JAN)

    expect(pl.grossProfit).toBe(600)
  })

  it('Test 4 — netProfit = grossProfit - expenses', async () => {
    vi.mocked(getAccountBalances).mockResolvedValueOnce([
      makeBalance({ accountType: 'revenue', netBalance: 800 }),
      makeBalance({ accountType: 'cogs',    netBalance: 200 }),
      makeBalance({ accountType: 'expense', netBalance: 150 }),
    ])

    const pl = await getProfitAndLoss('biz-1', JAN)

    expect(pl.netProfit).toBe(450)
  })

  it('Test 5 — expense account with netBalance=0 is excluded from lines', async () => {
    vi.mocked(getAccountBalances).mockResolvedValueOnce([
      makeBalance({ accountType: 'expense', accountCode: '6001', netBalance: 100 }),
      makeBalance({ accountType: 'expense', accountCode: '6002', netBalance: 0   }),
    ])

    const pl = await getProfitAndLoss('biz-1', JAN)

    expect(pl.expenses.lines).toHaveLength(1)
    expect(pl.expenses.lines[0].accountCode).toBe('6001')
  })

  it('Test 6 — includePrior=true populates hasPrior and priorNetBalance', async () => {
    // Current period balances
    vi.mocked(getAccountBalances).mockResolvedValueOnce([
      makeBalance({ accountType: 'revenue', accountId: 'rev-1', netBalance: 800 }),
    ])
    // Prior period balances (recursive call)
    vi.mocked(getAccountBalances).mockResolvedValueOnce([
      makeBalance({ accountType: 'revenue', accountId: 'rev-1', netBalance: 600 }),
    ])

    const pl = await getProfitAndLoss('biz-1', JAN, true)

    expect(pl.hasPrior).toBe(true)
    expect(pl.revenue.priorTotal).toBe(600)
    expect(pl.revenue.lines[0].priorNetBalance).toBe(600)
  })

  it('Test 7 — FX gain account (e.g. code=4003) appears in revenue lines', async () => {
    vi.mocked(getAccountBalances).mockResolvedValueOnce([
      makeBalance({ accountType: 'revenue', accountCode: '4001', netBalance: 500 }),
      makeBalance({ accountType: 'revenue', accountCode: '4003', accountName: 'FX Gain / (Loss)', netBalance: 75 }),
    ])

    const pl = await getProfitAndLoss('biz-1', JAN)

    const fxLine = pl.revenue.lines.find(l => l.accountCode === '4003')
    expect(fxLine).toBeDefined()
    expect(fxLine?.netBalance).toBe(75)
    expect(pl.revenue.total).toBe(575)
  })

  it('Test 8 — expense account with negative netBalance (unusual) still appears in lines', async () => {
    // A negative netBalance on an expense account is unusual (e.g. refund exceeds spending)
    // It should appear in lines because netBalance !== 0
    vi.mocked(getAccountBalances).mockResolvedValueOnce([
      makeBalance({ accountType: 'expense', accountCode: '6005', netBalance: -50 }),
    ])

    const pl = await getProfitAndLoss('biz-1', JAN)

    expect(pl.expenses.lines).toHaveLength(1)
    expect(pl.expenses.lines[0].netBalance).toBe(-50)
  })
})
