import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerSession, type UserRole } from '@/lib/session'
import { getTrialBalance } from '@/lib/reports/trialBalance'
import PeriodSelector from '@/components/reports/PeriodSelector'
import TrialBalanceTable from './page.client'

export const metadata = { title: 'Trial Balance | BizSense' }

interface PageProps {
  searchParams: Promise<{ date?: string }>
}

export default async function TrialBalancePage({ searchParams }: PageProps) {
  const session = await getServerSession()
  const ALLOWED: UserRole[] = ['owner', 'manager', 'accountant']
  if (!ALLOWED.includes(session.user.role)) redirect('/access-denied')
  const { businessId } = session.user

  const params = await searchParams
  const asOfDate = params.date ?? new Date().toISOString().slice(0, 10)

  const tb = await getTrialBalance(businessId, asOfDate)
  const period = { type: 'asOf' as const, date: asOfDate }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-4xl px-4 py-6 md:px-8">
        {/* Header */}
        <div className="mb-1">
          <Link href="/reports" className="text-xs text-green-700 hover:underline">
            ← Reports
          </Link>
        </div>
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Trial Balance</h1>
          <p className="mt-1 text-sm text-gray-500">Cumulative ledger check as at {asOfDate}</p>
        </div>

        {/* Period selector */}
        <div className="mb-6">
          <PeriodSelector value={period} mode="asOf" />
        </div>

        {/* Report body */}
        <TrialBalanceTable data={tb} />
      </div>
    </main>
  )
}
