import { listDistinctCategories } from '@/actions/products'
import NewProductForm from './page.client'

export default async function NewProductPage() {
  const categories = await listDistinctCategories()

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-lg">
        <NewProductForm categories={categories} />
      </div>
    </main>
  )
}
