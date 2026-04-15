import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { businesses } from '@/db/schema'
import { getServerSession } from '@/lib/session'
import { getOrderById } from '@/actions/orders'
import { getPendingMomoLinkForOrder } from '@/actions/hubtelLinks'
import OrderDetailView from './page.client'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function OrderDetailPage({ params }: PageProps) {
  const session = await getServerSession()
  const { id } = await params
  const [order, biz, momoLink] = await Promise.all([
    getOrderById(id),
    db
      .select({ name: businesses.name, phone: businesses.phone })
      .from(businesses)
      .where(eq(businesses.id, session.user.businessId))
      .then((rows) => rows[0]),
    getPendingMomoLinkForOrder(id),
  ])
  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <OrderDetailView
        order={order}
        businessName={biz?.name ?? ''}
        businessPhone={biz?.phone ?? null}
        momoLink={momoLink}
      />
    </main>
  )
}
