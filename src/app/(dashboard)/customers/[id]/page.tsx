import { getServerSession } from '@/lib/session'
import { getCustomerById } from '@/actions/customers'
import CustomerDetail from './page.client'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function CustomerDetailPage({ params }: PageProps) {
  await getServerSession()
  const { id } = await params
  const customer = await getCustomerById(id)
  return <CustomerDetail customer={customer} />
}
