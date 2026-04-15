import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Module mocks (hoisted before imports) ──────────────────────────────────

vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: vi.fn(),
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

import { requireRole } from '@/lib/auth/requireRole'
import { db } from '@/db'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { uploadProductImage, removeProductImage } from '../inventory'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BUSINESS_ID = 'biz-001'
const USER_ID = 'user-001'
const PRODUCT_ID = 'prod-001'
const STORAGE_PATH = `${BUSINESS_ID}/${PRODUCT_ID}.jpg`
const PUBLIC_URL = `https://cdn.supabase.co/storage/v1/object/public/product-images/${STORAGE_PATH}`

function mockOwner() {
  vi.mocked(requireRole).mockResolvedValue({
    id: USER_ID,
    email: 'owner@test.com',
    businessId: BUSINESS_ID,
    role: 'owner' as const,
    fullName: 'Test Owner',
  })
}

/** Builds a Drizzle-style fluent chain that resolves to `result`. */
function makeChain(result: unknown[]) {
  const chain: Record<string, unknown> = {
    then: (f?: ((v: unknown) => unknown) | null, r?: ((e: unknown) => unknown) | null) =>
      Promise.resolve(result).then(f, r),
    catch: (f?: ((e: unknown) => unknown) | null) => Promise.resolve(result).catch(f),
    finally: (f?: (() => void) | null) => Promise.resolve(result).finally(f),
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    set: vi.fn(() => chain),
    values: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(result)),
  }
  return chain
}

/** Builds the Supabase storage mock. */
function makeStorageMock(overrides?: { uploadError?: { message: string } | null }) {
  const uploadError = overrides?.uploadError ?? null
  const uploadMock = vi.fn().mockResolvedValue({ data: null, error: uploadError })
  const removeMock = vi.fn().mockResolvedValue({ data: null, error: null })
  const getPublicUrlMock = vi.fn().mockReturnValue({ data: { publicUrl: PUBLIC_URL } })

  const fromMock = vi.fn(() => ({
    upload: uploadMock,
    remove: removeMock,
    getPublicUrl: getPublicUrlMock,
  }))

  vi.mocked(createSupabaseServerClient).mockResolvedValue({
    storage: { from: fromMock },
  } as never)

  return { fromMock, uploadMock, removeMock, getPublicUrlMock }
}

const VALID_INPUT = {
  productId: PRODUCT_ID,
  fileBase64: Buffer.from('fake-image-bytes').toString('base64'),
  mimeType: 'image/jpeg',
  extension: 'jpg',
}

beforeEach(() => {
  vi.resetAllMocks()
})

// ─── uploadProductImage ───────────────────────────────────────────────────────

describe('uploadProductImage', () => {
  it('Test 1 — uploads file to Supabase Storage at {businessId}/{productId}.jpg', async () => {
    mockOwner()
    vi.mocked(db.select).mockReturnValue(makeChain([{ id: PRODUCT_ID }]) as never)
    vi.mocked(db.update).mockReturnValue(makeChain([]) as never)
    const { fromMock, uploadMock } = makeStorageMock()

    await uploadProductImage(VALID_INPUT)

    expect(fromMock).toHaveBeenCalledWith('product-images')
    expect(uploadMock).toHaveBeenCalledWith(
      STORAGE_PATH,
      expect.any(Buffer),
      expect.objectContaining({ contentType: 'image/jpeg', upsert: true }),
    )
  })

  it('Test 2 — updates products.imageUrl to the public URL returned by Supabase', async () => {
    mockOwner()
    const updateChain = makeChain([])
    vi.mocked(db.select).mockReturnValue(makeChain([{ id: PRODUCT_ID }]) as never)
    vi.mocked(db.update).mockReturnValue(updateChain as never)
    makeStorageMock()

    const result = await uploadProductImage(VALID_INPUT)

    expect(result.imageUrl).toBe(PUBLIC_URL)
    // The update chain's set() was called
    expect(db.update).toHaveBeenCalled()
    const setMock = vi.mocked(updateChain.set as ReturnType<typeof vi.fn>)
    expect(setMock).toHaveBeenCalledWith(expect.objectContaining({ imageUrl: PUBLIC_URL }))
  })

  it('Test 3 — throws ForbiddenError when product belongs to a different business', async () => {
    mockOwner()
    // db.select returns empty array → product not found for this business
    vi.mocked(db.select).mockReturnValue(makeChain([]) as never)
    makeStorageMock()

    await expect(uploadProductImage(VALID_INPUT)).rejects.toThrow(/Forbidden/)
    // Storage upload should NOT have been called
    const { uploadMock } = makeStorageMock()
    expect(uploadMock).not.toHaveBeenCalled()
  })
})

// ─── removeProductImage ───────────────────────────────────────────────────────

describe('removeProductImage', () => {
  it('Test 4 — sets products.imageUrl to null and calls Storage remove', async () => {
    mockOwner()
    const updateChain = makeChain([])
    vi.mocked(db.select).mockReturnValue(
      makeChain([{ id: PRODUCT_ID, imageUrl: PUBLIC_URL }]) as never,
    )
    vi.mocked(db.update).mockReturnValue(updateChain as never)
    const { fromMock, removeMock } = makeStorageMock()

    await removeProductImage(PRODUCT_ID)

    // Storage.remove called with the correct path
    expect(fromMock).toHaveBeenCalledWith('product-images')
    expect(removeMock).toHaveBeenCalledWith([STORAGE_PATH])

    // imageUrl set to null in database
    const setMock = vi.mocked(updateChain.set as ReturnType<typeof vi.fn>)
    expect(setMock).toHaveBeenCalledWith(expect.objectContaining({ imageUrl: null }))
  })
})
