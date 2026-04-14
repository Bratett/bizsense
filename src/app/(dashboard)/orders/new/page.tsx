import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { businesses } from '@/db/schema'
import { getServerSession } from '@/lib/session'
import { listCustomers } from '@/actions/customers'
import NewOrderForm from './page.client'

export default async function NewOrderPage() {
  const session = await getServerSession()
  const customers = await listCustomers({ isActive: true })

  const [biz] = await db
    .select({ vatRegistered: businesses.vatRegistered })
    .from(businesses)
    .where(eq(businesses.id, session.user.businessId))

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-lg">
        <NewOrderForm
          customers={customers}
          vatRegistered={biz?.vatRegistered ?? false}
          businessId={session.user.businessId}
          userId={session.user.id}
        />
      </div>
    </main>
  )
}
