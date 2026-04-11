import { getServerSession } from '@/lib/session'
import { listSuppliers } from '@/actions/suppliers'
import { listProducts } from '@/actions/products'
import WalkInGrnForm from './page.client'

export default async function NewGrnPage() {
  await getServerSession()
  const [suppliers, products] = await Promise.all([listSuppliers(), listProducts()])
  return <WalkInGrnForm suppliers={suppliers} products={products} />
}
