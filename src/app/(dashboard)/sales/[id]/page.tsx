import { getOrderById } from '@/actions/orders'
import { listPaymentsForOrder } from '@/actions/payments'
import SaleDetail from './SaleDetail.client'

export default async function SaleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [order, payments] = await Promise.all([
    getOrderById(id),
    listPaymentsForOrder(id),
  ])

  return <SaleDetail order={order} payments={payments} />
}
