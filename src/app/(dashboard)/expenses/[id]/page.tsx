import { getServerSession } from '@/lib/session'
import { getExpenseById } from '@/actions/expenses'
import ExpenseDetailView from './page.client'

export default async function ExpenseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession()
  const { id } = await params
  const expense = await getExpenseById(id)

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-lg">
        <ExpenseDetailView expense={expense} userRole={session.user.role} />
      </div>
    </main>
  )
}
