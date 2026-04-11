import { notFound } from 'next/navigation'
import { getProductById } from '@/actions/products'
import AdjustStockForm from './page.client'

export default async function AdjustStockPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const product = await getProductById(id)

  if (!product) notFound()

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-lg">
        <AdjustStockForm product={product} />
      </div>
    </main>
  )
}
