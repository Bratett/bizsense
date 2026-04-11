import Link from 'next/link'
import { getServerSession } from '@/lib/session'
import { getArAging } from '@/lib/reports/arAging'
import { getSingleAccountBalance } from '@/lib/reports/engine'
import { computeReconciliationStatus } from '@/lib/reports/arAging'
import ArAgingClient from './page.client'

export const metadata = { title: 'AR Aging | BizSense' }

interface PageProps {
  searchParams: Promise<{ date?: string }>
}

export default async function ArAgingPage({ searchParams }: PageProps) {
  const session = await getServerSession()
  const { businessId } = session.user

  const params = await searchParams
  const asOfDate = params.date ?? new Date().toISOString().slice(0, 10)

  const [report, arLedgerBalance] = await Promise.all([
    getArAging(businessId, asOfDate),
    getSingleAccountBalance(businessId, '1100', { type: 'asOf', date: asOfDate }),
  ])

  const { isReconciled, diff } = computeReconciliationStatus(
    report.grandTotals.total,
    arLedgerBalance,
  )

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">
        <div className="mb-1">
          <Link href="/reports" className="text-xs text-green-700 hover:underline">
            ← Reports
          </Link>
        </div>
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Accounts Receivable — Aging Report
            </h1>
            <p className="mt-1 text-sm text-gray-500">as at {asOfDate}</p>
          </div>
          <Link
            href={`/reports/ar-aging?date=${new Date().toISOString().slice(0, 10)}`}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 whitespace-nowrap"
          >
            Refresh
          </Link>
        </div>

        <ArAgingClient
          report={report}
          arLedgerBalance={arLedgerBalance}
          isReconciled={isReconciled}
          reconciliationDiff={diff}
        />
      </div>
    </main>
  )
}
