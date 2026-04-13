import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/session'
import { getAiActivityLog } from '@/actions/aiPromotions'
import { ActivityLogClient } from './ActivityLog.client'

interface PageProps {
  searchParams: Promise<{ status?: string; dateFrom?: string; dateTo?: string }>
}

export default async function AiActivityPage({ searchParams }: PageProps) {
  const session = await getServerSession()
  const { role } = session.user

  if (role === 'cashier') {
    redirect('/dashboard')
  }

  const params = await searchParams

  const status =
    (params.status as 'all' | 'confirmed' | 'rejected' | 'pending' | 'expired') ?? 'all'

  // Default date range: last 7 days
  const today = new Date()
  const sevenDaysAgo = new Date(today)
  sevenDaysAgo.setDate(today.getDate() - 7)

  const dateFrom = params.dateFrom ?? sevenDaysAgo.toISOString().slice(0, 10)
  const dateTo = params.dateTo ?? today.toISOString().slice(0, 10)

  const { actions, flaggedLogs } = await getAiActivityLog({ status, dateFrom, dateTo })

  return (
    <main className="mx-auto max-w-4xl p-4 md:p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">AI Activity Log</h1>
        <a href="/ai" className="text-sm text-green-700 hover:underline">
          ← Back to Chat
        </a>
      </div>

      <ActivityLogClient
        actions={actions}
        flaggedLogs={flaggedLogs}
        userRole={role}
        initialStatus={status}
        initialDateFrom={dateFrom}
        initialDateTo={dateTo}
      />
    </main>
  )
}
