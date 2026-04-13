import { getServerSession } from '@/lib/session'
import { getOrderById } from '@/actions/orders'
import OrderDetailView from './page.client'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function OrderDetailPage({ params }: PageProps) {
  await getServerSession()
  const { id } = await params
  const order = await getOrderById(id)
  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <OrderDetailView order={order} />
    </main>
  )
}
