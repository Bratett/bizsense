'use client'

import { useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import type { ProductListItem } from '@/actions/products'
import type { UserRole } from '@/lib/session'
import { useProductsWithStock } from '@/lib/offline/dexieHooks'
import SwipeableRow from '@/components/SwipeableRow.client'
import { formatGhs } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SearchInput } from '@/components/ui/search-input'
import { StatusDot } from '@/components/ui/status-dot'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Plus, Package } from 'lucide-react'

type StockFilter = 'all' | 'low_stock' | 'out_of_stock'

const FILTER_TABS: { key: StockFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'low_stock', label: 'Low Stock' },
  { key: 'out_of_stock', label: 'Out of Stock' },
]

// Generic product shape compatible with both ProductListItem and DexieProductWithStock
interface DisplayProduct {
  id: string
  name: string
  sku: string | null
  category: string | null
  unit: string | null
  currentStock: number
  stockValue: number
  sellingPrice: number | string | null
  reorderLevel: number
  trackInventory: boolean
  imageUrl?: string | null
}

function stockStatus(product: DisplayProduct) {
  if (!product.trackInventory) return { color: 'gray' as const, label: 'Not tracked' }
  if (product.currentStock <= 0) return { color: 'red' as const, label: 'Out of stock' }
  if (product.reorderLevel > 0 && product.currentStock <= product.reorderLevel)
    return { color: 'amber' as const, label: 'Low stock' }
  return { color: 'green' as const, label: 'In stock' }
}

const STATUS_TEXT: Record<string, string> = {
  green: 'text-green-700',
  amber: 'text-amber-700',
  red: 'text-red-600',
  gray: 'text-gray-500',
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ProductList({
  businessId,
  initialProducts,
  categories,
  userRole,
}: {
  businessId: string
  initialProducts: ProductListItem[]
  categories: string[]
  userRole: UserRole
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialFilter = searchParams.get('filter') as StockFilter | null

  const [search, setSearch] = useState('')
  const [stockFilter, setStockFilter] = useState<StockFilter>(
    initialFilter && ['low_stock', 'out_of_stock'].includes(initialFilter) ? initialFilter : 'all',
  )
  const [categoryFilter, setCategoryFilter] = useState('')

  // Live from Dexie — filters by name; SKU filter applied below client-side
  const dexieProducts = useProductsWithStock(businessId)

  // Build display list from Dexie (preferred) or SSR fallback
  const allProducts: DisplayProduct[] =
    dexieProducts !== undefined
      ? dexieProducts.map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          category: p.category,
          unit: p.unit,
          currentStock: p.currentStock,
          stockValue: p.stockValue,
          sellingPrice: p.sellingPrice,
          reorderLevel: p.reorderLevel,
          trackInventory: p.trackInventory,
        }))
      : initialProducts.map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          category: p.category,
          unit: p.unit ?? null,
          currentStock: p.currentStock,
          stockValue: p.stockValue,
          sellingPrice: p.sellingPrice,
          reorderLevel: p.reorderLevel,
          trackInventory: p.trackInventory,
          imageUrl: p.imageUrl,
        }))

  const filtered = allProducts.filter((p) => {
    if (search) {
      const term = search.toLowerCase()
      const matchesName = p.name.toLowerCase().includes(term)
      const matchesSku = p.sku?.toLowerCase().includes(term) ?? false
      if (!matchesName && !matchesSku) return false
    }
    if (categoryFilter && p.category !== categoryFilter) return false
    if (stockFilter === 'low_stock') {
      return (
        p.trackInventory &&
        p.reorderLevel > 0 &&
        p.currentStock > 0 &&
        p.currentStock <= p.reorderLevel
      )
    }
    if (stockFilter === 'out_of_stock') {
      return p.trackInventory && p.currentStock <= 0
    }
    return true
  })

  const totalCount = allProducts.length
  const canManage = ['owner', 'manager', 'accountant'].includes(userRole)

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Inventory"
        subtitle="Track stock levels, costs, and movements across all your products."
        actions={
          <>
            {canManage && (
              <>
                <Button variant="outline" render={<Link href="/inventory/stocktake" />}>
                  Stocktake
                </Button>
                <Button variant="outline" render={<Link href="/inventory/valuation" />}>
                  Valuation
                </Button>
              </>
            )}
            <Button render={<Link href="/inventory/new" />}>
              <Plus data-icon="inline-start" />
              Add Product
            </Button>
          </>
        }
      />

      {/* Search + Category */}
      <div className="flex gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by name or SKU..."
          className="flex-1"
        />
        {categories.length > 0 && (
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-100"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Stock filter tabs */}
      <div className="mt-3 flex gap-1 rounded-xl bg-gray-100 p-1">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setStockFilter(tab.key)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              stockFilter === tab.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Product list */}
      <div className="mt-4 space-y-2">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Package className="h-10 w-10" />}
            title={
              search || categoryFilter || stockFilter !== 'all'
                ? 'No products match your filters'
                : 'No products yet'
            }
            subtitle={
              search || categoryFilter || stockFilter !== 'all'
                ? 'Try adjusting your search or filters.'
                : 'Add your first product to track inventory.'
            }
            action={
              !search && !categoryFilter && stockFilter === 'all'
                ? { label: 'Add Product', href: '/inventory/new' }
                : undefined
            }
          />
        ) : (
          filtered.map((product) => {
            const status = stockStatus(product)
            return (
              <SwipeableRow
                key={product.id}
                actions={[
                  {
                    label: 'Edit',
                    color: 'bg-blue-500',
                    onClick: () => router.push(`/inventory/${product.id}/edit`),
                  },
                  {
                    label: 'Adjust',
                    color: 'bg-amber-500',
                    onClick: () => router.push(`/inventory/${product.id}/adjust`),
                  },
                ]}
              >
                <Link
                  href={`/inventory/${product.id}`}
                  className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50"
                >
                  {/* Product image or stock dot */}
                  <div className="flex-shrink-0">
                    {product.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="h-10 w-10 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
                        <StatusDot color={status.color} />
                      </div>
                    )}
                  </div>

                  {/* Name + SKU + category */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">{product.name}</p>
                    <div className="mt-0.5 flex items-center gap-2">
                      {product.sku && (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-500">
                          {product.sku}
                        </span>
                      )}
                      {product.category && <Badge variant="secondary">{product.category}</Badge>}
                    </div>
                  </div>

                  {/* Stock + value */}
                  <div className="ml-3 flex-shrink-0 text-right">
                    <p
                      className={`text-sm font-semibold tabular-nums ${STATUS_TEXT[status.color]}`}
                    >
                      {product.trackInventory
                        ? `${product.currentStock} ${product.unit ?? 'units'}`
                        : 'N/A'}
                    </p>
                    {product.trackInventory && product.stockValue > 0 && (
                      <p className="mt-0.5 text-xs tabular-nums text-gray-400">
                        {formatGhs(product.stockValue)}
                      </p>
                    )}
                    {product.sellingPrice && (
                      <p className="mt-0.5 text-xs tabular-nums text-gray-400">
                        @ {formatGhs(product.sellingPrice)}
                      </p>
                    )}
                  </div>

                  <svg
                    className="h-4 w-4 flex-shrink-0 text-gray-300"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </SwipeableRow>
            )
          })
        )}
      </div>

      {/* Footer count */}
      {filtered.length > 0 && (
        <p className="mt-4 text-center text-xs text-gray-400">
          Showing {filtered.length} of {totalCount} product
          {totalCount !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  )
}
