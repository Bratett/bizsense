import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // IMPORTANT: supabase.auth.getUser() refreshes the session cookie.
  // Do not add any logic between createServerClient and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // ── Route classification ────────────────────────────────────────────────────
  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/signup')
  const isOnboardingRoute = pathname.startsWith('/onboarding')
  const isSetupRoute = pathname.startsWith('/setup')
  const isDashboardRoute =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/sales') ||
    pathname.startsWith('/orders') ||
    pathname.startsWith('/expenses') ||
    pathname.startsWith('/customers') ||
    pathname.startsWith('/inventory') ||
    pathname.startsWith('/suppliers') ||
    pathname.startsWith('/purchase-orders') ||
    pathname.startsWith('/grn') ||
    pathname.startsWith('/reports') ||
    pathname.startsWith('/payroll') ||
    pathname.startsWith('/payments') ||
    pathname.startsWith('/settings') ||
    pathname.startsWith('/ledger') ||
    pathname.startsWith('/ai')

  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone()
    url.pathname = path
    return NextResponse.redirect(url)
  }

  // ── 1. /setup → /signup (deprecated route) ─────────────────────────────────
  if (isSetupRoute) {
    return redirectTo('/signup')
  }

  // ── 2. Unauthenticated → /login ────────────────────────────────────────────
  if (!user && (isDashboardRoute || isOnboardingRoute)) {
    return redirectTo('/login')
  }

  // ── 3. Authenticated on auth routes → redirect to app ──────────────────────
  if (user && isAuthRoute) {
    if (user.user_metadata?.onboardingCompleted === true) {
      return redirectTo('/dashboard')
    }
    return redirectTo('/onboarding')
  }

  // ── 4. Authenticated but no business → /signup ─────────────────────────────
  // Edge case: auth user exists but business was never created (pre-Sprint 2 users)
  // Exception: /invite/* routes are allowed — the user arrives here directly after
  // clicking a Supabase invite link and needs to complete the acceptance flow.
  if (user && !user.user_metadata?.businessId && (isDashboardRoute || isOnboardingRoute)) {
    if (!pathname.startsWith('/invite')) {
      return redirectTo('/signup')
    }
  }

  // ── 5. Onboarding not complete → /onboarding ──────────────────────────────
  if (user && user.user_metadata?.onboardingCompleted !== true && isDashboardRoute) {
    return redirectTo('/onboarding')
  }

  // ── 6. Onboarding complete → /dashboard (can't re-run onboarding) ──────────
  if (user && user.user_metadata?.onboardingCompleted === true && isOnboardingRoute) {
    return redirectTo('/dashboard')
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files and images.
     * This ensures the session cookie is refreshed on every navigation.
     */
    '/((?!_next/static|_next/image|favicon.ico|icon-192.png|icon-512.png|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
