import { getServerSession } from '@/lib/session'
import { listOrders } from '@/actions/orders'
import OrderList from './page.client'
import Fab from '@/components/Fab.client'
import PullToRefresh from '@/components/PullToRefresh.client'

interface PageProps {
  searchParams: Promise<{ tab?: string; search?: string }>
}

export default async function OrdersPage({ searchParams }: PageProps) {
  await getServerSession()
  const { tab, search } = await searchParams

  const paymentStatus = tab === 'unpaid' ? ('unpaid' as const) : undefined

  const dateRange =
    tab === 'today'
      ? ('today' as const)
      : tab === 'this_week'
        ? ('this_week' as const)
        : tab === 'this_month'
          ? ('this_month' as const)
          : undefined

  const orders = await listOrders({
    paymentStatus,
    dateRange,
    search,
  })

  return (
    <>
      <PullToRefresh>
        <OrderList initialOrders={orders} activeTab={tab ?? 'all'} />
      </PullToRefresh>
      <Fab href="/orders/new" label="New Sale" />
    </>
  )
}
