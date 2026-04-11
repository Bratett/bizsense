import { getServerSession } from '@/lib/session'
import { getCustomerById } from '@/actions/customers'
import EditCustomerForm from './page.client'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditCustomerPage({ params }: PageProps) {
  await getServerSession()
  const { id } = await params
  const customer = await getCustomerById(id)
  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-lg">
        <EditCustomerForm customer={customer} />
      </div>
    </main>
  )
}
