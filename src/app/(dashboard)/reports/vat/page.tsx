import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerSession, type UserRole } from '@/lib/session'
import { getVatReport } from '@/lib/reports/vat'
import { quarterPeriod } from '@/lib/reports/engine'
import PeriodSelector from '@/components/reports/PeriodSelector'
import VatReportClient from './page.client'

export const metadata = { title: 'VAT Report | BizSense' }

interface PageProps {
  searchParams: Promise<{
    dateFrom?: string
    dateTo?:   string
  }>
}

export default async function VatReportPage({ searchParams }: PageProps) {
  const session = await getServerSession()
  const ALLOWED: UserRole[] = ['owner', 'manager', 'accountant']
  if (!ALLOWED.includes(session.user.role)) redirect('/access-denied')
  const { businessId } = session.user

  const params = await searchParams

  // Default to current quarter — the standard GRA filing period
  const now            = new Date()
  const year           = now.getFullYear()
  const quarter        = (Math.floor(now.getMonth() / 3) + 1) as 1 | 2 | 3 | 4
  const defaultPeriod  = quarterPeriod(year, quarter)
  const defaultFrom    = defaultPeriod.type === 'range' ? defaultPeriod.from : ''
  const defaultTo      = defaultPeriod.type === 'range' ? defaultPeriod.to   : ''

  const from = params.dateFrom ?? defaultFrom
  const to   = params.dateTo   ?? defaultTo

  const period: { type: 'range'; from: string; to: string } = { type: 'range', from, to }

  const report = await getVatReport(businessId, { from, to })

  // Non-VAT-registered business — redirect to reports hub
  if (!report) {
    redirect('/reports')
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-4xl px-4 py-6 md:px-8">
        {/* Breadcrumb */}
        <div className="mb-1">
          <Link href="/reports" className="text-xs text-green-700 hover:underline">
            ← Reports
          </Link>
        </div>

        {/* Header */}
        <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">VAT Report</h1>
            <p className="mt-1 text-sm text-gray-500">
              Output and input VAT for GRA quarterly filing
            </p>
            {report.vatRegistrationNumber && (
              <p className="mt-0.5 text-xs text-gray-400">
                VAT Reg: {report.vatRegistrationNumber}
              </p>
            )}
          </div>
        </div>

        {/* Period selector */}
        <div className="mb-6">
          <PeriodSelector value={period} mode="range" />
        </div>

        {/* Report body */}
        <VatReportClient data={report} period={period} />
      </div>
    </main>
  )
}
