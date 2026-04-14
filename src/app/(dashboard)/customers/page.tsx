import { getServerSession } from '@/lib/session'
import { listCustomers } from '@/actions/customers'
import CustomerList from './page.client'
import Fab from '@/components/Fab.client'
import PullToRefresh from '@/components/PullToRefresh.client'

export default async function CustomersPage() {
  const session = await getServerSession()
  const { businessId } = session.user
  const customers = await listCustomers({ isActive: true })
  return (
    <>
      <PullToRefresh>
        <CustomerList businessId={businessId} initialCustomers={customers} />
      </PullToRefresh>
      <Fab href="/customers/new" label="New Customer" />
    </>
  )
}
