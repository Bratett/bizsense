'use server'

import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/session'
import { seedDemoData } from '@/lib/demo/seed'

export type SeedResult = { success: true } | { success: false; error: string }

export async function triggerDemoSeed(): Promise<SeedResult> {
  // Re-check DEMO_MODE on the server — never trust client-only guards
  if (process.env.DEMO_MODE !== 'true') {
    return { success: false, error: 'Demo mode is not enabled on this server.' }
  }

  const session = await getServerSession()
  const { id: userId, businessId } = session.user

  try {
    await seedDemoData(businessId, userId)
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'An unexpected error occurred during seeding.',
    }
  }

  redirect('/dashboard')
}
