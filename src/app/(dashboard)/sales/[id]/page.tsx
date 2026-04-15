import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { businesses } from '@/db/schema'
import { getServerSession } from '@/lib/session'
import { getOrderById } from '@/actions/orders'
import { listPaymentsForOrder } from '@/actions/payments'
import SaleDetail from './SaleDetail.client'

export default async function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession()
  const { id } = await params
  const [order, payments, biz] = await Promise.all([
    getOrderById(id),
    listPaymentsForOrder(id),
    db
      .select({ name: businesses.name, phone: businesses.phone })
      .from(businesses)
      .where(eq(businesses.id, session.user.businessId))
      .then((rows) => rows[0]),
  ])

  return (
    <SaleDetail
      order={order}
      payments={payments}
      businessName={biz?.name ?? ''}
      businessPhone={biz?.phone ?? null}
    />
  )
}
