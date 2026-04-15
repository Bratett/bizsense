import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { userInvitations, businesses } from '@/db/schema'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { acceptInvitation } from '@/actions/users'

interface Props {
  params: Promise<{ token: string }>
}

export default async function InvitePage({ params }: Props) {
  const { token } = await params

  // Fetch the invitation with business name
  const [invite] = await db
    .select({
      id: userInvitations.id,
      email: userInvitations.email,
      role: userInvitations.role,
      expiresAt: userInvitations.expiresAt,
      acceptedAt: userInvitations.acceptedAt,
      businessName: businesses.name,
    })
    .from(userInvitations)
    .innerJoin(businesses, eq(businesses.id, userInvitations.businessId))
    .where(eq(userInvitations.token, token))
    .limit(1)

  const now = new Date()

  // Token not found
  if (!invite) {
    return <InviteError message="This invitation link is invalid or has expired." />
  }

  // Already accepted
  if (invite.acceptedAt) {
    return (
      <InviteError
        message="This invitation has already been accepted."
        cta={{ label: 'Sign in', href: '/login' }}
      />
    )
  }

  // Expired
  if (invite.expiresAt < now) {
    return (
      <InviteError message="This invitation has expired. Ask the business owner to send a new one." />
    )
  }

  // Check if the visiting user is already authenticated
  const supabase = await createSupabaseServerClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  // If authenticated: accept the invitation server-side and redirect
  if (authUser) {
    try {
      await acceptInvitation(token)
    } catch {
      // Already accepted or other idempotency error — proceed to dashboard
    }
    redirect('/dashboard')
  }

  // Not authenticated: show the invitation card with a login/signup link
  const ROLE_LABELS: Record<string, string> = {
    manager: 'Manager',
    accountant: 'Accountant',
    cashier: 'Cashier',
    owner: 'Owner',
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        {/* Logo / brand */}
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-600 text-white font-bold text-sm">
            B
          </div>
          <span className="text-sm font-semibold text-gray-900">BizSense Ghana</span>
        </div>

        <h1 className="mb-2 text-xl font-semibold text-gray-900">You have been invited</h1>
        <p className="mb-6 text-sm text-gray-600">
          <strong>{invite.businessName}</strong> has invited you to join as{' '}
          <strong>{ROLE_LABELS[invite.role] ?? invite.role}</strong>.
        </p>

        <div className="mb-6 rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm text-gray-700 space-y-1">
          <p>
            <span className="font-medium">Email:</span> {invite.email}
          </p>
          <p>
            <span className="font-medium">Role:</span> {ROLE_LABELS[invite.role] ?? invite.role}
          </p>
          <p>
            <span className="font-medium">Business:</span> {invite.businessName}
          </p>
        </div>

        <p className="mb-4 text-sm text-gray-500">
          Sign in (or create an account) with <strong>{invite.email}</strong> to accept this
          invitation and access BizSense.
        </p>

        <a
          href={`/login?invite=${token}&email=${encodeURIComponent(invite.email)}`}
          className="flex w-full items-center justify-center rounded-lg bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700 transition-colors min-h-[44px]"
        >
          Sign in to accept invitation
        </a>

        <p className="mt-4 text-center text-xs text-gray-400">
          Invitation expires on{' '}
          {invite.expiresAt.toLocaleDateString('en-GH', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </div>
    </div>
  )
}

// ─── Error card ───────────────────────────────────────────────────────────────

function InviteError({ message, cta }: { message: string; cta?: { label: string; href: string } }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8 shadow-sm text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 mx-auto">
          <svg
            className="h-6 w-6 text-red-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>
        <h2 className="mb-2 text-base font-semibold text-gray-900">Invitation Unavailable</h2>
        <p className="mb-6 text-sm text-gray-500">{message}</p>
        {cta && (
          <a
            href={cta.href}
            className="inline-flex items-center justify-center rounded-lg bg-green-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-green-700 transition-colors min-h-[44px]"
          >
            {cta.label}
          </a>
        )}
      </div>
    </div>
  )
}
