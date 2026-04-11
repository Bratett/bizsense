import Link from 'next/link'
import { getServerSession } from '@/lib/session'
import { getSalesReport } from '@/lib/reports/sales'
import { currentMonthPeriod } from '@/lib/reports/engine'
import PeriodSelector from '@/components/reports/PeriodSelector'
import SalesReportTable from './SalesReport.client'
import type { SalesGroupBy } from '@/lib/reports/sales'

export const metadata = { title: 'Sales Report | BizSense' }

const VALID_GROUP_BY: SalesGroupBy[] = ['product', 'customer', 'day', 'week', 'month']

interface PageProps {
  searchParams: Promise<{
    dateFrom?: string
    dateTo?:   string
    groupBy?:  string
  }>
}

export default async function SalesReportPage({ searchParams }: PageProps) {
  const session = await getServerSession()
  const { businessId } = session.user

  const params = await searchParams

  const defaultPeriod = currentMonthPeriod()
  const from = params.dateFrom ?? (defaultPeriod.type === 'range' ? defaultPeriod.from : '')
  const to   = params.dateTo   ?? (defaultPeriod.type === 'range' ? defaultPeriod.to   : '')

  const groupBy: SalesGroupBy = VALID_GROUP_BY.includes(params.groupBy as SalesGroupBy)
    ? (params.groupBy as SalesGroupBy)
    : 'product'

  const period = { type: 'range' as const, from, to }
  const report = await getSalesReport(businessId, { from, to }, groupBy)

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
        {/* Header */}
        <div className="mb-1">
          <Link href="/reports" className="text-xs text-green-700 hover:underline">
            ← Reports
          </Link>
        </div>
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Sales Report</h1>
          <p className="mt-1 text-sm text-gray-500">Fulfilled orders broken down by {groupBy}</p>
        </div>

        {/* Period selector */}
        <div className="mb-6">
          <PeriodSelector value={period} mode="range" />
        </div>

        {/* Report body */}
        <SalesReportTable data={report} />
      </div>
    </main>
  )
}
