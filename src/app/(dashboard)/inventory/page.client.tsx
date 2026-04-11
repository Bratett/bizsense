'use client'

import { useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import type { ProductListItem } from '@/actions/products'
import type { UserRole } from '@/lib/session'
import SwipeableRow from '@/components/SwipeableRow.client'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatGHS(amount: string | number): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  return num.toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

type StockFilter = 'all' | 'low_stock' | 'out_of_stock'

const FILTER_TABS: { key: StockFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'low_stock', label: 'Low Stock' },
  { key: 'out_of_stock', label: 'Out of Stock' },
]

function stockStatus(product: ProductListItem) {
  if (!product.trackInventory) return { color: 'gray', label: 'Not tracked' }
  if (product.currentStock <= 0) return { color: 'red', label: 'Out of stock' }
  if (product.reorderLevel > 0 && product.currentStock <= product.reorderLevel)
    return { color: 'amber', label: 'Low stock' }
  return { color: 'green', label: 'In stock' }
}

const DOT_STYLES: Record<string, string> = {
  green: 'bg-green-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  gray: 'bg-gray-400',
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ProductList({
  initialProducts,
  categories,
  userRole,
}: {
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

  const filtered = initialProducts.filter((p) => {
    // Search
    if (search) {
      const term = search.toLowerCase()
      const matchesName = p.name.toLowerCase().includes(term)
      const matchesSku = p.sku?.toLowerCase().includes(term) ?? false
      if (!matchesName && !matchesSku) return false
    }

    // Category
    if (categoryFilter && p.category !== categoryFilter) return false

    // Stock filter
    if (stockFilter === 'low_stock') {
      return p.trackInventory && p.reorderLevel > 0 && p.currentStock > 0 && p.currentStock <= p.reorderLevel
    }
    if (stockFilter === 'out_of_stock') {
      return p.trackInventory && p.currentStock <= 0
    }

    return true
  })

  return (
    <div className="mx-auto max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Inventory</h1>
        <div className="flex gap-2">
          {['owner', 'manager', 'accountant'].includes(userRole) && (
            <>
              <Link
                href="/inventory/stocktake"
                className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Stocktake
              </Link>
              <Link
                href="/inventory/valuation"
                className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Valuation
              </Link>
            </>
          )}
          <Link
            href="/inventory/new"
            className="rounded-lg bg-green-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-800"
          >
            Add Product
          </Link>
        </div>
      </div>

      {/* Search + Category */}
      <div className="mt-4 flex gap-2">
        <input
          type="search"
          placeholder="Search by name or SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
        />
        {categories.length > 0 && (
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
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
      <div className="mt-3 flex gap-1 rounded-lg bg-gray-100 p-1">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setStockFilter(tab.key)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              stockFilter === tab.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Product list */}
      <div className="mt-4 space-y-2">
        {filtered.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-gray-200 px-6 py-12 text-center">
            <svg
              className="mx-auto h-10 w-10 text-gray-300"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m20.25 7.5-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
              />
            </svg>
            <p className="mt-3 text-sm font-medium text-gray-900">
              {search || categoryFilter || stockFilter !== 'all'
                ? 'No products match your filters'
                : 'No products yet'}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {search || categoryFilter || stockFilter !== 'all'
                ? 'Try adjusting your search or filters.'
                : 'Add your first product to track inventory.'}
            </p>
            {!search && !categoryFilter && stockFilter === 'all' && (
              <Link
                href="/inventory/new"
                className="mt-4 inline-block rounded-lg bg-green-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-800"
              >
                Add Product
              </Link>
            )}
          </div>
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
                  className="block rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-gray-300"
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {product.name}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {product.sku ?? 'No SKU'}
                        {product.category && (
                          <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                            {product.category}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="ml-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <span
                          className={`inline-block h-2 w-2 rounded-full ${DOT_STYLES[status.color]}`}
                        />
                        <span className="text-sm font-semibold tabular-nums text-gray-900">
                          {product.trackInventory
                            ? `${product.currentStock} ${product.unit ?? 'units'}`
                            : 'N/A'}
                        </span>
                      </div>
                      {product.trackInventory && product.stockValue > 0 && (
                        <p className="mt-0.5 text-xs tabular-nums text-gray-500">
                          GHS {formatGHS(product.stockValue)}
                        </p>
                      )}
                      {product.sellingPrice && (
                        <p className="mt-0.5 text-xs tabular-nums text-gray-400">
                          GHS {formatGHS(product.sellingPrice)}/{product.unit ?? 'unit'}
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              </SwipeableRow>
            )
          })
        )}
      </div>

    </div>
  )
}
