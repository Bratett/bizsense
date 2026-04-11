import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerSession, type UserRole } from '@/lib/session'
import { getCashFlowStatement } from '@/lib/reports/cashFlow'
import { currentMonthPeriod } from '@/lib/reports/engine'
import PeriodSelector from '@/components/reports/PeriodSelector'
import CashFlowReport from './page.client'

export const metadata = { title: 'Cash Flow Statement | BizSense' }

interface PageProps {
  searchParams: Promise<{
    dateFrom?: string
    dateTo?:   string
  }>
}

export default async function CashFlowPage({ searchParams }: PageProps) {
  const session = await getServerSession()
  const ALLOWED: UserRole[] = ['owner', 'manager', 'accountant']
  if (!ALLOWED.includes(session.user.role)) redirect('/access-denied')
  const { businessId } = session.user

  const params = await searchParams

  // Fall back to current month
  const defaultPeriod = currentMonthPeriod()
  const from = params.dateFrom ?? (defaultPeriod.type === 'range' ? defaultPeriod.from : '')
  const to   = params.dateTo   ?? (defaultPeriod.type === 'range' ? defaultPeriod.to   : '')

  const period = { type: 'range' as const, from, to }
  const cf     = await getCashFlowStatement(businessId, period)

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
          <h1 className="text-2xl font-semibold text-gray-900">Cash Flow Statement</h1>
          <p className="mt-1 text-sm text-gray-500">
            Cash movements for {from} to {to}
          </p>
        </div>

        {/* Period selector */}
        <div className="mb-6">
          <PeriodSelector value={period} mode="range" />
        </div>

        {/* Report body */}
        <CashFlowReport data={cf} />
      </div>
    </main>
  )
}
