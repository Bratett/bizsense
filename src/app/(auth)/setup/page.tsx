import { redirect } from 'next/navigation'

/**
 * @deprecated The /setup route was Sprint 1's minimal business creation flow.
 * Sprint 2 replaces it with /signup, which creates the auth user + business
 * + user row atomically. This page now redirects to /signup.
 */
export default async function SetupPage() {
  redirect('/signup')
}
