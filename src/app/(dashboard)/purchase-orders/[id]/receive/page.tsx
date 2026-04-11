import { getServerSession } from '@/lib/session'
import { getPurchaseOrderById } from '@/actions/purchaseOrders'
import ReceiveGoodsForm from './page.client'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ReceiveGoodsPage({ params }: PageProps) {
  await getServerSession()
  const { id } = await params
  const po = await getPurchaseOrderById(id)
  return <ReceiveGoodsForm po={po} />
}
