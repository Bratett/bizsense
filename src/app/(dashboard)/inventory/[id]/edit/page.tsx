import { notFound } from 'next/navigation'
import { getProductById, listDistinctCategories } from '@/actions/products'
import EditProductForm from './page.client'

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [product, categories] = await Promise.all([
    getProductById(id),
    listDistinctCategories(),
  ])

  if (!product) notFound()

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-lg">
        <EditProductForm product={product} categories={categories} />
      </div>
    </main>
  )
}
