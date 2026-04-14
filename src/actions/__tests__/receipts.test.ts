import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Module mocks (hoisted before imports) ──────────────────────────────────

vi.mock('@/lib/session', () => ({
  getServerSession: vi.fn(),
}))

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(),
}))

import { getServerSession } from '@/lib/session'
import { db } from '@/db'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { uploadReceipt, getReceiptSignedUrl } from '../receipts'

// ─── Test constants ─────────────────────────────────────────────────────────

const BUSINESS_ID = 'biz-test-001'
const _OTHER_BUSINESS_ID = 'biz-other-999'
const USER_ID = 'user-test-001'
const EXPENSE_ID = 'exp-test-001'

// ─── Mock helpers ───────────────────────────────────────────────────────────

function mockSession(businessId: string = BUSINESS_ID) {
  vi.mocked(getServerSession).mockResolvedValue({
    user: {
      id: USER_ID,
      email: 'owner@test.com',
      businessId,
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
  }
  return chain
}

function mockUpdateChain() {
  const updateChain = {
    set: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    })),
  }
  vi.mocked(db.update).mockReturnValue(updateChain as never)
  return updateChain
}

function mockSupabaseStorage(options?: {
  uploadError?: { message: string } | null
  signedUrl?: string
  signError?: { message: string } | null
}) {
  const {
    uploadError = null,
    signedUrl = 'https://storage.supabase.co/signed/receipts/test.jpg?token=abc',
    signError = null,
  } = options ?? {}

  const storageMock = {
    from: vi.fn(() => ({
      upload: vi.fn().mockResolvedValue({
        data: uploadError ? null : { path: 'receipts/test.jpg' },
        error: uploadError,
      }),
      createSignedUrl: vi.fn().mockResolvedValue({
        data: signError ? null : { signedUrl },
        error: signError,
      }),
      remove: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
  }

  vi.mocked(createSupabaseServerClient).mockResolvedValue({
    storage: storageMock,
  } as never)

  return storageMock
}

// ─── Reset ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('uploadReceipt', () => {
  const validInput = {
    expenseId: EXPENSE_ID,
    fileBase64: Buffer.from('fake-image-data').toString('base64'),
    mimeType: 'image/jpeg',
    fileExtension: 'jpg',
  }

  it('uploads to correct storage path, returns signed URL, and updates DB with path', async () => {
    mockSession()
    vi.mocked(db.select).mockReturnValue(makeChain([{ id: EXPENSE_ID }]) as never)
    const updateChain = mockUpdateChain()
    const storageMock = mockSupabaseStorage()

    const result = await uploadReceipt(validInput)

    expect(result.success).toBe(true)
    if (!result.success) return

    // Path includes businessId, year, month, expenseId
    expect(result.path).toContain(BUSINESS_ID)
    expect(result.path).toContain(EXPENSE_ID)
    expect(result.path).toMatch(/\.jpg$/)
    expect(result.signedUrl).toBeTruthy()

    // Storage upload was called with upsert: true
    const fromCall = storageMock.from.mock.results[0].value
    expect(fromCall.upload).toHaveBeenCalledWith(
      expect.stringContaining(EXPENSE_ID),
      expect.any(Buffer),
      expect.objectContaining({ contentType: 'image/jpeg', upsert: true }),
    )

    // DB update stores the path, not the signed URL
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        receiptUrl: expect.stringContaining(BUSINESS_ID),
      }),
    )
  })

  it('rejects when expense belongs to different business', async () => {
    mockSession()
    // Expense not found for this business (empty result)
    vi.mocked(db.select).mockReturnValue(makeChain([]) as never)

    const result = await uploadReceipt(validInput)

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Expense not found')
    // Storage should never have been called
    expect(createSupabaseServerClient).not.toHaveBeenCalled()
  })

  it('rejects file larger than 5MB after base64 decode', async () => {
    mockSession()
    vi.mocked(db.select).mockReturnValue(makeChain([{ id: EXPENSE_ID }]) as never)

    // Create a base64 string that decodes to > 5MB
    const largeBuffer = Buffer.alloc(6 * 1024 * 1024, 'a')
    const largeInput = {
      ...validInput,
      fileBase64: largeBuffer.toString('base64'),
    }

    const result = await uploadReceipt(largeInput)

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toContain('5MB')
    // Storage should never have been called
    expect(createSupabaseServerClient).not.toHaveBeenCalled()
  })

  it('re-uploading for same expense uses upsert (no duplicate)', async () => {
    mockSession()
    vi.mocked(db.select).mockReturnValue(makeChain([{ id: EXPENSE_ID }]) as never)
    mockUpdateChain()
    const storageMock = mockSupabaseStorage()

    // First upload
    await uploadReceipt(validInput)

    // Verify upsert: true was passed
    const fromCall = storageMock.from.mock.results[0].value
    expect(fromCall.upload).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Buffer),
      expect.objectContaining({ upsert: true }),
    )
  })
})

describe('getReceiptSignedUrl', () => {
  it('returns fresh signed URL for existing receipt', async () => {
    const storedPath = `receipts/${BUSINESS_ID}/2026/04/${EXPENSE_ID}.jpg`
    mockSession()
    vi.mocked(db.select).mockReturnValue(makeChain([{ receiptUrl: storedPath }]) as never)
    const expectedUrl = 'https://storage.supabase.co/signed/test?token=fresh'
    mockSupabaseStorage({ signedUrl: expectedUrl })

    const result = await getReceiptSignedUrl(EXPENSE_ID)

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.signedUrl).toBe(expectedUrl)

    // Verify createSupabaseServerClient was called
    expect(createSupabaseServerClient).toHaveBeenCalled()
  })

  it('returns error when expense has no receipt', async () => {
    mockSession()
    vi.mocked(db.select).mockReturnValue(makeChain([{ receiptUrl: null }]) as never)

    const result = await getReceiptSignedUrl(EXPENSE_ID)

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('No receipt attached')
  })
})
