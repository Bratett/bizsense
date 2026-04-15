import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { businesses } from '@/db/schema'
import { getServerSession } from '@/lib/session'
import { getPurchaseOrderById } from '@/actions/purchaseOrders'
import PurchaseOrderDetail from './page.client'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function PurchaseOrderDetailPage({ params }: PageProps) {
  const session = await getServerSession()
  const { id } = await params
  const [po, biz] = await Promise.all([
    getPurchaseOrderById(id),
    db
      .select({ name: businesses.name })
      .from(businesses)
      .where(eq(businesses.id, session.user.businessId))
      .then((rows) => rows[0]),
  ])
  return <PurchaseOrderDetail po={po} businessName={biz?.name ?? ''} />
}
