import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Module mocks (hoisted before imports) ────────────────────────────────────

vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: vi.fn(),
}))

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
  },
}))

vi.mock('@/lib/dashboard/queries', () => ({
  getDashboardLowStock: vi.fn(),
}))

vi.mock('@/lib/reports/arAging', () => ({
  getArAging: vi.fn(),
}))

vi.mock('@/lib/whatsapp', () => ({
  buildWhatsAppLink: vi.fn(),
}))

vi.mock('@/lib/whatsapp/templates', () => ({
  lowStockAlertTemplate: vi.fn(() => 'low-stock-message'),
  overdueInvoicesTemplate: vi.fn(() => 'overdue-message'),
}))

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { requireRole } from '@/lib/auth/requireRole'
import { db } from '@/db'
import { getDashboardLowStock } from '@/lib/dashboard/queries'
import { getArAging } from '@/lib/reports/arAging'
import { buildWhatsAppLink } from '@/lib/whatsapp'
import { overdueInvoicesTemplate } from '@/lib/whatsapp/templates'
import { getLowStockAlertData, getOverdueAlertData } from '../alerts'

// ─── Constants ────────────────────────────────────────────────────────────────

const BUSINESS_ID = 'biz-0001-0000-0000-0000-000000000001'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeChain(result: unknown[]) {
  const chain: Record<string, unknown> = {
    then: (f?: ((v: unknown) => unknown) | null, r?: ((e: unknown) => unknown) | null) =>
      Promise.resolve(result).then(f, r),
    catch: (f?: ((e: unknown) => unknown) | null) => Promise.resolve(result).catch(f),
    finally: (f?: (() => void) | null) => Promise.resolve(result).finally(f),
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(() => chain),
  }
  return chain
}

function mockRole(role: string = 'owner') {
  vi.mocked(requireRole).mockResolvedValue({
    businessId: BUSINESS_ID,
    id: 'user-001',
    email: 'owner@test.com',
    role: role as 'owner',
    fullName: 'Test Owner',
  })
}

function mockBusiness(phone: string | null = '0241234567') {
  vi.mocked(db.select).mockReturnValueOnce(
    makeChain([{ name: 'Kwame Enterprises', phone }]) as never,
  )
}

function makeLowStockItems(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `prod-${i}`,
    name: `Product ${i}`,
    sku: null,
    currentStock: i,
    reorderLevel: 10,
    unit: 'pcs',
  }))
}

function makeAgingWithBuckets(buckets: Array<{ bucket: string; outstanding: number }>) {
  return {
    asOfDate: '2026-04-15',
    grandTotals: { current: 0, days31to60: 0, days61to90: 0, over90: 0, total: 0 },
    totalCustomersWithBalance: 1,
    customers: [
      {
        customerId: 'cust-001',
        customerName: 'Ama Mensah',
        customerPhone: '0551234567',
        totals: { current: 0, days31to60: 0, days61to90: 0, over90: 0, total: 0 },
        invoices: buckets.map((b, i) => ({
          orderId: `ord-${i}`,
          orderNumber: `ORD-${String(i + 1).padStart(4, '0')}`,
          orderDate: '2026-01-01',
          dueDate: '2026-02-01',
          customerId: 'cust-001',
          customerName: 'Ama Mensah',
          customerPhone: '0551234567',
          originalAmount: b.outstanding,
          amountPaid: 0,
          outstanding: b.outstanding,
          ageDays: 45,
          bucket: b.bucket as 'current' | '31-60' | '61-90' | 'over90',
        })),
      },
    ],
  }
}

// ─── beforeEach ───────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks()
})

// ─── getLowStockAlertData ─────────────────────────────────────────────────────

describe('getLowStockAlertData', () => {
  it('Test 1 — products below reorder level with valid phone: canSend true, whatsAppLink contains wa.me', async () => {
    mockRole('owner')
    mockBusiness('0241234567')
    vi.mocked(getDashboardLowStock).mockResolvedValue({
      count: 3,
      items: makeLowStockItems(3),
    })
    vi.mocked(buildWhatsAppLink).mockReturnValue({
      ok: true,
      url: 'https://wa.me/233241234567?text=...',
    })

    const result = await getLowStockAlertData()

    expect(result.canSend).toBe(true)
    expect(result.whatsAppLink).toContain('wa.me')
    expect(result.productCount).toBe(3)
  })

  it('Test 2 — no low-stock products: canSend false, reason explains no products below reorder', async () => {
    mockRole('owner')
    mockBusiness('0241234567')
    vi.mocked(getDashboardLowStock).mockResolvedValue({ count: 0, items: [] })

    const result = await getLowStockAlertData()

    expect(result.canSend).toBe(false)
    expect(result.whatsAppLink).toBeNull()
    expect(result.reason).toMatch(/reorder/i)
    expect(result.productCount).toBe(0)
    expect(buildWhatsAppLink).not.toHaveBeenCalled()
  })

  it('Test 3 — low-stock products exist but no business phone: canSend false, reason mentions Settings', async () => {
    mockRole('owner')
    mockBusiness(null)
    vi.mocked(getDashboardLowStock).mockResolvedValue({
      count: 2,
      items: makeLowStockItems(2),
    })

    const result = await getLowStockAlertData()

    expect(result.canSend).toBe(false)
    expect(result.whatsAppLink).toBeNull()
    expect(result.reason).toMatch(/settings/i)
    expect(result.ownerPhone).toBeNull()
    expect(buildWhatsAppLink).not.toHaveBeenCalled()
  })

  it('Test 4 — cashier role: requireRole throws Forbidden', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Forbidden: insufficient permissions'))

    await expect(getLowStockAlertData()).rejects.toThrow(/Forbidden/i)
    expect(getDashboardLowStock).not.toHaveBeenCalled()
  })
})

// ─── getOverdueAlertData ──────────────────────────────────────────────────────

describe('getOverdueAlertData', () => {
  it('Test 5 — invoices in 31-60 bucket: included in alert, invoiceCount > 0', async () => {
    mockRole('owner')
    mockBusiness('0241234567')
    vi.mocked(getArAging).mockResolvedValue(
      makeAgingWithBuckets([{ bucket: '31-60', outstanding: 500 }]) as never,
    )
    vi.mocked(buildWhatsAppLink).mockReturnValue({
      ok: true,
      url: 'https://wa.me/233241234567?text=...',
    })

    const result = await getOverdueAlertData()

    expect(result.canSend).toBe(true)
    expect(result.invoiceCount).toBe(1)
    expect(result.totalOutstanding).toBe(500)
  })

  it('Test 6 — invoices only in current bucket: NOT included, invoiceCount 0, canSend false', async () => {
    mockRole('owner')
    mockBusiness('0241234567')
    vi.mocked(getArAging).mockResolvedValue(
      makeAgingWithBuckets([{ bucket: 'current', outstanding: 300 }]) as never,
    )

    const result = await getOverdueAlertData()

    expect(result.canSend).toBe(false)
    expect(result.invoiceCount).toBe(0)
    expect(buildWhatsAppLink).not.toHaveBeenCalled()
  })

  it('Test 7 — more than 10 overdue invoices: overdueInvoicesTemplate called with at most 10', async () => {
    mockRole('owner')
    mockBusiness('0241234567')
    // 12 overdue invoices across two customers
    vi.mocked(getArAging).mockResolvedValue({
      asOfDate: '2026-04-15',
      grandTotals: { current: 0, days31to60: 0, days61to90: 0, over90: 0, total: 0 },
      totalCustomersWithBalance: 2,
      customers: [
        {
          customerId: 'cust-001',
          customerName: 'Ama Mensah',
          customerPhone: null,
          totals: { current: 0, days31to60: 0, days61to90: 0, over90: 0, total: 0 },
          invoices: Array.from({ length: 7 }, (_, i) => ({
            orderId: `ord-a-${i}`,
            orderNumber: `ORD-A${i + 1}`,
            orderDate: '2026-01-01',
            dueDate: '2026-02-01',
            customerId: 'cust-001',
            customerName: 'Ama Mensah',
            customerPhone: null,
            originalAmount: 100,
            amountPaid: 0,
            outstanding: 100,
            ageDays: 50,
            bucket: '31-60' as const,
          })),
        },
        {
          customerId: 'cust-002',
          customerName: 'Kofi Boateng',
          customerPhone: null,
          totals: { current: 0, days31to60: 0, days61to90: 0, over90: 0, total: 0 },
          invoices: Array.from({ length: 5 }, (_, i) => ({
            orderId: `ord-b-${i}`,
            orderNumber: `ORD-B${i + 1}`,
            orderDate: '2026-01-01',
            dueDate: '2026-02-01',
            customerId: 'cust-002',
            customerName: 'Kofi Boateng',
            customerPhone: null,
            originalAmount: 200,
            amountPaid: 0,
            outstanding: 200,
            ageDays: 70,
            bucket: '61-90' as const,
          })),
        },
      ],
    } as never)
    vi.mocked(buildWhatsAppLink).mockReturnValue({
      ok: true,
      url: 'https://wa.me/233241234567?text=...',
    })

    await getOverdueAlertData()

    expect(overdueInvoicesTemplate).toHaveBeenCalledTimes(1)
    const callArgs = vi.mocked(overdueInvoicesTemplate).mock.calls[0][0]
    expect(callArgs.invoices.length).toBeLessThanOrEqual(10)
    expect(callArgs.invoices.length).toBe(10)
  })

  it('Test 8 — totalOutstanding equals sum of all overdue invoice outstanding amounts', async () => {
    mockRole('owner')
    mockBusiness('0241234567')
    vi.mocked(getArAging).mockResolvedValue(
      makeAgingWithBuckets([
        { bucket: '31-60', outstanding: 450.5 },
        { bucket: '61-90', outstanding: 200 },
        { bucket: 'over90', outstanding: 800.75 },
        { bucket: 'current', outstanding: 999 }, // should be excluded
      ]) as never,
    )
    vi.mocked(buildWhatsAppLink).mockReturnValue({
      ok: true,
      url: 'https://wa.me/233241234567?text=...',
    })

    const result = await getOverdueAlertData()

    // 450.50 + 200.00 + 800.75 = 1451.25 (current bucket excluded)
    expect(result.totalOutstanding).toBeCloseTo(1451.25, 2)
    expect(result.invoiceCount).toBe(3)
  })
})
