import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the DB for the two direct queries in getCashFlowStatement
vi.mock('@/db', () => ({
  db: { select: vi.fn() },
}))
// Mock getAccountBalances for opening/closing cash balance calls
vi.mock('../engine', () => ({
  getAccountBalances: vi.fn(),
}))

import { db } from '@/db'
import { getAccountBalances } from '../engine'
import { getCashFlowStatement } from '../cashFlow'
import type { AccountBalance } from '../engine'

// ─── Mock chain factories ─────────────────────────────────────────────────────

/**
 * Query 1: select → from → innerJoin(accounts) → innerJoin(journalEntries) → where
 * Terminates at .where(), returns Promise<rows>.
 */
function mockQ1(rows: unknown[]) {
  const where_ = vi.fn().mockResolvedValue(rows)
  const ijEntry_ = vi.fn().mockReturnValue({ where: where_ })
  const ijAcct_ = vi.fn().mockReturnValue({ innerJoin: ijEntry_ })
  const from_ = vi.fn().mockReturnValue({ innerJoin: ijAcct_ })
  vi.mocked(db.select).mockReturnValueOnce({
    from: from_,
  } as unknown as ReturnType<typeof db.select>)
}

/**
 * Query 2: select → from → innerJoin(accounts) → innerJoin(journalEntries) → where → orderBy
 * Terminates at .orderBy(), returns Promise<rows>.
 */
function mockQ2(rows: unknown[]) {
  const orderBy_ = vi.fn().mockResolvedValue(rows)
  const where_ = vi.fn().mockReturnValue({ orderBy: orderBy_ })
  const ijEntry_ = vi.fn().mockReturnValue({ where: where_ })
  const ijAcct_ = vi.fn().mockReturnValue({ innerJoin: ijEntry_ })
  const from_ = vi.fn().mockReturnValue({ innerJoin: ijAcct_ })
  vi.mocked(db.select).mockReturnValueOnce({
    from: from_,
  } as unknown as ReturnType<typeof db.select>)
}

// ─── AccountBalance factory ────────────────────────────────────────────────────

function makeAccountBalance(code: string, netBalance: number): AccountBalance {
  return {
    accountId: 'id-' + code,
    accountCode: code,
    accountName: 'Account ' + code,
    accountType: 'asset',
    accountSubtype: 'current_asset',
    cashFlowActivity: 'operating',
    normalBalance: 'debit',
    totalDebits: netBalance,
    totalCredits: 0,
    netBalance,
  }
}

// ─── Seed line rows ───────────────────────────────────────────────────────────
//
// Journal entries in the test period:
//
//   e1 (opening_balance): Dr Cash 1001  1000 / Cr Equity 3001  1000  → financing +1000
//   e2 (order/sale):      Dr Cash 1001   500 / Cr Revenue 4001   500  → operating  +500
//   e3 (expense):         Dr Expense 6001 200 / Cr Cash 1001    200  → operating  -200
//   e4 (manual/capital):  Dr FA 1500     300 / Cr Cash 1001    300  → investing  -300
//
// Expected:
//   operating.netAmount = +300
//   investing.netAmount = -300
//   financing.netAmount = +1000
//   netChange           = +1000
//   openingCash (before period) = 0
//   closingCash (ledger direct) = 1000

type LineRow = {
  lineId: string
  entryId: string
  entryDate: string
  entryDesc: string | null
  sourceType: string
  debitAmount: string
  creditAmount: string
  accountCode: string
  accountName: string
  accountType: string
  cashFlowActivity: string | null
}

const ENTRY_IDS: { entryId: string }[] = [
  { entryId: 'e1' },
  { entryId: 'e2' },
  { entryId: 'e3' },
  { entryId: 'e4' },
]

const ALL_LINES: LineRow[] = [
  // e1: Opening balance
  {
    lineId: 'l1',
    entryId: 'e1',
    entryDate: '2026-01-01',
    entryDesc: null,
    sourceType: 'opening_balance',
    debitAmount: '1000',
    creditAmount: '0',
    accountCode: '1001',
    accountName: 'Cash',
    accountType: 'asset',
    cashFlowActivity: null,
  },
  {
    lineId: 'l2',
    entryId: 'e1',
    entryDate: '2026-01-01',
    entryDesc: null,
    sourceType: 'opening_balance',
    debitAmount: '0',
    creditAmount: '1000',
    accountCode: '3001',
    accountName: 'Capital',
    accountType: 'equity',
    cashFlowActivity: 'financing',
  },
  // e2: Sale
  {
    lineId: 'l3',
    entryId: 'e2',
    entryDate: '2026-01-05',
    entryDesc: 'Customer Sale',
    sourceType: 'order',
    debitAmount: '500',
    creditAmount: '0',
    accountCode: '1001',
    accountName: 'Cash',
    accountType: 'asset',
    cashFlowActivity: null,
  },
  {
    lineId: 'l4',
    entryId: 'e2',
    entryDate: '2026-01-05',
    entryDesc: 'Customer Sale',
    sourceType: 'order',
    debitAmount: '0',
    creditAmount: '500',
    accountCode: '4001',
    accountName: 'Revenue',
    accountType: 'revenue',
    cashFlowActivity: 'operating',
  },
  // e3: Expense (cash credit)
  {
    lineId: 'l5',
    entryId: 'e3',
    entryDate: '2026-01-10',
    entryDesc: 'Office Supplies',
    sourceType: 'expense',
    debitAmount: '200',
    creditAmount: '0',
    accountCode: '6001',
    accountName: 'Expense',
    accountType: 'expense',
    cashFlowActivity: 'operating',
  },
  {
    lineId: 'l6',
    entryId: 'e3',
    entryDate: '2026-01-10',
    entryDesc: 'Office Supplies',
    sourceType: 'expense',
    debitAmount: '0',
    creditAmount: '200',
    accountCode: '1001',
    accountName: 'Cash',
    accountType: 'asset',
    cashFlowActivity: null,
  },
  // e4: Capital purchase
  {
    lineId: 'l7',
    entryId: 'e4',
    entryDate: '2026-01-15',
    entryDesc: null,
    sourceType: 'manual',
    debitAmount: '300',
    creditAmount: '0',
    accountCode: '1500',
    accountName: 'Fixed Assets',
    accountType: 'asset',
    cashFlowActivity: 'investing',
  },
  {
    lineId: 'l8',
    entryId: 'e4',
    entryDate: '2026-01-15',
    entryDesc: null,
    sourceType: 'manual',
    debitAmount: '0',
    creditAmount: '300',
    accountCode: '1001',
    accountName: 'Cash',
    accountType: 'asset',
    cashFlowActivity: null,
  },
]

const PERIOD = { type: 'range' as const, from: '2026-01-01', to: '2026-01-31' }
const BIZ = 'biz-1'

beforeEach(() => vi.resetAllMocks())

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getCashFlowStatement', () => {
  it('Test 7 — operating.netAmount = +300 (sale +500, expense -200)', async () => {
    mockQ1(ENTRY_IDS)
    mockQ2(ALL_LINES)
    vi.mocked(getAccountBalances)
      .mockResolvedValueOnce([makeAccountBalance('1001', 0)]) // opening
      .mockResolvedValueOnce([makeAccountBalance('1001', 1000)]) // closing

    const cf = await getCashFlowStatement(BIZ, PERIOD)

    expect(cf.operating.netAmount).toBe(300)
  })

  it('Test 8 — investing.netAmount = -300 (capital purchase)', async () => {
    mockQ1(ENTRY_IDS)
    mockQ2(ALL_LINES)
    vi.mocked(getAccountBalances)
      .mockResolvedValueOnce([makeAccountBalance('1001', 0)])
      .mockResolvedValueOnce([makeAccountBalance('1001', 1000)])

    const cf = await getCashFlowStatement(BIZ, PERIOD)

    expect(cf.investing.netAmount).toBe(-300)
  })

  it('Test 9 — openingCashBalance + netChange = closingCashBalance (arithmetic)', async () => {
    mockQ1(ENTRY_IDS)
    mockQ2(ALL_LINES)
    vi.mocked(getAccountBalances)
      .mockResolvedValueOnce([makeAccountBalance('1001', 0)])
      .mockResolvedValueOnce([makeAccountBalance('1001', 1000)])

    const cf = await getCashFlowStatement(BIZ, PERIOD)

    expect(cf.openingCashBalance + cf.netChange).toBeCloseTo(cf.closingCashBalance, 2)
  })

  it('Test 10 — closingCashBalance matches Balance Sheet cash total: isReconciled=true', async () => {
    mockQ1(ENTRY_IDS)
    mockQ2(ALL_LINES)
    vi.mocked(getAccountBalances)
      .mockResolvedValueOnce([makeAccountBalance('1001', 0)])
      .mockResolvedValueOnce([makeAccountBalance('1001', 1000)])

    const cf = await getCashFlowStatement(BIZ, PERIOD)

    // closingCashBalance (arithmetic) = 0 + 1000 = 1000
    // closingCashCrossCheck (ledger)  = 1000
    expect(cf.closingCashBalance).toBe(1000)
    expect(cf.closingCashCrossCheck).toBe(1000)
    expect(cf.isReconciled).toBe(true)
  })

  it('Test 11 — account with null cashFlowActivity → unclassifiedAmount>0, isReconciled=false', async () => {
    // Add entry e5: Dr Cash 1001 +100 / Cr "SomeAcct" with null cashFlowActivity
    // This cash movement cannot be classified → unclassifiedAmount = 100
    // The ledger closing = 1100 (includes e5) but statement only accounts for 1000 → not reconciled
    const entryIdsWithE5 = [...ENTRY_IDS, { entryId: 'e5' }]
    const allLinesWithE5: LineRow[] = [
      ...ALL_LINES,
      {
        lineId: 'l9',
        entryId: 'e5',
        entryDate: '2026-01-20',
        entryDesc: null,
        sourceType: 'manual',
        debitAmount: '100',
        creditAmount: '0',
        accountCode: '1001',
        accountName: 'Cash',
        accountType: 'asset',
        cashFlowActivity: null,
      },
      {
        lineId: 'l10',
        entryId: 'e5',
        entryDate: '2026-01-20',
        entryDesc: null,
        sourceType: 'manual',
        debitAmount: '0',
        creditAmount: '100',
        accountCode: '9999',
        accountName: 'Misc Acct',
        accountType: 'asset',
        cashFlowActivity: null,
      },
    ]

    mockQ1(entryIdsWithE5)
    mockQ2(allLinesWithE5)
    vi.mocked(getAccountBalances)
      .mockResolvedValueOnce([makeAccountBalance('1001', 0)]) // opening: 0
      .mockResolvedValueOnce([makeAccountBalance('1001', 1100)]) // closing ledger: 1100 (includes e5)

    const cf = await getCashFlowStatement(BIZ, {
      type: 'range',
      from: '2026-01-01',
      to: '2026-01-31',
    })

    expect(cf.unclassifiedAmount).toBeGreaterThan(0)
    expect(cf.unclassifiedAmount).toBeCloseTo(100, 2)
    // closingCashBalance (arithmetic) = 0 + 1000 = 1000 (e5 not counted in netChange)
    // closingCashCrossCheck (ledger)  = 1100
    expect(cf.isReconciled).toBe(false)
    expect(Math.abs(cf.closingCashBalance - cf.closingCashCrossCheck)).toBeGreaterThan(0.01)
  })
})
