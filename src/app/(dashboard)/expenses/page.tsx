import { getServerSession } from '@/lib/session'
import { listExpenses, getExpenseSummary } from '@/actions/expenses'
import ExpenseList from './page.client'
import Fab from '@/components/Fab.client'
import PullToRefresh from '@/components/PullToRefresh.client'

export default async function ExpensesPage() {
  const session = await getServerSession()
  const { businessId, role } = session.user

  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const dateFrom = thirtyDaysAgo.toISOString().split('T')[0]
  const dateTo = now.toISOString().split('T')[0]

  const [expenses, summary] = await Promise.all([
    listExpenses(),
    getExpenseSummary(dateFrom, dateTo),
  ])

  return (
    <>
      <PullToRefresh>
        <main className="min-h-screen bg-gray-50 p-4 md:p-8">
          <ExpenseList
            businessId={businessId}
            initialExpenses={expenses}
            summary={summary}
            userRole={role}
          />
        </main>
      </PullToRefresh>
      <Fab href="/expenses/new" label="New Expense" />
    </>
  )
}
