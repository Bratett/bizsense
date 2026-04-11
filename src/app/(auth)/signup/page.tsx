import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import SignupForm from './SignupForm.client'

export default async function SignupPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    if (user.user_metadata?.onboardingCompleted === true) {
      redirect('/dashboard')
    } else {
      redirect('/onboarding')
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        {/* Logo / wordmark */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-green-700 mb-4">
            <span className="text-white font-bold text-xl">B</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">BizSense Ghana</h1>
          <p className="mt-1 text-sm text-gray-500">Create your business account</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-white border border-gray-200 shadow-sm px-6 py-8">
          <SignupForm />
        </div>

        <p className="mt-6 text-center text-sm text-gray-500">
          Already have an account?{' '}
          <a href="/login" className="text-green-700 font-medium hover:underline">
            Sign in
          </a>
        </p>

        <p className="mt-4 text-center text-xs text-gray-400">
          Offline-first &middot; Powered by GHS &middot; Made for Ghana
        </p>
      </div>
    </main>
  )
}
