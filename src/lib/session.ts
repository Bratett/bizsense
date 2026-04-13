import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export type UserRole = 'owner' | 'manager' | 'accountant' | 'cashier'

export interface AppSession {
  user: {
    id: string
    email: string
    businessId: string
    role: UserRole
    fullName: string | null
  }
}

/**
 * getServerSession — resolves the authenticated user and their business context.
 *
 * businessId and role are read from the `users` table — the authoritative source.
 * user_metadata is used only by middleware for fast routing; it is not trusted here
 * for business logic. This means a role change in the `users` table takes effect on
 * the next request without requiring a Supabase auth metadata update.
 *
 * Throws 'Unauthenticated' if no valid Supabase session exists.
 * Throws 'No business associated with this account' if the users table has no row
 * for this auth user (should not happen after signup, but guards against edge cases).
 */
export async function getServerSession(): Promise<AppSession> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new Error('Unauthenticated')
  }

  const [userRecord] = await db
    .select({
      businessId: users.businessId,
      role: users.role,
      fullName: users.fullName,
    })
    .from(users)
    .where(eq(users.id, user.id))

  if (!userRecord) {
    throw new Error('No business associated with this account')
  }

  return {
    user: {
      id: user.id,
      email: user.email!,
      businessId: userRecord.businessId,
      role: userRecord.role as UserRole,
      fullName: userRecord.fullName,
    },
  }
}
