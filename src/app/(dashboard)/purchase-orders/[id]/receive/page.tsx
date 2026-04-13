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
  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <ReceiveGoodsForm po={po} />
    </main>
  )
}
