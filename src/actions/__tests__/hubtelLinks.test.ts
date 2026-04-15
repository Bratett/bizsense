import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Module mocks (hoisted before imports) ────────────────────────────────────

vi.mock('@/lib/session', () => ({
  getServerSession: vi.fn(),
}))

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}))

vi.mock('@/lib/hubtel/client', () => ({
  createHubtelCheckout: vi.fn(),
}))

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { getServerSession } from '@/lib/session'
import { db } from '@/db'
import { createHubtelCheckout } from '@/lib/hubtel/client'
import { generatePaymentLink, getPaymentLinkStatus } from '../hubtelLinks'

// ─── Constants ────────────────────────────────────────────────────────────────

const BUSINESS_ID = 'aabbccdd-eeff-0011-2233-445566778899'
const ORDER_ID = '11223344-5566-7788-9900-aabbccddeeff'
const LINK_ID = 'link-0001-0000-0000-0000-000000000001'

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
    orderBy: vi.fn(() => chain),
    desc: vi.fn(() => chain),
  }
  return chain
}

function makeInsertChain(returning: unknown[] = []) {
  const chain: Record<string, unknown> = {
    then: (f?: ((v: unknown) => unknown) | null, r?: ((e: unknown) => unknown) | null) =>
      Promise.resolve(returning).then(f, r),
    catch: (f?: ((e: unknown) => unknown) | null) => Promise.resolve(returning).catch(f),
    finally: (f?: (() => void) | null) => Promise.resolve(returning).finally(f),
    values: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(returning)),
  }
  return chain
}

function mockSession() {
  vi.mocked(getServerSession).mockResolvedValue({
    user: {
      businessId: BUSINESS_ID,
      id: 'user-001',
      email: 'test@test.com',
      role: 'owner',
      fullName: 'Test User',
    },
  })
}

function mockOrderLookup(
  overrides?: Partial<{
    paymentStatus: string
    status: string
    totalAmount: string
    amountPaid: string
  }>,
) {
  vi.mocked(db.select).mockReturnValueOnce(
    makeChain([
      {
        id: ORDER_ID,
        orderNumber: 'ORD-0001',
        status: overrides?.status ?? 'fulfilled',
        paymentStatus: overrides?.paymentStatus ?? 'unpaid',
        totalAmount: overrides?.totalAmount ?? '500.00',
        amountPaid: overrides?.amountPaid ?? '0.00',
        customerId: null,
      },
    ]) as never,
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks()
})

describe('generatePaymentLink', () => {
  // ── Test 10: creates record with correct clientReference format ───────────────

  it('Test 10 — creates hubtelPaymentLinks record with correct clientReference format', async () => {
    mockSession()
    mockOrderLookup()

    vi.mocked(createHubtelCheckout).mockResolvedValue({
      checkoutId: 'hck-0001',
      checkoutUrl: 'https://pay.hubtel.com/checkout/hck-0001',
    })

    let capturedValues: unknown = null
    vi.mocked(db.insert).mockReturnValue(
      makeInsertChain([{ id: LINK_ID, clientReference: '' }]) as never,
    )

    // Intercept the .values() call to capture what was passed
    const originalInsert = vi.mocked(db.insert)
    originalInsert.mockImplementation(() => {
      const chain = makeInsertChain([{ id: LINK_ID, clientReference: 'CAPTURED' }])
      const origValues = chain.values as (v: unknown) => unknown
      chain.values = vi.fn((vals: unknown) => {
        capturedValues = vals
        return origValues(vals)
      })
      return chain as never
    })

    await generatePaymentLink(ORDER_ID)

    expect(capturedValues).not.toBeNull()
    const vals = capturedValues as { clientReference: string }
    // Format: BSG-{8 uppercase hex}-{8 uppercase hex}-{base36 timestamp}
    expect(vals.clientReference).toMatch(/^BSG-[A-Z0-9]{8}-[A-Z0-9]{8}-[A-Z0-9]+$/)

    // Verify the business and order ID slices are embedded correctly
    const expectedBizSlice = BUSINESS_ID.replace(/-/g, '').slice(0, 8).toUpperCase()
    const expectedOrderSlice = ORDER_ID.replace(/-/g, '').slice(0, 8).toUpperCase()
    expect(vals.clientReference).toContain(`BSG-${expectedBizSlice}-${expectedOrderSlice}-`)
  })

  // ── Test 11: already-paid order throws ────────────────────────────────────────

  it('Test 11 — already-paid order: throws with paid message', async () => {
    mockSession()
    mockOrderLookup({ paymentStatus: 'paid' })

    await expect(generatePaymentLink(ORDER_ID)).rejects.toThrow(/already fully paid/i)
    expect(createHubtelCheckout).not.toHaveBeenCalled()
    expect(db.insert).not.toHaveBeenCalled()
  })

  // ── Test 12: calls Hubtel API with correct params ─────────────────────────────

  it('Test 12 — calls createHubtelCheckout with correct clientReference and amount', async () => {
    mockSession()
    mockOrderLookup({ totalAmount: '250.00', amountPaid: '50.00' }) // outstanding = 200

    vi.mocked(createHubtelCheckout).mockResolvedValue({
      checkoutId: 'hck-0002',
      checkoutUrl: 'https://pay.hubtel.com/checkout/hck-0002',
    })

    vi.mocked(db.insert).mockReturnValue(
      makeInsertChain([{ id: LINK_ID, clientReference: 'BSG-AABB-CCDD-XYZ' }]) as never,
    )

    await generatePaymentLink(ORDER_ID)

    expect(createHubtelCheckout).toHaveBeenCalledTimes(1)
    const callArgs = vi.mocked(createHubtelCheckout).mock.calls[0][0]

    // Outstanding balance: 250 - 50 = 200
    expect(callArgs.amount).toBeCloseTo(200, 2)
    expect(callArgs.currency).toBe('GHS')
    expect(callArgs.clientReference).toMatch(/^BSG-/)
    expect(callArgs.callbackUrl).toContain('/api/webhooks/hubtel')
  })

  // ── Test 13: Hubtel API error → throws, no DB record written ─────────────────

  it('Test 13 — Hubtel API error: throws, hubtelPaymentLinks not inserted', async () => {
    mockSession()
    mockOrderLookup()

    vi.mocked(createHubtelCheckout).mockRejectedValue(
      new Error('Hubtel API error 503: Service Unavailable'),
    )

    await expect(generatePaymentLink(ORDER_ID)).rejects.toThrow(/Hubtel API error/)
    expect(db.insert).not.toHaveBeenCalled()
  })
})

describe('getPaymentLinkStatus', () => {
  // ── Test 14: returns correct status (tenant-scoped) ───────────────────────────

  it('Test 14 — returns correct status for matching businessId', async () => {
    mockSession()

    const mockPaidAt = new Date('2026-04-15T10:00:00Z')
    vi.mocked(db.select).mockReturnValueOnce(
      makeChain([
        {
          status: 'paid',
          paidAt: mockPaidAt,
          momoReference: 'TXN-123456',
        },
      ]) as never,
    )

    const result = await getPaymentLinkStatus(LINK_ID)

    expect(result.status).toBe('paid')
    expect(result.paidAt).toEqual(mockPaidAt)
    expect(result.momoReference).toBe('TXN-123456')
  })

  // ── Test 15: another business's linkId → throws 'not found' ──────────────────

  it("Test 15 — another business's linkId: throws not found", async () => {
    mockSession()

    // DB returns empty because WHERE businessId = session.businessId filtered out the row
    vi.mocked(db.select).mockReturnValueOnce(makeChain([]) as never)

    await expect(getPaymentLinkStatus(LINK_ID)).rejects.toThrow(/not found/i)
  })
})
