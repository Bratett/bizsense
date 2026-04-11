import Link from 'next/link'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { businesses } from '@/db/schema'
import { getServerSession, type UserRole } from '@/lib/session'
import { getBalanceSheet } from '@/lib/reports/balanceSheet'
import PeriodSelector from '@/components/reports/PeriodSelector'
import BalanceSheetReport from './page.client'

export const metadata = { title: 'Balance Sheet | BizSense' }

interface PageProps {
  searchParams: Promise<{ date?: string }>
}

export default async function BalanceSheetPage({ searchParams }: PageProps) {
  const session = await getServerSession()
  const ALLOWED: UserRole[] = ['owner', 'manager', 'accountant']
  if (!ALLOWED.includes(session.user.role)) redirect('/access-denied')
  const { businessId } = session.user

  // Read financial year start month from businesses table
  const [biz] = await db
    .select({ financialYearStart: businesses.financialYearStart })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1)

  // financialYearStart is stored as TEXT — could be '1', '4', or '04-01' style.
  // parseInt(raw.split('-')[0]) handles all formats safely.
  const raw    = biz?.financialYearStart ?? null
  const parsed = raw ? parseInt(raw.split('-')[0], 10) : NaN
  const fyMonth = isNaN(parsed) || parsed < 1 || parsed > 12 ? 1 : parsed

  const params    = await searchParams
  const asOfDate  = params.date ?? new Date().toISOString().slice(0, 10)
  const period    = { type: 'asOf' as const, date: asOfDate }

  const bs = await getBalanceSheet(businessId, asOfDate, fyMonth)

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
          <h1 className="text-2xl font-semibold text-gray-900">Balance Sheet</h1>
          <p className="mt-1 text-sm text-gray-500">
            Financial position as at {asOfDate}
          </p>
        </div>

        {/* Period selector */}
        <div className="mb-6">
          <PeriodSelector value={period} mode="asOf" />
        </div>

        {/* Report body */}
        <BalanceSheetReport data={bs} />
      </div>
    </main>
  )
}
