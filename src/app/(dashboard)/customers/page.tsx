import { getServerSession } from '@/lib/session'
import { listCustomers } from '@/actions/customers'
import CustomerList from './page.client'
import Fab from '@/components/Fab.client'
import PullToRefresh from '@/components/PullToRefresh.client'

export default async function CustomersPage() {
  await getServerSession()
  const customers = await listCustomers({ isActive: true })
  return (
    <>
      <PullToRefresh>
        <CustomerList initialCustomers={customers} />
      </PullToRefresh>
      <Fab href="/customers/new" label="New Customer" />
    </>
  )
}
