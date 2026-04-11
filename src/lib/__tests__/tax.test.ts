import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @/db before any imports that use it.
// vi.mock is hoisted — this runs before module resolution.
vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
  },
}))

import { db } from '@/db'
import { calculateTax } from '../tax'

// ─── Ghana standard tax components ───────────────────────────────────────────

function makeGhanaComponents(overrides?: { covidActive?: boolean }) {
  const covidActive = overrides?.covidActive ?? true
  return [
    {
      id: 'tc-nhil',
      businessId: 'biz-vat',
      name: 'NHIL',
      code: 'NHIL',
      rate: '0.0250',
      calculationOrder: 1,
      isCompounded: false,
      appliesTo: 'standard',
      accountId: null,
      isActive: true,
      effectiveFrom: new Date('2020-01-01'),
      effectiveTo: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'tc-getfund',
      businessId: 'biz-vat',
      name: 'GETFund',
      code: 'GETFUND',
      rate: '0.0250',
      calculationOrder: 2,
      isCompounded: false,
      appliesTo: 'standard',
      accountId: null,
      isActive: true,
      effectiveFrom: new Date('2020-01-01'),
      effectiveTo: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'tc-covid',
      businessId: 'biz-vat',
      name: 'COVID-19 Levy',
      code: 'COVID',
      rate: '0.0100',
      calculationOrder: 3,
      isCompounded: false,
      appliesTo: 'standard',
      accountId: null,
      isActive: covidActive,
      effectiveFrom: new Date('2022-01-01'),
      effectiveTo: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'tc-vat',
      businessId: 'biz-vat',
      name: 'VAT',
      code: 'VAT',
      rate: '0.1500',
      calculationOrder: 4,
      isCompounded: true,
      appliesTo: 'standard',
      accountId: null,
      isActive: true,
      effectiveFrom: new Date('2020-01-01'),
      effectiveTo: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]
}

// ─── Mock helpers ─────────────────────────────────────────────────────────────

// Set up db.select mock for one calculateTax call.
// calculateTax calls db.select() twice:
//   1st: business vatRegistered check  (awaits .from().where() directly)
//   2nd: tax components                (awaits .from().where().orderBy())
function mockDbForCalculateTax({
  vatRegistered,
  components,
}: {
  vatRegistered: boolean
  components: unknown[]
}) {
  vi.mocked(db.select)
    // First call: business query
    .mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ vatRegistered }]),
      }),
    } as unknown as ReturnType<typeof db.select>)
    // Second call: tax components query
    .mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue(components),
        }),
      }),
    } as unknown as ReturnType<typeof db.select>)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks()
})

describe('calculateTax', () => {
  it('Test 1 — unregistered business returns zero tax', async () => {
    vi.mocked(db.select).mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ vatRegistered: false }]),
      }),
    } as unknown as ReturnType<typeof db.select>)

    const result = await calculateTax('biz-no-vat', 100)

    expect(result.totalTaxAmount).toBe(0)
    expect(result.totalAmount).toBe(100)
    expect(result.breakdown).toHaveLength(0)
    expect(result.effectiveRate).toBe(0)
    // Tax components query should never be called
    expect(vi.mocked(db.select)).toHaveBeenCalledTimes(1)
  })

  it('Test 2 — Ghana standard cascading calculation on supply of 100', async () => {
    mockDbForCalculateTax({
      vatRegistered: true,
      components: makeGhanaComponents(),
    })

    const result = await calculateTax('biz-vat', 100)

    // ─── Per-component assertions ───────────────────────────────────────────
    const nhil = result.breakdown.find((b) => b.componentCode === 'NHIL')
    const getfund = result.breakdown.find((b) => b.componentCode === 'GETFUND')
    const covid = result.breakdown.find((b) => b.componentCode === 'COVID')
    const vat = result.breakdown.find((b) => b.componentCode === 'VAT')

    expect(nhil?.baseAmount).toBe(100)
    expect(nhil?.taxAmount).toBe(2.5)

    expect(getfund?.baseAmount).toBe(100)
    expect(getfund?.taxAmount).toBe(2.5)

    expect(covid?.baseAmount).toBe(100)
    expect(covid?.taxAmount).toBe(1)

    // VAT is compounded: base = 100 + 2.50 + 2.50 + 1.00 = 106
    expect(vat?.baseAmount).toBe(106)
    expect(vat?.taxAmount).toBe(15.9)

    // ─── Total assertions ───────────────────────────────────────────────────
    expect(result.totalTaxAmount).toBe(21.9)
    expect(result.totalAmount).toBe(121.9)
    // effectiveRate rounded to 4 decimal places: 21.9 / 100 = 0.219
    expect(result.effectiveRate).toBeCloseTo(0.219, 3)
  })

  it('Test 3 — inactive component is excluded from calculation', async () => {
    // Return only active components (DB WHERE isActive=true filters them server-side)
    const activeComponents = makeGhanaComponents({ covidActive: false }).filter((c) => c.isActive)

    mockDbForCalculateTax({
      vatRegistered: true,
      components: activeComponents,
    })

    const result = await calculateTax('biz-vat', 100)

    // COVID must not appear
    const covid = result.breakdown.find((b) => b.componentCode === 'COVID')
    expect(covid).toBeUndefined()

    // VAT base = 100 + 2.50 + 2.50 = 105 (no COVID contribution)
    const vat = result.breakdown.find((b) => b.componentCode === 'VAT')
    expect(vat?.baseAmount).toBe(105)
    expect(vat?.taxAmount).toBe(15.75)

    expect(result.breakdown).toHaveLength(3) // NHIL, GETFund, VAT
  })
})
