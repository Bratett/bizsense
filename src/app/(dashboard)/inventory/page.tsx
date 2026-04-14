import { Suspense } from 'react'
import { getServerSession } from '@/lib/session'
import { listProducts, listDistinctCategories } from '@/actions/products'
import ProductList from './page.client'
import Fab from '@/components/Fab.client'
import PullToRefresh from '@/components/PullToRefresh.client'

export default async function InventoryPage() {
  const session = await getServerSession()
  const { businessId, role } = session.user

  const [products, categories] = await Promise.all([listProducts(), listDistinctCategories()])

  return (
    <>
      <PullToRefresh>
        <main className="min-h-screen bg-gray-50 p-4 md:p-8">
          <Suspense
            fallback={
              <div className="mx-auto max-w-4xl animate-pulse">
                <div className="h-8 w-32 rounded bg-gray-200" />
              </div>
            }
          >
            <ProductList
              businessId={businessId}
              initialProducts={products}
              categories={categories}
              userRole={role}
            />
          </Suspense>
        </main>
      </PullToRefresh>
      <Fab href="/inventory/new" label="New Product" />
    </>
  )
}
