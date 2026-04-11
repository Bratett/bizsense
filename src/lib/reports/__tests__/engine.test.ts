import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/db', () => ({
  db: { select: vi.fn() },
}))

import { db } from '@/db'
import {
  getAccountBalances,
  getSingleAccountBalance,
  yearToDatePeriod,
  type PeriodParams,
} from '../engine'
import { formatGhs } from '../../format'

// ─── Mock factory ─────────────────────────────────────────────────────────────
// Mocks the 7-step chain:
// db.select() → .from() → .leftJoin() → .leftJoin() → .where() → .groupBy() → .orderBy()

function mockEngine(rows: unknown[]) {
  const orderBy = vi.fn().mockResolvedValue(rows)
  const groupBy = vi.fn().mockReturnValue({ orderBy })
  const where = vi.fn().mockReturnValue({ groupBy })
  const join2 = vi.fn().mockReturnValue({ where })
  const join1 = vi.fn().mockReturnValue({ leftJoin: join2 })
  const from_ = vi.fn().mockReturnValue({ leftJoin: join1 })

  vi.mocked(db.select).mockReturnValueOnce({
    from: from_,
  } as unknown as ReturnType<typeof db.select>)

  return { from_, join1, join2, where, groupBy, orderBy }
}

// ─── Test data factory ────────────────────────────────────────────────────────

function makeRow(overrides: {
  accountType: string
  totalDebits?: string
  totalCredits?: string
  accountCode?: string
}) {
  return {
    accountId: 'uuid-1',
    accountCode: overrides.accountCode ?? '1001',
    accountName: 'Test Account',
    accountType: overrides.accountType,
    accountSubtype: null,
    cashFlowActivity: 'operating',
    totalDebits: overrides.totalDebits ?? '0',
    totalCredits: overrides.totalCredits ?? '0',
  }
}

const JAN_RANGE: PeriodParams = { type: 'range', from: '2026-01-01', to: '2026-01-31' }
const FEB_RANGE: PeriodParams = { type: 'range', from: '2026-02-01', to: '2026-02-28' }
const AS_OF_JAN: PeriodParams = { type: 'asOf', date: '2026-01-31' }

beforeEach(() => {
  vi.resetAllMocks()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getAccountBalances — sign convention', () => {
  it('Test 1 — revenue account (4001): credit-normal, netBalance = credits - debits', async () => {
    mockEngine([
      makeRow({
        accountType: 'revenue',
        accountCode: '4001',
        totalCredits: '500',
        totalDebits: '0',
      }),
    ])

    const result = await getAccountBalances('biz-1', JAN_RANGE)

    expect(result).toHaveLength(1)
    expect(result[0].totalCredits).toBe(500)
    expect(result[0].totalDebits).toBe(0)
    expect(result[0].netBalance).toBe(500)
    expect(result[0].normalBalance).toBe('credit')
  })

  it('Test 2 — expense account (6003): debit-normal, netBalance = debits - credits', async () => {
    mockEngine([
      makeRow({
        accountType: 'expense',
        accountCode: '6003',
        totalDebits: '80',
        totalCredits: '0',
      }),
    ])

    const result = await getAccountBalances('biz-1', JAN_RANGE)

    expect(result[0].totalDebits).toBe(80)
    expect(result[0].totalCredits).toBe(0)
    expect(result[0].netBalance).toBe(80)
    expect(result[0].normalBalance).toBe('debit')
  })

  it('Test 3 — asset account (1001) range: net movement = debits - credits', async () => {
    // 500 from sale (Dr Cash), 80 paid out (Cr Cash): net = 420
    mockEngine([
      makeRow({
        accountType: 'asset',
        accountCode: '1001',
        totalDebits: '500',
        totalCredits: '80',
      }),
    ])

    const result = await getAccountBalances('biz-1', JAN_RANGE)

    expect(result[0].totalDebits).toBe(500)
    expect(result[0].totalCredits).toBe(80)
    expect(result[0].netBalance).toBe(420)
    expect(result[0].normalBalance).toBe('debit')
  })

  it('Test 4 — asset account (1001) asOf mode: cumulative balance = 1000 + 500 - 80 = 1420', async () => {
    // Opening balance 1000, sale 500, utility 80
    mockEngine([
      makeRow({
        accountType: 'asset',
        accountCode: '1001',
        totalDebits: '1500',
        totalCredits: '80',
      }),
    ])

    const result = await getAccountBalances('biz-1', AS_OF_JAN)

    expect(result[0].netBalance).toBe(1420)
  })
})

describe('getAccountBalances — zero balances and filtering', () => {
  it('Test 5 — period with no entries: rows still returned, netBalance = 0', async () => {
    mockEngine([
      makeRow({ accountType: 'asset', accountCode: '1001', totalDebits: '0', totalCredits: '0' }),
      makeRow({ accountType: 'revenue', accountCode: '4001', totalDebits: '0', totalCredits: '0' }),
    ])

    const result = await getAccountBalances('biz-1', FEB_RANGE)

    expect(result).toHaveLength(2)
    expect(result[0].netBalance).toBe(0)
    expect(result[1].netBalance).toBe(0)
  })

  it('Test 6 — accountCodes filter: returns exactly the rows the DB provides', async () => {
    mockEngine([
      makeRow({
        accountType: 'asset',
        accountCode: '1001',
        totalDebits: '1000',
        totalCredits: '0',
      }),
      makeRow({
        accountType: 'revenue',
        accountCode: '4001',
        totalDebits: '0',
        totalCredits: '500',
      }),
    ])

    const result = await getAccountBalances('biz-1', JAN_RANGE, ['1001', '4001'])

    expect(result).toHaveLength(2)
    expect(result.map((r) => r.accountCode)).toEqual(['1001', '4001'])
  })
})

describe('getSingleAccountBalance', () => {
  it('Test 7a — returns correct netBalance for existing account', async () => {
    mockEngine([
      makeRow({
        accountType: 'asset',
        accountCode: '1001',
        totalDebits: '750',
        totalCredits: '200',
      }),
    ])

    const balance = await getSingleAccountBalance('biz-1', '1001', JAN_RANGE)

    expect(balance).toBe(550)
  })

  it('Test 7b — returns 0 when account has no rows (missing account)', async () => {
    mockEngine([]) // DB returns empty — account not found

    const balance = await getSingleAccountBalance('biz-1', '9999', JAN_RANGE)

    expect(balance).toBe(0)
  })
})

describe('yearToDatePeriod', () => {
  it('Test 8 — financialYearStartMonth=1: from = Jan 1 of current year, to = today', () => {
    const period = yearToDatePeriod(1)

    expect(period.type).toBe('range')
    if (period.type !== 'range') return

    const today = new Date().toISOString().slice(0, 10)
    const currentYear = new Date().getFullYear()

    expect(period.from).toBe(`${currentYear}-01-01`)
    expect(period.to).toBe(today)
  })
})

describe('cogs account type — sign convention', () => {
  it('cogs is debit-normal like expense', async () => {
    mockEngine([makeRow({ accountType: 'cogs', totalDebits: '200', totalCredits: '0' })])

    const result = await getAccountBalances('biz-1', JAN_RANGE)

    expect(result[0].normalBalance).toBe('debit')
    expect(result[0].netBalance).toBe(200)
  })
})

describe('numeric precision', () => {
  it('rounds totalDebits and totalCredits to 2 decimal places', async () => {
    mockEngine([makeRow({ accountType: 'asset', totalDebits: '1000.005', totalCredits: '0' })])

    const result = await getAccountBalances('biz-1', JAN_RANGE)

    expect(result[0].totalDebits).toBe(1000.01)
    expect(result[0].netBalance).toBe(1000.01)
  })
})

describe('formatGhs', () => {
  it('Test 9 — positive amount: GHS prefix, 2dp, comma thousands', () => {
    expect(formatGhs(1234.56)).toBe('GHS 1,234.56')
  })

  it('Test 10 — negative amount: parentheses, not minus sign', () => {
    expect(formatGhs(-234.56)).toBe('(GHS 234.56)')
  })

  it('Test 11 — zero: GHS 0.00', () => {
    expect(formatGhs(0)).toBe('GHS 0.00')
  })
})
