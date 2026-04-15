import { notFound, redirect } from 'next/navigation'
import { getServerSession } from '@/lib/session'
import SeedDemoPage from './SeedDemoPage.client'

export const metadata = { title: 'Seed Demo Data — BizSense' }

export default async function DemoSeedPage() {
  // Guard: only accessible in demo mode
  if (process.env.DEMO_MODE !== 'true') {
    notFound()
  }

  // Guard: must be authenticated
  try {
    await getServerSession()
  } catch {
    redirect('/login')
  }

  return <SeedDemoPage />
}
