'use server'

import { and, eq, gt, isNull } from 'drizzle-orm'
import { db } from '@/db'
import { users, userInvitations, businesses } from '@/db/schema'
import { requireRole } from '@/lib/auth/requireRole'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// ─── Invite User ──────────────────────────────────────────────────────────────

export async function inviteUser(email: string, role: string): Promise<void> {
  const user = await requireRole(['owner'])
  const { businessId, id: invitedBy } = user

  // Validate inputs
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Enter a valid email address')
  }
  if (!['manager', 'cashier', 'accountant'].includes(role)) {
    throw new Error('Role must be manager, cashier, or accountant')
  }

  // Check for an existing pending invitation
  const now = new Date()
  const [existing] = await db
    .select({ id: userInvitations.id })
    .from(userInvitations)
    .where(
      and(
        eq(userInvitations.businessId, businessId),
        eq(userInvitations.email, email),
        isNull(userInvitations.acceptedAt),
        gt(userInvitations.expiresAt, now),
      ),
    )
    .limit(1)

  if (existing) {
    throw new Error('A pending invitation already exists for this email')
  }

  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  // Insert invitation record first so the token is available
  await db.insert(userInvitations).values({
    businessId,
    email,
    role,
    token,
    invitedBy,
    expiresAt,
  })

  // Send Supabase invite email (best-effort — invitation record is already created)
  try {
    await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: { businessId, role },
      options: { redirectTo: `${appUrl}/invite/${token}` },
    } as Parameters<typeof supabaseAdmin.auth.admin.inviteUserByEmail>[1])
  } catch {
    // Non-fatal: invitation link is still valid; owner can share it manually
  }
}

// ─── Cancel Invitation ────────────────────────────────────────────────────────

export async function cancelInvitation(invitationId: string): Promise<void> {
  const user = await requireRole(['owner'])
  const { businessId } = user

  // IDOR guard
  const [target] = await db
    .select({ id: userInvitations.id })
    .from(userInvitations)
    .where(and(eq(userInvitations.id, invitationId), eq(userInvitations.businessId, businessId)))
    .limit(1)

  if (!target) throw new Error('Invitation not found')

  await db.delete(userInvitations).where(eq(userInvitations.id, invitationId))
}

// ─── Update User Role ─────────────────────────────────────────────────────────

export async function updateUserRole(userId: string, newRole: string): Promise<void> {
  const user = await requireRole(['owner'])
  const { businessId } = user

  if (!['manager', 'cashier', 'accountant', 'owner'].includes(newRole)) {
    throw new Error('Invalid role')
  }

  // IDOR guard + fetch current role
  const [target] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.businessId, businessId)))
    .limit(1)

  if (!target) throw new Error('User not found')

  if (target.role === 'owner') {
    throw new Error("Cannot change owner's role")
  }

  await db
    .update(users)
    .set({ role: newRole, updatedAt: new Date() })
    .where(eq(users.id, userId))
}

// ─── Deactivate User ──────────────────────────────────────────────────────────

export async function deactivateUser(userId: string): Promise<void> {
  const user = await requireRole(['owner'])
  const { businessId, id: currentUserId } = user

  if (userId === currentUserId) {
    throw new Error('Cannot deactivate your own account')
  }

  // IDOR guard
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.businessId, businessId)))
    .limit(1)

  if (!target) throw new Error('User not found')

  await db
    .update(users)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(users.id, userId))
}

// ─── Accept Invitation ────────────────────────────────────────────────────────
//
// Called from the /invite/[token] page after Supabase has authenticated the
// invitee. Creates the users record and marks the invitation as accepted.

export async function acceptInvitation(token: string): Promise<{ businessId: string }> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) throw new Error('Not authenticated')

  const now = new Date()

  // Fetch the invitation
  const [invite] = await db
    .select({
      id: userInvitations.id,
      businessId: userInvitations.businessId,
      role: userInvitations.role,
      email: userInvitations.email,
      expiresAt: userInvitations.expiresAt,
      acceptedAt: userInvitations.acceptedAt,
    })
    .from(userInvitations)
    .where(eq(userInvitations.token, token))
    .limit(1)

  if (!invite) throw new Error('Invitation not found')
  if (invite.acceptedAt) throw new Error('Invitation already accepted')
  if (invite.expiresAt < now) throw new Error('Invitation has expired')

  // Create the users record (idempotent — ignore if already exists)
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, authUser.id))
    .limit(1)

  if (existing.length === 0) {
    await db.insert(users).values({
      id: authUser.id,
      businessId: invite.businessId,
      fullName: authUser.user_metadata?.full_name ?? null,
      role: invite.role,
      isActive: true,
    })
  }

  // Update Supabase auth metadata so the middleware lets them into /dashboard
  await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
    user_metadata: {
      businessId: invite.businessId,
      role: invite.role,
      onboardingCompleted: true,
    },
  })

  // Mark invitation as accepted
  await db
    .update(userInvitations)
    .set({ acceptedAt: now })
    .where(eq(userInvitations.id, invite.id))

  return { businessId: invite.businessId }
}
