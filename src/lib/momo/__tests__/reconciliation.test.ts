import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'

// Mock @/lib/reports/engine before any imports that reference it.
// vi.mock is hoisted — this runs before module resolution.
vi.mock('@/lib/reports/engine', () => ({
  getAccountBalances: vi.fn(),
}))

import { getAccountBalances } from '@/lib/reports/engine'
import { getMoMoBookBalances, computeVariance, MOMO_ACCOUNT_CODES } from '../reconciliation'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAccountBalance(code: string, name: string, netBalance: number) {
  return {
    accountId: `id-${code}`,
    accountCode: code,
    accountName: name,
    accountType: 'asset',
    accountSubtype: null,
    cashFlowActivity: 'operating',
    normalBalance: 'debit' as const,
    totalDebits: netBalance,
    totalCredits: 0,
    netBalance,
  }
}

const MOCK_ACCOUNTS = [
  makeAccountBalance('1001', 'Cash on Hand', 500),
  makeAccountBalance('1002', 'MTN MoMo', 1200),
  makeAccountBalance('1003', 'Telecel Cash', 300),
  makeAccountBalance('1004', 'AirtelTigo Money', 750),
  makeAccountBalance('1005', 'Bank Account', 4500),
]

beforeEach(() => {
  vi.resetAllMocks()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getMoMoBookBalances', () => {
  it('Test 1 — returns 5 accounts (1001–1005) with correct bookBalance from netBalance', async () => {
    ;(getAccountBalances as Mock).mockResolvedValue(MOCK_ACCOUNTS)

    const result = await getMoMoBookBalances('biz-123')

    expect(getAccountBalances).toHaveBeenCalledWith(
      'biz-123',
      expect.objectContaining({ type: 'asOf' }),
      MOMO_ACCOUNT_CODES,
    )
    expect(result).toHaveLength(5)
    expect(result[0]).toMatchObject({ accountCode: '1001', bookBalance: 500, network: 'Bank' })
    expect(result[1]).toMatchObject({ accountCode: '1002', bookBalance: 1200, network: 'MTN' })
    expect(result[2]).toMatchObject({ accountCode: '1003', bookBalance: 300, network: 'Telecel' })
    expect(result[3]).toMatchObject({
      accountCode: '1004',
      bookBalance: 750,
      network: 'AirtelTigo',
    })
    expect(result[4]).toMatchObject({ accountCode: '1005', bookBalance: 4500, network: 'Bank' })
  })

  it('Test 2 — account with netBalance = 0 maps to bookBalance = 0', async () => {
    const accounts = MOCK_ACCOUNTS.map((a) =>
      a.accountCode === '1003' ? { ...a, netBalance: 0, totalDebits: 0 } : a,
    )
    ;(getAccountBalances as Mock).mockResolvedValue(accounts)

    const result = await getMoMoBookBalances('biz-123')

    const telecel = result.find((r) => r.accountCode === '1003')
    expect(telecel?.bookBalance).toBe(0)
  })
})

describe('computeVariance', () => {
  it('Test 3 — actual equals book (exact zero diff): status = match', () => {
    const result = computeVariance(100, 100)
    expect(result.status).toBe('match')
    expect(result.variance).toBe(0)
    expect(result.varianceLabel).toBe('Matches book balance')
  })

  it('Test 4 — |diff| = 0.005 < 0.01 threshold: rounds to match', () => {
    const result = computeVariance(100, 100.005)
    expect(result.status).toBe('match')
    expect(result.variance).toBe(0)
  })

  it('Test 5 — actual > book: status = surplus, variance is positive', () => {
    const result = computeVariance(100, 150)
    expect(result.status).toBe('surplus')
    expect(result.variance).toBe(50)
    expect(result.varianceLabel).toContain('more than recorded')
  })

  it('Test 6 — actual < book: status = deficit, variance is negative', () => {
    const result = computeVariance(100, 80)
    expect(result.status).toBe('deficit')
    expect(result.variance).toBe(-20)
    expect(result.varianceLabel).toContain('less than recorded')
  })

  it('Test 7 — actual = null: status = pending, variance and varianceLabel are null', () => {
    const result = computeVariance(100, null)
    expect(result.status).toBe('pending')
    expect(result.variance).toBeNull()
    expect(result.varianceLabel).toBeNull()
  })
})
