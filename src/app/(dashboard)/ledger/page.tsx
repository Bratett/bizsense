import { getServerSession } from '@/lib/session'
import { getJournalEntries, getTrialBalance } from './queries'
import LedgerTabs from './LedgerTabs.client'

// Next.js 15: searchParams is a Promise in Server Components
interface PageProps {
  searchParams: Promise<{
    tab?: string
    dateFrom?: string
    dateTo?: string
    sourceType?: string
    accountId?: string
    ai?: string
    unbalanced?: string
    page?: string
  }>
}

function firstDayOfMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

function lastDayOfMonth(): string {
  const now = new Date()
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`
}

export default async function LedgerPage({ searchParams }: PageProps) {
  const session = await getServerSession()
  const { businessId } = session.user

  const params = await searchParams

  const dateFrom = params.dateFrom ?? firstDayOfMonth()
  const dateTo = params.dateTo ?? lastDayOfMonth()
  const tab = params.tab ?? 'journal'
  const page = Math.max(1, Number(params.page ?? 1))

  const [entriesResult, trialBalance] = await Promise.all([
    getJournalEntries(
      businessId,
      {
        dateFrom,
        dateTo,
        sourceType: params.sourceType,
        accountId: params.accountId,
        aiGenerated: params.ai === 'true' ? true : undefined,
        unbalancedOnly: params.unbalanced === 'true' ? true : undefined,
      },
      page,
    ),
    getTrialBalance(businessId, dateFrom, dateTo),
  ])

  // Dev diagnostic mode: expose additional columns + seed controls in non-production
  const isDev = process.env.NODE_ENV !== 'production'

  return (
    <LedgerTabs
      tab={tab}
      entriesResult={entriesResult}
      trialBalance={trialBalance}
      isDev={isDev}
      filters={{
        dateFrom,
        dateTo,
        sourceType: params.sourceType,
        aiGenerated: params.ai === 'true',
        unbalancedOnly: params.unbalanced === 'true',
      }}
    />
  )
}
