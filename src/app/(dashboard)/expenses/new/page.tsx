import { getServerSession } from '@/lib/session'
import { db } from '@/db'
import { businesses } from '@/db/schema'
import { eq } from 'drizzle-orm'
import NewExpenseForm from './page.client'

export default async function NewExpensePage() {
  const session = await getServerSession()
  const { businessId, role } = session.user

  const [business] = await db
    .select({ vatRegistered: businesses.vatRegistered })
    .from(businesses)
    .where(eq(businesses.id, businessId))

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-lg">
        <NewExpenseForm
          vatRegistered={business?.vatRegistered ?? false}
          userRole={role}
          businessId={businessId}
        />
      </div>
    </main>
  )
}
