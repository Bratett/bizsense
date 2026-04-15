import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Module mocks (hoisted before imports) ──────────────────────────────────

vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: vi.fn(),
}))

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        inviteUserByEmail: vi.fn(() => Promise.resolve({ data: { user: { id: 'supabase-uid' } }, error: null })),
        updateUserById: vi.fn(() => Promise.resolve({ data: {}, error: null })),
      },
    },
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(),
}))

import { requireRole } from '@/lib/auth/requireRole'
import { db } from '@/db'
import {
  inviteUser,
  cancelInvitation,
  updateUserRole,
  deactivateUser,
} from '../users'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BUSINESS_ID = 'biz-test-001'
const USER_ID = 'user-test-001'
const OTHER_USER_ID = 'user-test-002'
const INVITE_ID = 'invite-001'

function mockOwnerSession() {
  vi.mocked(requireRole).mockResolvedValue({
    id: USER_ID,
    email: 'owner@test.com',
    businessId: BUSINESS_ID,
    role: 'owner' as const,
    fullName: 'Test Owner',
  })
}

function mockCashierSession() {
  vi.mocked(requireRole).mockRejectedValue(new Error('Forbidden: insufficient permissions'))
}

function makeChain(result: unknown[]) {
  const chain: Record<string, unknown> = {
    then: (f?: ((v: unknown) => unknown) | null, r?: ((e: unknown) => unknown) | null) =>
      Promise.resolve(result).then(f, r),
    catch: (f?: ((e: unknown) => unknown) | null) => Promise.resolve(result).catch(f),
    finally: (f?: (() => void) | null) => Promise.resolve(result).finally(f),
    from: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(result)),
    values: vi.fn(() => chain),
  }
  return chain
}

function makeInsertChain() {
  const chain: Record<string, unknown> = {
    then: (f?: ((v: unknown) => unknown) | null, r?: ((e: unknown) => unknown) | null) =>
      Promise.resolve([]).then(f, r),
    catch: (f?: ((e: unknown) => unknown) | null) => Promise.resolve([]).catch(f),
    finally: (f?: (() => void) | null) => Promise.resolve([]).finally(f),
    values: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve([{ id: INVITE_ID }])),
    onConflictDoUpdate: vi.fn(() => chain),
  }
  return chain
}

function makeDeleteChain() {
  const chain: Record<string, unknown> = {
    then: (f?: ((v: unknown) => unknown) | null, r?: ((e: unknown) => unknown) | null) =>
      Promise.resolve([]).then(f, r),
    catch: (f?: ((e: unknown) => unknown) | null) => Promise.resolve([]).catch(f),
    finally: (f?: (() => void) | null) => Promise.resolve([]).finally(f),
    where: vi.fn(() => chain),
  }
  return chain
}

function makeUpdateChain() {
  const chain: Record<string, unknown> = {
    then: (f?: ((v: unknown) => unknown) | null, r?: ((e: unknown) => unknown) | null) =>
      Promise.resolve([]).then(f, r),
    catch: (f?: ((e: unknown) => unknown) | null) => Promise.resolve([]).catch(f),
    finally: (f?: (() => void) | null) => Promise.resolve([]).finally(f),
    set: vi.fn(() => chain),
    where: vi.fn(() => chain),
  }
  return chain
}

beforeEach(() => {
  vi.resetAllMocks()
})

// ─── Test 1: inviteUser creates invitation with expiresAt ≈ 7 days ────────────

describe('inviteUser', () => {
  it('Test 1 — creates invitation with non-expired expiresAt (7 days)', async () => {
    mockOwnerSession()

    // No existing pending invitation
    vi.mocked(db.select).mockReturnValueOnce(makeChain([]) as never)

    const insertChain = makeInsertChain()
    vi.mocked(db.insert).mockReturnValue(insertChain as never)

    const beforeCall = Date.now()
    await inviteUser('newstaff@example.com', 'cashier')
    const afterCall = Date.now()

    // Verify insert was called
    expect(db.insert).toHaveBeenCalled()

    // Capture the values passed to insert
    const insertValuesMock = vi.mocked(insertChain.values as ReturnType<typeof vi.fn>)
    expect(insertValuesMock).toHaveBeenCalled()
    const insertedValues = insertValuesMock.mock.calls[0]?.[0] as { expiresAt: Date } | undefined
    expect(insertedValues).toBeDefined()

    // expiresAt should be approximately 7 days from now
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
    const expiresAt = insertedValues!.expiresAt.getTime()
    expect(expiresAt).toBeGreaterThanOrEqual(beforeCall + sevenDaysMs - 1000)
    expect(expiresAt).toBeLessThanOrEqual(afterCall + sevenDaysMs + 1000)
  })

  // ─── Test 2: duplicate email throws ──────────────────────────────────────────

  it('Test 2 — duplicate pending invite for same email+business throws', async () => {
    mockOwnerSession()

    // Existing pending invitation found
    vi.mocked(db.select).mockReturnValueOnce(
      makeChain([{ id: INVITE_ID }]) as never,
    )

    await expect(inviteUser('existing@example.com', 'manager')).rejects.toThrow(
      'A pending invitation already exists for this email',
    )
  })

  // ─── Test 3: cashier role throws ForbiddenError ───────────────────────────────

  it('Test 3 — cashier calling inviteUser throws ForbiddenError', async () => {
    mockCashierSession()

    await expect(inviteUser('someone@example.com', 'manager')).rejects.toThrow(
      'Forbidden: insufficient permissions',
    )
  })
})

// ─── Test 4: cancelInvitation deletes the record ─────────────────────────────

describe('cancelInvitation', () => {
  it('Test 4 — cancels pending invitation after IDOR guard passes', async () => {
    mockOwnerSession()

    // IDOR guard → finds the invitation
    vi.mocked(db.select).mockReturnValueOnce(makeChain([{ id: INVITE_ID }]) as never)

    // delete chain
    vi.mocked(db.delete).mockReturnValue(makeDeleteChain() as never)

    await cancelInvitation(INVITE_ID)

    expect(db.delete).toHaveBeenCalled()
    const deleteWhere = vi.mocked(
      (makeDeleteChain() as Record<string, ReturnType<typeof vi.fn>>).where,
    )
    // Simply verify db.delete was invoked — IDOR guard passed
    expect(db.delete).toHaveBeenCalledTimes(1)
  })
})

// ─── Test 5: updateUserRole cannot change owner's role ───────────────────────

describe('updateUserRole', () => {
  it('Test 5 — cannot change owner\'s role', async () => {
    mockOwnerSession()

    // Target user is found with role = 'owner'
    vi.mocked(db.select).mockReturnValueOnce(
      makeChain([{ id: OTHER_USER_ID, role: 'owner' }]) as never,
    )

    await expect(updateUserRole(OTHER_USER_ID, 'manager')).rejects.toThrow(
      "Cannot change owner's role",
    )
  })
})

// ─── Test 6: deactivateUser cannot deactivate own account ────────────────────

describe('deactivateUser', () => {
  it('Test 6 — cannot deactivate own account', async () => {
    mockOwnerSession()

    // Try to deactivate self (same userId as session)
    await expect(deactivateUser(USER_ID)).rejects.toThrow(
      'Cannot deactivate your own account',
    )
  })
})
