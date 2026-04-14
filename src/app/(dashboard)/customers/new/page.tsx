import { getServerSession } from '@/lib/session'
import CustomerForm from './page.client'

export default async function NewCustomerPage() {
  const session = await getServerSession()
  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-lg">
        <CustomerForm businessId={session.user.businessId} />
      </div>
    </main>
  )
}
