import { getServerSession } from '@/lib/session'
import ExpenseCsvImport from './page.client'

export default async function ExpenseCsvImportPage() {
  const session = await getServerSession()
  const { role } = session.user

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-2xl">
        <ExpenseCsvImport userRole={role} />
      </div>
    </main>
  )
}
