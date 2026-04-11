import Link from 'next/link'
import { getServerSession } from '@/lib/session'
import { getExpenseReport } from '@/lib/reports/expenses'
import { currentMonthPeriod } from '@/lib/reports/engine'
import PeriodSelector from '@/components/reports/PeriodSelector'
import ExpenseReportTable from './page.client'

export const metadata = { title: 'Expense Report | BizSense' }

interface PageProps {
  searchParams: Promise<{
    dateFrom?: string
    dateTo?: string
    compare?: string
  }>
}

export default async function ExpensesReportPage({ searchParams }: PageProps) {
  const session = await getServerSession()
  const { businessId } = session.user

  const params = await searchParams
  const compare = params.compare === '1'

  const defaultPeriod = currentMonthPeriod()
  const from = params.dateFrom ?? (defaultPeriod.type === 'range' ? defaultPeriod.from : '')
  const to = params.dateTo ?? (defaultPeriod.type === 'range' ? defaultPeriod.to : '')

  const period = { type: 'range' as const, from, to }
  const report = await getExpenseReport(businessId, { from, to }, compare)

  const compareHref = compare
    ? `?dateFrom=${from}&dateTo=${to}`
    : `?dateFrom=${from}&dateTo=${to}&compare=1`

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-4xl px-4 py-6 md:px-8">
        {/* Header */}
        <div className="mb-1">
          <Link href="/reports" className="text-xs text-green-700 hover:underline">
            ← Reports
          </Link>
        </div>
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Expense Report</h1>
            <p className="mt-1 text-sm text-gray-500">
              Spending by category for the selected period
            </p>
          </div>
          <Link
            href={compareHref}
            className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
              compare
                ? 'border-green-700 bg-green-700 text-white'
                : 'border-gray-300 bg-white text-gray-700 hover:border-green-300 hover:text-green-700'
            }`}
          >
            Compare to prior period
          </Link>
        </div>

        {/* Period selector */}
        <div className="mb-6">
          <PeriodSelector value={period} mode="range" />
        </div>

        {/* Report body */}
        <ExpenseReportTable data={report} />
      </div>
    </main>
  )
}
