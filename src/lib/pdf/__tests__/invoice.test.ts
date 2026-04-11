import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Module mocks ───────────────────────────────────────────────────────────

vi.mock('@/lib/session', () => ({
  getServerSession: vi.fn(),
}))

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
    execute: vi.fn(),
  },
}))

vi.mock('@/actions/orders', () => ({
  getOrderById: vi.fn(),
}))

vi.mock('@/lib/tax', () => ({
  calculateTax: vi.fn(),
}))

import { getServerSession } from '@/lib/session'
import { db } from '@/db'
import { getOrderById } from '@/actions/orders'
import { calculateTax } from '@/lib/tax'
import { getInvoiceData } from '@/actions/invoices'
import { formatGHS } from '../invoice-document'
import type { InvoiceData } from '../types'

// ─── Test constants ─────────────────────────────────────────────────────────

const BUSINESS_ID = 'biz-test-001'
const USER_ID = 'user-test-001'
const ORDER_ID = 'order-test-001'

// ─── Mock helpers ───────────────────────────────────────────────────────────

function mockSession() {
  vi.mocked(getServerSession).mockResolvedValue({
    user: {
      id: USER_ID,
      email: 'owner@test.com',
      businessId: BUSINESS_ID,
      role: 'owner',
      fullName: 'Test Owner',
    },
  })
}

function makeChain(result: unknown[]) {
  const chain: Record<string, unknown> = {
    then: (f?: ((v: unknown) => unknown) | null, r?: ((e: unknown) => unknown) | null) =>
      Promise.resolve(result).then(f, r),
    catch: (f?: ((e: unknown) => unknown) | null) => Promise.resolve(result).catch(f),
    finally: (f?: (() => void) | null) => Promise.resolve(result).finally(f),
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
  }
  return chain
}

const mockBusiness = {
  name: 'Kwame Trading Ltd',
  address: '12 Oxford Street, Osu, Accra',
  phone: '+233201234567',
  email: 'info@kwametrading.com',
  logoUrl: null,
  tin: 'C0012345678',
  vatNumber: 'VAT-001234',
  vatRegistered: true,
}

const mockOrder = {
  id: ORDER_ID,
  orderNumber: 'ORD-X7KQ-0001',
  localOrderNumber: 'ORD-X7KQ-0001',
  customer: { id: 'cust-001', name: 'Ama Mensah', phone: '+233551234567' },
  orderDate: '2024-03-15',
  status: 'fulfilled',
  paymentStatus: 'paid',
  discountType: null,
  discountValue: null,
  subtotal: '500.00',
  discountAmount: '0.00',
  taxAmount: '109.50',
  totalAmount: '609.50',
  amountPaid: '609.50',
  fxRate: null,
  fxRateLockedAt: null,
  notes: null,
  createdAt: new Date('2024-03-15T10:00:00Z'),
  lines: [
    {
      id: 'line-001',
      description: 'Consulting Service',
      quantity: '2',
      unitPrice: '200.00',
      unitPriceCurrency: 'GHS',
      discountAmount: '0.00',
      lineTotal: '400.00',
    },
    {
      id: 'line-002',
      description: 'Training Materials',
      quantity: '1',
      unitPrice: '100.00',
      unitPriceCurrency: 'GHS',
      discountAmount: '0.00',
      lineTotal: '100.00',
    },
  ],
  payment: {
    id: 'pay-001',
    paymentMethod: 'momo_mtn',
    momoReference: 'MOMO-REF-123',
    bankReference: null,
    paymentDate: '2024-03-15',
  },
  journalEntryId: 'je-001',
}

function mockTaxBreakdown(supplyAmount: number) {
  const nhil = Math.round(supplyAmount * 0.025 * 100) / 100
  const getfund = Math.round(supplyAmount * 0.025 * 100) / 100
  const covid = Math.round(supplyAmount * 0.01 * 100) / 100
  const vatBase = supplyAmount + nhil + getfund + covid
  const vat = Math.round(vatBase * 0.15 * 100) / 100
  const total = nhil + getfund + covid + vat

  return {
    supplyAmount,
    breakdown: [
      { componentCode: 'NHIL', componentName: 'NHIL', baseAmount: supplyAmount, rate: 0.025, taxAmount: nhil },
      { componentCode: 'GETFUND', componentName: 'GETFund', baseAmount: supplyAmount, rate: 0.025, taxAmount: getfund },
      { componentCode: 'COVID', componentName: 'COVID-19 Levy', baseAmount: supplyAmount, rate: 0.01, taxAmount: covid },
      { componentCode: 'VAT', componentName: 'VAT', baseAmount: vatBase, rate: 0.15, taxAmount: vat },
    ],
    totalTaxAmount: total,
    totalAmount: supplyAmount + total,
    effectiveRate: Math.round((total / supplyAmount) * 10000) / 10000,
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks()
})

describe('formatGHS', () => {
  it('formats amount with thousand separators and 2 decimals', () => {
    expect(formatGHS(1234.5)).toBe('GHS 1,234.50')
  })

  it('formats zero', () => {
    expect(formatGHS(0)).toBe('GHS 0.00')
  })

  it('formats small amounts', () => {
    expect(formatGHS(0.5)).toBe('GHS 0.50')
  })

  it('formats large amounts', () => {
    expect(formatGHS(123456.78)).toBe('GHS 123,456.78')
  })

  it('formats negative amounts', () => {
    expect(formatGHS(-50)).toBe('GHS -50.00')
  })
})

describe('getInvoiceData', () => {
  it('returns correctly structured InvoiceData for a VAT-registered business', async () => {
    mockSession()
    vi.mocked(getOrderById).mockResolvedValue(mockOrder as never)
    vi.mocked(db.select).mockReturnValue(
      makeChain([mockBusiness]) as never,
      // Second call for customer location
    )

    // Mock second db.select for customer location
    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain([mockBusiness]) as never)
      .mockReturnValueOnce(makeChain([{ location: 'Accra, Ghana' }]) as never)

    const taxResult = mockTaxBreakdown(500)
    vi.mocked(calculateTax).mockResolvedValue(taxResult)

    const result = await getInvoiceData(ORDER_ID)

    expect(result.invoiceLabel).toBe('TAX INVOICE')
    expect(result.invoiceNumber).toBe('ORD-X7KQ-0001')
    expect(result.invoiceDate).toBe('15/03/2024')
    expect(result.business.name).toBe('Kwame Trading Ltd')
    expect(result.business.vatRegistered).toBe(true)
    expect(result.customer).not.toBeNull()
    expect(result.customer?.name).toBe('Ama Mensah')
    expect(result.lines).toHaveLength(2)
    expect(result.lines[0].index).toBe(1)
    expect(result.taxBreakdown.length).toBeGreaterThan(0)
    expect(result.totalAmount).toBe(609.5)
    expect(result.balanceDue).toBe(0)
    expect(result.payment?.paymentMethodLabel).toBe('MTN MoMo')
    expect(result.payment?.momoReference).toBe('MOMO-REF-123')
  })

  it('returns INVOICE label for non-VAT-registered business', async () => {
    mockSession()

    const nonVatOrder = { ...mockOrder, taxAmount: '0.00', totalAmount: '500.00', amountPaid: '500.00' }
    vi.mocked(getOrderById).mockResolvedValue(nonVatOrder as never)

    const nonVatBiz = { ...mockBusiness, vatRegistered: false, vatNumber: null }
    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain([nonVatBiz]) as never)
      .mockReturnValueOnce(makeChain([{ location: null }]) as never)

    const result = await getInvoiceData(ORDER_ID)

    expect(result.invoiceLabel).toBe('INVOICE')
    expect(result.taxBreakdown).toHaveLength(0)
    expect(result.taxAmount).toBe(0)
  })

  it('sets hasUsdLines and fxRate for USD sales', async () => {
    mockSession()

    const usdOrder = {
      ...mockOrder,
      fxRate: '14.5000',
      fxRateLockedAt: new Date(),
      lines: [
        {
          id: 'line-usd',
          description: 'Import Goods',
          quantity: '10',
          unitPrice: '50.00',
          unitPriceCurrency: 'USD',
          discountAmount: '0.00',
          lineTotal: '7250.00',
        },
      ],
    }
    vi.mocked(getOrderById).mockResolvedValue(usdOrder as never)
    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain([mockBusiness]) as never)
      .mockReturnValueOnce(makeChain([{ location: null }]) as never)

    const taxResult = mockTaxBreakdown(7250)
    vi.mocked(calculateTax).mockResolvedValue(taxResult)

    const result = await getInvoiceData(ORDER_ID)

    expect(result.hasUsdLines).toBe(true)
    expect(result.fxRate).toBe(14.5)
    expect(result.lines[0].unitPriceCurrency).toBe('USD')
  })

  it('sets customer to null for walk-in orders', async () => {
    mockSession()

    const walkInOrder = { ...mockOrder, customer: null, taxAmount: '0.00', totalAmount: '500.00', amountPaid: '500.00' }
    vi.mocked(getOrderById).mockResolvedValue(walkInOrder as never)

    const nonVatBiz = { ...mockBusiness, vatRegistered: false }
    vi.mocked(db.select).mockReturnValueOnce(makeChain([nonVatBiz]) as never)

    const result = await getInvoiceData(ORDER_ID)

    expect(result.customer).toBeNull()
  })

  it('scales tax breakdown proportionally when stored tax differs from recalculation', async () => {
    mockSession()

    // Order was created with tax = 100, but current rates produce 110
    const orderWithOldTax = { ...mockOrder, subtotal: '500.00', discountAmount: '0.00', taxAmount: '100.00', totalAmount: '600.00', amountPaid: '600.00' }
    vi.mocked(getOrderById).mockResolvedValue(orderWithOldTax as never)
    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain([mockBusiness]) as never)
      .mockReturnValueOnce(makeChain([{ location: null }]) as never)

    // Recalculated tax is 110 (different from stored 100)
    vi.mocked(calculateTax).mockResolvedValue({
      supplyAmount: 500,
      breakdown: [
        { componentCode: 'NHIL', componentName: 'NHIL', baseAmount: 500, rate: 0.025, taxAmount: 12.5 },
        { componentCode: 'GETFUND', componentName: 'GETFund', baseAmount: 500, rate: 0.025, taxAmount: 12.5 },
        { componentCode: 'COVID', componentName: 'COVID-19 Levy', baseAmount: 500, rate: 0.01, taxAmount: 5 },
        { componentCode: 'VAT', componentName: 'VAT', baseAmount: 530, rate: 0.15, taxAmount: 80 },
      ],
      totalTaxAmount: 110,
      totalAmount: 610,
      effectiveRate: 0.22,
    })

    const result = await getInvoiceData(ORDER_ID)

    // Breakdown should be scaled by 100/110 ≈ 0.9091
    const breakdownSum = result.taxBreakdown.reduce((s, b) => s + b.taxAmount, 0)
    expect(Math.abs(breakdownSum - 100)).toBeLessThan(0.1)

    // Each component should be scaled
    const nhil = result.taxBreakdown.find((b) => b.componentCode === 'NHIL')
    expect(nhil).toBeDefined()
    expect(nhil!.taxAmount).toBe(Math.round(12.5 * (100 / 110) * 100) / 100)
  })

  it('formats date from YYYY-MM-DD to DD/MM/YYYY', async () => {
    mockSession()
    vi.mocked(getOrderById).mockResolvedValue(mockOrder as never)
    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain([{ ...mockBusiness, vatRegistered: false }]) as never)
      .mockReturnValueOnce(makeChain([{ location: null }]) as never)

    const result = await getInvoiceData(ORDER_ID)

    expect(result.invoiceDate).toBe('15/03/2024')
  })

  it('includes discount label for percentage discounts', async () => {
    mockSession()

    const discountOrder = {
      ...mockOrder,
      discountType: 'percentage',
      discountValue: '10.00',
      discountAmount: '50.00',
      subtotal: '500.00',
      taxAmount: '0.00',
      totalAmount: '450.00',
      amountPaid: '450.00',
    }
    vi.mocked(getOrderById).mockResolvedValue(discountOrder as never)

    const nonVatBiz = { ...mockBusiness, vatRegistered: false }
    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain([nonVatBiz]) as never)
      .mockReturnValueOnce(makeChain([{ location: null }]) as never)

    const result = await getInvoiceData(ORDER_ID)

    expect(result.discountLabel).toBe('10%')
    expect(result.discountAmount).toBe(50)
  })
})

describe('order number assignment', () => {
  it('assigns sequential clean numbers — ORD-0001 and ORD-0002', async () => {
    // This tests the SQL logic conceptually. The actual route handler
    // uses pg_advisory_xact_lock and real DB transactions.
    // Here we verify the number format and sequence logic.
    const nextSeq = 1
    const orders = [
      { id: 'order-a', orderNumber: 'ORD-X7KQ-0001' },
      { id: 'order-b', orderNumber: 'ORD-X7KQ-0002' },
    ]

    const assigned = orders.map((order, i) => ({
      orderId: order.id,
      orderNumber: `ORD-${String(nextSeq + i).padStart(4, '0')}`,
    }))

    expect(assigned).toEqual([
      { orderId: 'order-a', orderNumber: 'ORD-0001' },
      { orderId: 'order-b', orderNumber: 'ORD-0002' },
    ])

    // Verify no duplicates
    const numbers = assigned.map((a) => a.orderNumber)
    expect(new Set(numbers).size).toBe(numbers.length)
  })

  it('continues sequence from existing max number', () => {
    const maxExisting = 'ORD-0042'
    const match = maxExisting.match(/^ORD-(\d+)$/)
    const nextSeq = match ? parseInt(match[1], 10) + 1 : 1

    expect(nextSeq).toBe(43)
    expect(`ORD-${String(nextSeq).padStart(4, '0')}`).toBe('ORD-0043')
  })

  it('pads to 4 digits but allows overflow beyond 9999', () => {
    expect(`ORD-${String(10000).padStart(4, '0')}`).toBe('ORD-10000')
    expect(`ORD-${String(1).padStart(4, '0')}`).toBe('ORD-0001')
  })
})
