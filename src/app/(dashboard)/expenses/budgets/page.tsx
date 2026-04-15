import { getServerSession } from '@/lib/session'
import { getExpenseBudgetStatus } from '@/actions/expenseBudgets'
import { listExpenseAccounts } from '@/actions/expenseBudgets'
import BudgetsPageClient from './page.client'

export default async function ExpenseBudgetsPage() {
  const session = await getServerSession()
  const { role } = session.user

  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const [budgetStatuses, expenseAccounts] = await Promise.all([
    getExpenseBudgetStatus(currentMonth),
    listExpenseAccounts(),
  ])

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-2xl">
        <BudgetsPageClient
          initialStatuses={budgetStatuses}
          initialMonth={currentMonth}
          expenseAccounts={expenseAccounts}
          userRole={role}
        />
      </div>
    </main>
  )
}
