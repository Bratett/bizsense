import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Hoisted mock handles ─────────────────────────────────────────────────────
// vi.hoisted ensures these are initialized before vi.mock factories run.

const { mockOrderBy, mockGroupBy, mockWhere, mockInnerJoin, mockFrom, mockSelect } = vi.hoisted(
  () => {
    const mockOrderBy = vi.fn()
    const mockGroupBy = vi.fn()
    const mockWhere = vi.fn(() => ({ orderBy: mockOrderBy, groupBy: mockGroupBy }))
    const mockInnerJoin = vi.fn(() => ({ where: mockWhere }))
    const mockFrom = vi.fn(() => ({ innerJoin: mockInnerJoin, where: mockWhere }))
    const mockSelect = vi.fn(() => ({ from: mockFrom }))
    return { mockOrderBy, mockGroupBy, mockWhere, mockInnerJoin, mockFrom, mockSelect }
  },
)

vi.mock('@/db', () => ({
  db: { select: mockSelect },
}))

vi.mock('@/db/schema', () => ({
  businesses: {},
  accounts: {},
  journalLines: {},
  journalEntries: {},
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  eq: vi.fn(),
  gte: vi.fn(),
  lte: vi.fn(),
  inArray: vi.fn(),
  sql: vi.fn(() => ''),
}))

import { getVatReport } from '../vat'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_BUSINESS = { id: 'biz-1', vatRegistered: true, vatNumber: 'VAT12345678' }
const ACCT_2100 = { id: 'acct-2100', code: '2100', type: 'liability', businessId: 'biz-1' }
const ACCT_1101 = { id: 'acct-1101', code: '1101', type: 'asset', businessId: 'biz-1' }

// Q1 2026 — two VAT-bearing sales
const OUTPUT_LINE_1 = {
  entryId: 'entry-1',
  entryDate: '2026-01-15',
  reference: 'ORD-001',
  description: 'Sale to Customer A',
  sourceType: 'order',
  vatAmount: '219.00',
}
const OUTPUT_LINE_2 = {
  entryId: 'entry-2',
  entryDate: '2026-02-10',
  reference: 'ORD-002',
  description: 'Sale to Customer B',
  sourceType: 'order',
  vatAmount: '109.50',
}

// One VAT-bearing expense (fuel): gross 121.90 = net 100 + VAT 21.90
const INPUT_LINE_1 = {
  entryId: 'entry-3',
  entryDate: '2026-01-20',
  reference: 'EXP-001',
  description: 'Fuel expense',
  sourceType: 'expense',
  vatAmount: '21.90',
}

const NET_SUPPLY_1 = { entryId: 'entry-1', netAmount: '1000.00' }
const NET_SUPPLY_2 = { entryId: 'entry-2', netAmount: '500.00' }
const NET_PURCHASE_1 = { entryId: 'entry-3', netAmount: '100.00' }

const Q1: { from: string; to: string } = { from: '2026-01-01', to: '2026-03-31' }
const Q2: { from: string; to: string } = { from: '2026-04-01', to: '2026-06-30' }

// ─── Helper: wire up the standard Q1 mock sequence ───────────────────────────

function setupQ1Mocks() {
  // steps 1–3: business and account lookups (mockWhere resolves directly)
  mockWhere
    .mockResolvedValueOnce([BASE_BUSINESS] as never)
    .mockResolvedValueOnce([ACCT_2100] as never)
    .mockResolvedValueOnce([ACCT_1101] as never)
  // step 4: output VAT lines (mockWhere returns chain object; mockOrderBy resolves)
  mockOrderBy.mockResolvedValueOnce([OUTPUT_LINE_1, OUTPUT_LINE_2])
  // step 5: net supply per entry
  mockGroupBy.mockResolvedValueOnce([NET_SUPPLY_1, NET_SUPPLY_2])
  // step 6: input VAT lines
  mockOrderBy.mockResolvedValueOnce([INPUT_LINE_1])
  // step 7: net purchase per entry
  mockGroupBy.mockResolvedValueOnce([NET_PURCHASE_1])
}

// ─── Reset chain refs each test ───────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockWhere.mockImplementation(() => ({ orderBy: mockOrderBy, groupBy: mockGroupBy }))
  mockInnerJoin.mockImplementation(() => ({ where: mockWhere }))
  mockFrom.mockImplementation(() => ({ innerJoin: mockInnerJoin, where: mockWhere }))
  mockSelect.mockImplementation(() => ({ from: mockFrom }))
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getVatReport', () => {
  it('Test 1 — returns null for non-VAT-registered business', async () => {
    mockWhere.mockResolvedValueOnce([{ id: 'biz-1', vatRegistered: false }] as never)

    const result = await getVatReport('biz-1', Q1)

    expect(result).toBeNull()
  })

  it('Test 2 — outputVat.totalVat = 219 + 109.50 = 328.50', async () => {
    setupQ1Mocks()

    const report = await getVatReport('biz-1', Q1)

    expect(report).not.toBeNull()
    expect(report!.outputVat.totalVat).toBe(328.5)
  })

  it('Test 3 — non-VAT sale is not included in output VAT lines', async () => {
    // The DB query filters by account 2100 credits, so a sale without VAT
    // never appears. Mock returns only the 2 VAT-bearing sales.
    setupQ1Mocks()

    const report = await getVatReport('biz-1', Q1)

    // Only the 2 VAT-bearing sales appear — the non-VAT sale is absent
    expect(report!.outputVat.lines.length).toBe(2)
  })

  it('Test 4 — inputVat.totalVat = 21.90', async () => {
    setupQ1Mocks()

    const report = await getVatReport('biz-1', Q1)

    expect(report!.inputVat.totalVat).toBe(21.9)
  })

  it('Test 5 — netVatPayable = 328.50 − 21.90 = 306.60', async () => {
    setupQ1Mocks()

    const report = await getVatReport('biz-1', Q1)

    expect(report!.netVatPayable).toBe(306.6)
  })

  it('Test 6 — outputVat.lines.length = 2 (two VAT-bearing sales)', async () => {
    setupQ1Mocks()

    const report = await getVatReport('biz-1', Q1)

    expect(report!.outputVat.lines).toHaveLength(2)
    expect(report!.outputVat.lines[0].reference).toBe('ORD-001')
    expect(report!.outputVat.lines[1].reference).toBe('ORD-002')
  })

  it('Test 7 — inputVat.lines.length = 1 (one VAT-bearing expense)', async () => {
    setupQ1Mocks()

    const report = await getVatReport('biz-1', Q1)

    expect(report!.inputVat.lines).toHaveLength(1)
    expect(report!.inputVat.lines[0].reference).toBe('EXP-001')
    expect(report!.inputVat.lines[0].vatAmount).toBe(21.9)
  })

  it('Test 8 — Q2 period with no Q2 data returns zero lines and zero totals', async () => {
    mockWhere
      .mockResolvedValueOnce([BASE_BUSINESS] as never)
      .mockResolvedValueOnce([ACCT_2100] as never)
      .mockResolvedValueOnce([ACCT_1101] as never)
    // No output lines in Q2 — net supply query is skipped
    mockOrderBy.mockResolvedValueOnce([])
    // No input lines in Q2 — net purchase query is skipped
    mockOrderBy.mockResolvedValueOnce([])

    const report = await getVatReport('biz-1', Q2)

    expect(report).not.toBeNull()
    expect(report!.outputVat.lines).toHaveLength(0)
    expect(report!.outputVat.totalVat).toBe(0)
    expect(report!.inputVat.lines).toHaveLength(0)
    expect(report!.inputVat.totalVat).toBe(0)
    expect(report!.netVatPayable).toBe(0)
  })
})
