import { getServerSession } from '@/lib/session'
import { listSuppliers } from '@/actions/suppliers'
import { listProducts } from '@/actions/products'
import WalkInGrnForm from './page.client'

export default async function NewGrnPage() {
  await getServerSession()
  const [suppliers, products] = await Promise.all([listSuppliers(), listProducts()])
  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <WalkInGrnForm suppliers={suppliers} products={products} />
    </main>
  )
}
