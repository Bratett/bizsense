import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Module mocks (hoisted before imports) ────────────────────────────────────

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
  },
}))

vi.mock('@/lib/atomic', () => ({
  atomicTransactionWrite: vi.fn(),
}))

vi.mock('@/lib/hubtel/client', () => ({
  verifyHubtelWebhookSignature: vi.fn(),
  HUBTEL_SIGNATURE_HEADER: 'x-hubtel-signature',
}))

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { db } from '@/db'
import { atomicTransactionWrite } from '@/lib/atomic'
import { verifyHubtelWebhookSignature } from '@/lib/hubtel/client'
import { POST } from '../hubtel/route'

// ─── Constants ────────────────────────────────────────────────────────────────

const BUSINESS_ID = 'biz-00000000-0000-0000-0000-000000000001'
const ORDER_ID = 'order-00000000-0000-0000-0000-000000000001'
const LINK_ID = 'link-00000000-0000-0000-0000-000000000001'
const CLIENT_REF = 'BSG-AABBCCDD-EEFF0011-ABC123'

const ACCOUNT_IDS: Record<string, string> = {
  '1002': 'acct-mtn-momo',
  '1100': 'acct-ar',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal chain for db.select().from().where()... */
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

/** Build a minimal chainable insert mock */
function makeInsertChain(result: unknown[] = []) {
  const chain: Record<string, unknown> = {
    then: (f?: ((v: unknown) => unknown) | null, r?: ((e: unknown) => unknown) | null) =>
      Promise.resolve(result).then(f, r),
    catch: (f?: ((e: unknown) => unknown) | null) => Promise.resolve(result).catch(f),
    finally: (f?: (() => void) | null) => Promise.resolve(result).finally(f),
    values: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(result)),
  }
  return chain
}

function makeUpdateChain() {
  const chain: Record<string, unknown> = {
    then: (f?: ((v: unknown) => unknown) | null) => Promise.resolve(undefined).then(f),
    catch: (f?: ((e: unknown) => unknown) | null) => Promise.resolve(undefined).catch(f),
    finally: (f?: (() => void) | null) => Promise.resolve(undefined).finally(f),
    set: vi.fn(() => chain),
    where: vi.fn(() => chain),
  }
  return chain
}

/** Make a mock Request for POST() */
function makeRequest(body: object, signature = 'valid-sig'): Request {
  const rawBody = JSON.stringify(body)
  return {
    text: () => Promise.resolve(rawBody),
    headers: {
      get: (key: string) => (key === 'x-hubtel-signature' ? signature : null),
    },
  } as unknown as Request
}

/** Standard successful Hubtel webhook payload */
function makeSuccessPayload(overrides?: Partial<{ Network: string; Amount: number; TransactionId: string; ClientReference: string }>) {
  return {
    ResponseCode: '0000',
    Status: 'Success',
    ClientReference: overrides?.ClientReference ?? CLIENT_REF,
    Data: {
      ClientReference: overrides?.ClientReference ?? CLIENT_REF,
      Amount: overrides?.Amount ?? 100,
      Network: overrides?.Network ?? 'MTN',
      TransactionId: overrides?.TransactionId ?? 'TXN-0001',
      Currency: 'GHS',
    },
  }
}

/** Standard hubtelPaymentLinks row */
function makeLinkRow(overrides?: Partial<{ businessId: string; amount: string }>) {
  return {
    id: LINK_ID,
    businessId: overrides?.businessId ?? BUSINESS_ID,
    orderId: ORDER_ID,
    clientReference: CLIENT_REF,
    hubtelCheckoutId: 'chk-001',
    amount: overrides?.amount ?? '100.00',
    status: 'pending',
  }
}

/** Standard order row */
function makeOrderRow(overrides?: Partial<{ totalAmount: string; amountPaid: string; paymentStatus: string }>) {
  return {
    id: ORDER_ID,
    orderNumber: 'ORD-0001',
    totalAmount: overrides?.totalAmount ?? '100.00',
    amountPaid: overrides?.amountPaid ?? '0.00',
    customerId: 'cust-001',
    paymentStatus: overrides?.paymentStatus ?? 'unpaid',
  }
}

// ─── Captured state ───────────────────────────────────────────────────────────

let capturedJournalInput: unknown = null
let capturedTxInserts: Array<{ table: string; values: unknown }> = []
let capturedTxUpdates: Array<{ table: string; set: unknown }> = []

function mockAtomicWrite() {
  vi.mocked(atomicTransactionWrite).mockImplementation(async (journalInput, writeSourceRecord) => {
    capturedJournalInput = journalInput
    const tx = {
      insert: vi.fn((table: unknown) => {
        const tableInsert = {
          values: vi.fn((values: unknown) => {
            capturedTxInserts.push({ table: String(table), values })
            return Promise.resolve()
          }),
        }
        return tableInsert
      }),
      update: vi.fn((table: unknown) => {
        const tableUpdate = {
          set: vi.fn((setVals: unknown) => {
            capturedTxUpdates.push({ table: String(table), set: setVals })
            return {
              where: vi.fn(() => Promise.resolve()),
            }
          }),
        }
        return tableUpdate
      }),
    }
    return writeSourceRecord(tx as never, 'journal-entry-001')
  })
}

function mockDbSelectSequence(rows: unknown[][]) {
  let callCount = 0
  vi.mocked(db.select).mockImplementation(() => {
    const result = rows[callCount] ?? []
    callCount++
    return makeChain(result) as never
  })
}

function mockDbInsertSuccess() {
  vi.mocked(db.insert).mockReturnValue(makeInsertChain() as never)
}

function mockDbUpdateSuccess() {
  vi.mocked(db.update).mockReturnValue(makeUpdateChain() as never)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks()
  capturedJournalInput = null
  capturedTxInserts = []
  capturedTxUpdates = []
})

describe('Hubtel webhook POST handler', () => {

  // ── Test 1: Valid sig + success payload → payment created, journal balanced ──

  it('Test 1 — valid sig + success: atomicTransactionWrite called with balanced journal', async () => {
    vi.mocked(verifyHubtelWebhookSignature).mockReturnValue(true)
    mockDbInsertSuccess()
    mockDbUpdateSuccess()
    mockDbSelectSequence([
      [makeLinkRow()],                             // hubtelPaymentLinks lookup
      [makeOrderRow()],                            // orders lookup
      [{ id: ACCOUNT_IDS['1002'], code: '1002' }, { id: ACCOUNT_IDS['1100'], code: '1100' }], // accounts
    ])
    mockAtomicWrite()

    const req = makeRequest(makeSuccessPayload())
    const response = await POST(req)

    expect(response.status).toBe(200)
    expect(atomicTransactionWrite).toHaveBeenCalledTimes(1)

    // Journal entry must balance: SUM(debits) = SUM(credits)
    const journal = capturedJournalInput as { lines: Array<{ debitAmount: number; creditAmount: number }> }
    const totalDebits = journal.lines.reduce((s, l) => s + l.debitAmount, 0)
    const totalCredits = journal.lines.reduce((s, l) => s + l.creditAmount, 0)
    expect(totalDebits).toBeCloseTo(totalCredits, 2)
    expect(totalDebits).toBeCloseTo(100, 2) // Amount from payload

    // Dr line: MoMo account (1002)
    const drLine = journal.lines.find((l) => l.debitAmount > 0)
    expect(drLine).toBeDefined()
    expect(drLine!.debitAmount).toBeCloseTo(100, 2)

    // Cr line: AR (1100)
    const crLine = journal.lines.find((l) => l.creditAmount > 0)
    expect(crLine).toBeDefined()
    expect(crLine!.creditAmount).toBeCloseTo(100, 2)
  })

  // ── Test 2: Valid sig + success → order.amountPaid and paymentStatus updated ──

  it('Test 2 — valid sig + success: order payment status and amountPaid updated', async () => {
    vi.mocked(verifyHubtelWebhookSignature).mockReturnValue(true)
    mockDbInsertSuccess()
    mockDbUpdateSuccess()
    mockDbSelectSequence([
      [makeLinkRow()],
      [makeOrderRow({ totalAmount: '100.00', amountPaid: '0.00' })],
      [{ id: ACCOUNT_IDS['1002'], code: '1002' }, { id: ACCOUNT_IDS['1100'], code: '1100' }],
    ])
    mockAtomicWrite()

    const req = makeRequest(makeSuccessPayload({ Amount: 100 }))
    await POST(req)

    // Find the order update inside capturedTxUpdates
    const orderUpdate = capturedTxUpdates.find((u) => u.set && typeof u.set === 'object' && 'amountPaid' in (u.set as object))
    expect(orderUpdate).toBeDefined()
    const updateSet = orderUpdate!.set as { amountPaid: string; paymentStatus: string }
    expect(updateSet.amountPaid).toBe('100.00')
    expect(updateSet.paymentStatus).toBe('paid')
  })

  // ── Test 3: Invalid signature → 401, no DB write ─────────────────────────────

  it('Test 3 — invalid signature: returns 401, no DB writes', async () => {
    vi.mocked(verifyHubtelWebhookSignature).mockReturnValue(false)

    const req = makeRequest(makeSuccessPayload(), 'bad-sig')
    const response = await POST(req)

    expect(response.status).toBe(401)
    expect(db.insert).not.toHaveBeenCalled()
    expect(atomicTransactionWrite).not.toHaveBeenCalled()
  })

  // ── Test 4: Duplicate clientReference → 200, no second payment created ───────

  it('Test 4 — duplicate clientReference: returns 200, atomicTransactionWrite NOT called', async () => {
    vi.mocked(verifyHubtelWebhookSignature).mockReturnValue(true)

    // Simulate Postgres unique constraint violation on the webhook event insert
    const uniqueError = Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505',
    })
    vi.mocked(db.insert).mockReturnValueOnce({
      values: vi.fn(() => { throw uniqueError }),
    } as never)

    const req = makeRequest(makeSuccessPayload())
    const response = await POST(req)

    expect(response.status).toBe(200)
    expect(atomicTransactionWrite).not.toHaveBeenCalled()
  })

  // ── Test 5: clientReference not in hubtelPaymentLinks → 200, event logged 'failed' ──

  it('Test 5 — unknown clientReference: returns 200, event marked failed', async () => {
    vi.mocked(verifyHubtelWebhookSignature).mockReturnValue(true)
    mockDbInsertSuccess()

    const updateChain = makeUpdateChain()
    vi.mocked(db.update).mockReturnValue(updateChain as never)

    // hubtelPaymentLinks lookup returns empty
    vi.mocked(db.select).mockReturnValueOnce(makeChain([]) as never)

    const req = makeRequest(makeSuccessPayload())
    const response = await POST(req)

    expect(response.status).toBe(200)
    expect(atomicTransactionWrite).not.toHaveBeenCalled()
    // update was called to mark event failed
    expect(db.update).toHaveBeenCalled()
    const setCalls = vi.mocked(updateChain.set as ReturnType<typeof vi.fn>).mock.calls
    const failedCall = setCalls.find((args) => (args[0] as { status?: string })?.status === 'failed')
    expect(failedCall).toBeDefined()
  })

  // ── Test 6: Partial payment → paymentStatus = 'partial' ──────────────────────

  it('Test 6 — partial payment: paymentStatus becomes partial', async () => {
    vi.mocked(verifyHubtelWebhookSignature).mockReturnValue(true)
    mockDbInsertSuccess()
    mockDbUpdateSuccess()
    mockDbSelectSequence([
      [makeLinkRow()],
      [makeOrderRow({ totalAmount: '500.00', amountPaid: '100.00' })],
      [{ id: ACCOUNT_IDS['1002'], code: '1002' }, { id: ACCOUNT_IDS['1100'], code: '1100' }],
    ])
    mockAtomicWrite()

    // Payment of 200 on a 500 total with 100 already paid → 300 paid, still partial
    const req = makeRequest(makeSuccessPayload({ Amount: 200 }))
    await POST(req)

    const orderUpdate = capturedTxUpdates.find((u) => 'amountPaid' in (u.set as object))
    const updateSet = orderUpdate!.set as { amountPaid: string; paymentStatus: string }
    expect(updateSet.amountPaid).toBe('300.00')
    expect(updateSet.paymentStatus).toBe('partial')
  })

  // ── Test 7: Full payment → paymentStatus = 'paid' ────────────────────────────

  it('Test 7 — full payment: paymentStatus becomes paid', async () => {
    vi.mocked(verifyHubtelWebhookSignature).mockReturnValue(true)
    mockDbInsertSuccess()
    mockDbUpdateSuccess()
    mockDbSelectSequence([
      [makeLinkRow()],
      [makeOrderRow({ totalAmount: '500.00', amountPaid: '300.00' })],
      [{ id: ACCOUNT_IDS['1002'], code: '1002' }, { id: ACCOUNT_IDS['1100'], code: '1100' }],
    ])
    mockAtomicWrite()

    // Payment of 200 clears the remaining 200 → fully paid
    const req = makeRequest(makeSuccessPayload({ Amount: 200 }))
    await POST(req)

    const orderUpdate = capturedTxUpdates.find((u) => 'amountPaid' in (u.set as object))
    const updateSet = orderUpdate!.set as { amountPaid: string; paymentStatus: string }
    expect(updateSet.amountPaid).toBe('500.00')
    expect(updateSet.paymentStatus).toBe('paid')
  })

  // ── Test 8: atomicTransactionWrite throws → 200, event marked 'failed' ────────

  it('Test 8 — atomicTransactionWrite throws: returns 200, event marked failed, no orphan', async () => {
    vi.mocked(verifyHubtelWebhookSignature).mockReturnValue(true)
    mockDbInsertSuccess()

    const updateChain = makeUpdateChain()
    vi.mocked(db.update).mockReturnValue(updateChain as never)

    mockDbSelectSequence([
      [makeLinkRow()],
      [makeOrderRow()],
      [{ id: ACCOUNT_IDS['1002'], code: '1002' }, { id: ACCOUNT_IDS['1100'], code: '1100' }],
    ])

    vi.mocked(atomicTransactionWrite).mockRejectedValueOnce(new Error('DB connection lost'))

    const req = makeRequest(makeSuccessPayload())
    const response = await POST(req)

    expect(response.status).toBe(200)
    // Event should be marked failed
    expect(db.update).toHaveBeenCalled()
    const setCalls = vi.mocked(updateChain.set as ReturnType<typeof vi.fn>).mock.calls
    const failedCall = setCalls.find((args) => (args[0] as { status?: string })?.status === 'failed')
    expect(failedCall).toBeDefined()
  })

  // ── Test 9: businessId is from link record, NOT from webhook payload ──────────

  it('Test 9 — businessId from link record, not payload', async () => {
    vi.mocked(verifyHubtelWebhookSignature).mockReturnValue(true)
    mockDbInsertSuccess()
    mockDbUpdateSuccess()

    const REAL_BUSINESS_ID = BUSINESS_ID
    const FAKE_BUSINESS_ID = 'attacker-business-id-0000000000000'

    // Link record has the real businessId
    mockDbSelectSequence([
      [makeLinkRow({ businessId: REAL_BUSINESS_ID })],
      [makeOrderRow()],
      [{ id: ACCOUNT_IDS['1002'], code: '1002' }, { id: ACCOUNT_IDS['1100'], code: '1100' }],
    ])
    mockAtomicWrite()

    // Payload includes a fraudulent businessId field — must be ignored
    const payloadWithFraudulentField = {
      ...makeSuccessPayload(),
      businessId: FAKE_BUSINESS_ID,         // attacker-supplied — must never be used
      Data: {
        ...makeSuccessPayload().Data,
        businessId: FAKE_BUSINESS_ID,       // also in Data — must never be used
      },
    }

    const req = makeRequest(payloadWithFraudulentField)
    await POST(req)

    // The journal entry must reference the real businessId from the link record
    const journal = capturedJournalInput as { businessId: string }
    expect(journal.businessId).toBe(REAL_BUSINESS_ID)
    expect(journal.businessId).not.toBe(FAKE_BUSINESS_ID)
  })

})
