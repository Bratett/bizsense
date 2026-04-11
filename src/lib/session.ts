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

export async function getServerSession(): Promise<AppSession> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new Error('Unauthenticated')
  }

  const businessId = user.user_metadata?.businessId as string | undefined
  const role = (user.user_metadata?.role ?? 'cashier') as UserRole
  const fullName = (user.user_metadata?.fullName as string | null) ?? null

  if (!businessId) {
    throw new Error('No business associated with this account')
  }

  return {
    user: {
      id: user.id,
      email: user.email!,
      businessId,
      role,
      fullName,
    },
  }
}
