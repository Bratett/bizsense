import { notFound } from 'next/navigation'
import { getServerSession } from '@/lib/session'
import { getProductById } from '@/actions/products'
import ProductDetailView from './page.client'

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await getServerSession()
  const product = await getProductById(id)

  if (!product) notFound()

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-lg">
        <ProductDetailView product={product} userRole={session.user.role} />
      </div>
    </main>
  )
}
