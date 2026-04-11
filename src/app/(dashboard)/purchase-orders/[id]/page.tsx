import { getServerSession } from '@/lib/session'
import { getPurchaseOrderById } from '@/actions/purchaseOrders'
import PurchaseOrderDetail from './page.client'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function PurchaseOrderDetailPage({ params }: PageProps) {
  await getServerSession()
  const { id } = await params
  const po = await getPurchaseOrderById(id)
  return <PurchaseOrderDetail po={po} />
}
