'use server'

import { redirect } from 'next/navigation'
import { db } from '@/db'
import { businesses, users } from '@/db/schema'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

// ─── Sign In ──────────────────────────────────────────────────────────────────

export type SignInState = {
  error: string
}

/**
 * signIn — authenticates the user via Supabase email + password.
 *
 * After successful auth, redirects based on onboarding status:
 *   - onboardingCompleted === true  → /dashboard
 *   - onboardingCompleted !== true  → /onboarding
 *   - no businessId                 → /signup (legacy edge case)
 */
export async function signIn(_prevState: SignInState, formData: FormData): Promise<SignInState> {
  const email = (formData.get('email') as string | null)?.trim() ?? ''
  const password = (formData.get('password') as string | null) ?? ''

  if (!email) return { error: 'Email address is required' }
  if (!password) return { error: 'Password is required' }

  const supabase = await createSupabaseServerClient()

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    if (error.message.toLowerCase().includes('invalid login credentials')) {
      return { error: 'Email or password is incorrect' }
    }
    if (error.message.toLowerCase().includes('email not confirmed')) {
      return { error: 'Please confirm your email address before signing in.' }
    }
    return { error: error.message }
  }

  // Re-fetch user to get fresh metadata after sign-in
  const {
    data: { user: signedInUser },
  } = await supabase.auth.getUser()

  if (!signedInUser?.user_metadata?.businessId) {
    redirect('/signup')
  }

  if (signedInUser.user_metadata.onboardingCompleted === true) {
    redirect('/dashboard')
  } else {
    redirect('/onboarding')
  }
}

// ─── Sign Up ──────────────────────────────────────────────────────────────────

export type SignUpState = {
  errors: {
    fullName?: string
    email?: string
    password?: string
    businessName?: string
    phone?: string
    general?: string
  }
}

/**
 * signUp — creates a new Supabase auth user, business, and user row atomically.
 *
 * Steps:
 *   1. Validate all fields (return all errors at once)
 *   2. Create Supabase auth user via admin API (service role key)
 *   3. Drizzle transaction: insert businesses + users + update user_metadata
 *   4. On any failure after auth user created: delete the auth user
 *   5. Sign in the new user to set the session cookie
 *   6. Redirect to /onboarding
 */
export async function signUp(_prevState: SignUpState, formData: FormData): Promise<SignUpState> {
  const fullName = (formData.get('fullName') as string | null)?.trim() ?? ''
  const email = (formData.get('email') as string | null)?.trim() ?? ''
  const password = (formData.get('password') as string | null) ?? ''
  const businessName = (formData.get('businessName') as string | null)?.trim() ?? ''
  const phone = (formData.get('phone') as string | null)?.trim() ?? ''

  // ── Validate all fields at once ─────────────────────────────────────────────
  const errors: SignUpState['errors'] = {}

  if (!fullName) errors.fullName = 'Full name is required'
  else if (fullName.length < 2) errors.fullName = 'Full name must be at least 2 characters'
  else if (fullName.length > 100) errors.fullName = 'Full name must be 100 characters or less'

  if (!email) errors.email = 'Email address is required'
  else if (!email.includes('@')) errors.email = 'Please enter a valid email address'

  if (!password) errors.password = 'Password is required'
  else if (password.length < 8) errors.password = 'Password must be at least 8 characters'

  if (!businessName) errors.businessName = 'Business name is required'
  else if (businessName.length < 2)
    errors.businessName = 'Business name must be at least 2 characters'
  else if (businessName.length > 100)
    errors.businessName = 'Business name must be 100 characters or less'

  if (Object.keys(errors).length > 0) return { errors }

  // ── Create Supabase auth user ───────────────────────────────────────────────
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { fullName },
  })

  if (authError) {
    if (
      authError.message.toLowerCase().includes('already been registered') ||
      authError.message.toLowerCase().includes('already exists')
    ) {
      return { errors: { email: 'An account with this email already exists' } }
    }
    return { errors: { general: authError.message } }
  }

  // ── Create business + user in a transaction ─────────────────────────────────
  // Metadata update is inside the tx so if it fails, Drizzle rolls back the inserts.
  try {
    await db.transaction(async (tx) => {
      const [business] = await tx
        .insert(businesses)
        .values({ name: businessName, baseCurrency: 'GHS', vatRegistered: false })
        .returning({ id: businesses.id })

      await tx.insert(users).values({
        id: authData.user.id,
        businessId: business.id,
        fullName,
        phone: phone || null,
        role: 'owner',
        isActive: true,
      })

      // Update user_metadata with businessId, role, and onboarding flag
      const { error: metaError } = await supabaseAdmin.auth.admin.updateUserById(authData.user.id, {
        user_metadata: {
          fullName,
          businessId: business.id,
          role: 'owner',
          onboardingCompleted: false,
        },
      })

      if (metaError) throw metaError
    })
  } catch {
    // Rollback: delete the auth user to prevent orphans
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
    return { errors: { general: 'Account creation failed. Please try again.' } }
  }

  // ── Sign in to set session cookie ───────────────────────────────────────────
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signInWithPassword({ email, password })

  redirect('/onboarding')
}

// ─── Sign Out ─────────────────────────────────────────────────────────────────

/**
 * signOut — signs the user out and redirects to /login.
 *
 * TODO (Sprint 9): Clear Dexie IndexedDB before sign-out.
 * Dexie clear must happen on the client (IndexedDB is a browser API, not
 * available in Server Actions). The client component should call a Dexie
 * clear function before invoking this server action.
 */
export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect('/login')
}

// ─── Business Setup (deprecated) ─────────────────────────────────────────────

export type CreateBusinessState = {
  error: string
}

/**
 * @deprecated Use signUp() instead. This was the Sprint 1 placeholder for
 * business creation from the /setup route. The signup flow now creates the
 * auth user + business + user row atomically.
 */
export async function createBusiness(
  _prevState: CreateBusinessState,
  formData: FormData,
): Promise<CreateBusinessState> {
  const name = (formData.get('name') as string | null)?.trim() ?? ''

  if (!name) return { error: 'Business name is required' }
  if (name.length < 2) return { error: 'Business name must be at least 2 characters' }
  if (name.length > 100) return { error: 'Business name must be 100 characters or less' }

  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [business] = await db
    .insert(businesses)
    .values({ name, baseCurrency: 'GHS', vatRegistered: false })
    .returning({ id: businesses.id })

  await db.insert(users).values({
    id: user.id,
    businessId: business.id,
    fullName: user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'Owner',
    role: 'owner',
    isActive: true,
  })

  await supabase.auth.updateUser({
    data: { businessId: business.id, role: 'owner' },
  })

  redirect('/ledger')
}
