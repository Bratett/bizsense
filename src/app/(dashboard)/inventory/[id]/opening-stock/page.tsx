import { notFound } from 'next/navigation'
import { getProductById } from '@/actions/products'
import OpeningStockForm from './page.client'

export default async function OpeningStockPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const product = await getProductById(id)

  if (!product) notFound()

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-lg">
        <OpeningStockForm product={product} />
      </div>
    </main>
  )
}
