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

const STATUS_TEXT: Record<string, string> = {
  green: 'text-green-700',
  amber: 'text-amber-700',
  red: 'text-red-600',
  gray: 'text-gray-500',
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

  const canManage = ['owner', 'manager', 'accountant'].includes(userRole)

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-green-700">
            Stock Management
          </p>
          <h1 className="mt-1 text-3xl font-bold text-gray-900">Inventory</h1>
          <p className="mt-1 text-sm text-gray-500">
            Track stock levels, costs, and movements across all your products.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <>
              <Link
                href="/inventory/stocktake"
                className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
              >
                Stocktake
              </Link>
              <Link
                href="/inventory/valuation"
                className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
              >
                Valuation
              </Link>
            </>
          )}
          <Link
            href="/inventory/new"
            className="flex items-center gap-1.5 rounded-xl bg-green-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-800"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Product
          </Link>
        </div>
      </div>

      {/* Search + Category */}
      <div className="mt-6 flex gap-2">
        <div className="relative flex-1">
          <svg
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            type="search"
            placeholder="Search by name or SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-full border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-100"
          />
        </div>
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
          <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white px-6 py-12 text-center">
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
                className="mt-4 inline-block rounded-xl bg-green-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-800"
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
                  className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50"
                >
                  {/* Stock dot */}
                  <div className="flex-shrink-0">
                    <span
                      className={`inline-block h-3 w-3 rounded-full ${DOT_STYLES[status.color]}`}
                    />
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
                      {product.category && (
                        <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                          {product.category}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Stock + value */}
                  <div className="ml-3 flex-shrink-0 text-right">
                    <p className={`text-sm font-semibold tabular-nums ${STATUS_TEXT[status.color]}`}>
                      {product.trackInventory
                        ? `${product.currentStock} ${product.unit ?? 'units'}`
                        : 'N/A'}
                    </p>
                    {product.trackInventory && product.stockValue > 0 && (
                      <p className="mt-0.5 text-xs tabular-nums text-gray-400">
                        GHS {formatGHS(product.stockValue)}
                      </p>
                    )}
                    {product.sellingPrice && (
                      <p className="mt-0.5 text-xs tabular-nums text-gray-400">
                        @ GHS {formatGHS(product.sellingPrice)}
                      </p>
                    )}
                  </div>

                  <svg className="h-4 w-4 flex-shrink-0 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
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
          Showing {filtered.length} of {initialProducts.length} product{initialProducts.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  )
}
