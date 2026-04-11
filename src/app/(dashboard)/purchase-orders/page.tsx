import { getServerSession } from '@/lib/session'
import { listPurchaseOrders } from '@/actions/purchaseOrders'
import PurchaseOrderList from './page.client'

export default async function PurchaseOrdersPage() {
  await getServerSession()
  const pos = await listPurchaseOrders()
  return <PurchaseOrderList initialPos={pos} />
}
