'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { deactivateProduct, type ProductDetail, type InventoryMovement } from '@/actions/products'
import type { UserRole } from '@/lib/session'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatGHS(amount: string | number): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  return num.toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const TYPE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  opening: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Opening' },
  purchase: { bg: 'bg-green-100', text: 'text-green-700', label: 'Purchase' },
  sale: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Sale' },
  adjustment: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Adjustment' },
  return_in: { bg: 'bg-teal-100', text: 'text-teal-700', label: 'Return In' },
  return_out: { bg: 'bg-red-100', text: 'text-red-700', label: 'Return Out' },
}

function stockStatusInfo(product: ProductDetail) {
  if (!product.trackInventory)
    return { dot: 'bg-gray-400', label: 'Not tracked', textColor: 'text-gray-600', badge: 'bg-gray-100 text-gray-600' }
  if (product.currentStock <= 0)
    return { dot: 'bg-red-500', label: 'Out of Stock', textColor: 'text-red-600', badge: 'bg-red-100 text-red-700' }
  if (product.reorderLevel > 0 && product.currentStock <= product.reorderLevel)
    return { dot: 'bg-amber-500', label: 'Low Stock', textColor: 'text-amber-600', badge: 'bg-amber-100 text-amber-700' }
  return { dot: 'bg-green-500', label: 'Optimal Level', textColor: 'text-green-600', badge: 'bg-green-100 text-green-700' }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ProductDetailView({
  product,
  userRole,
}: {
  product: ProductDetail
  userRole: UserRole
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const status = stockStatusInfo(product)
  const canDeactivate = userRole === 'owner' || userRole === 'manager'
  const canAdjust = userRole === 'owner' || userRole === 'manager'

  const costPrice = parseFloat(product.costPrice ?? '0')
  const sellingPrice = parseFloat(product.sellingPrice ?? '0')
  const grossMargin = sellingPrice - costPrice
  const grossMarginPct = sellingPrice > 0 ? (grossMargin / sellingPrice) * 100 : 0

  // Stock visualizer
  const reorder = product.reorderLevel > 0 ? product.reorderLevel : 0
  const maxBar = Math.max(product.currentStock * 1.5, reorder * 3, 1)
  const stockBarPct = Math.min((product.currentStock / maxBar) * 100, 100)
  const reorderMarkerPct = Math.min((reorder / maxBar) * 100, 100)

  const handleDeactivate = () => {
    setError(null)
    startTransition(async () => {
      const result = await deactivateProduct(product.id)
      if (result.success) {
        router.push('/inventory')
        router.refresh()
      } else {
        setError(result.error)
        setShowDeactivateConfirm(false)
      }
    })
  }

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Link
            href="/inventory"
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Inventory
          </Link>
          {product.sku && (
            <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-green-700">
              Product SKU: {product.sku}
            </p>
          )}
          <div className="mt-0.5 flex items-center gap-2">
            <h1 className="truncate text-2xl font-bold text-gray-900">{product.name}</h1>
            {!product.isActive && (
              <span className="flex-shrink-0 rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                Deactivated
              </span>
            )}
          </div>
        </div>

        {/* Header actions */}
        <div className="flex flex-shrink-0 items-center gap-2">
          {canDeactivate && product.isActive && (
            <button
              type="button"
              onClick={() => setShowDeactivateConfirm(true)}
              className="flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
              Delete
            </button>
          )}
          <Link
            href={`/inventory/${product.id}/edit`}
            className="flex items-center gap-1.5 rounded-xl bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
            </svg>
            Edit Product
          </Link>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Two-column layout */}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* ── Left Card: Stock & Pricing ── */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            {/* Category + unit */}
            <div className="grid grid-cols-2 gap-4">
              {product.category && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Category</p>
                  <p className="mt-1 text-sm font-medium text-gray-900">{product.category}</p>
                </div>
              )}
              {product.unit && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Unit</p>
                  <p className="mt-1 text-sm font-medium text-gray-900">{product.unit}</p>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Track Inventory</p>
                <p className="mt-1 text-sm font-medium text-gray-900">{product.trackInventory ? 'Yes' : 'No'}</p>
              </div>
            </div>

            {product.description && (
              <div className="mt-4 border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Description</p>
                <p className="mt-1 text-sm text-gray-700">{product.description}</p>
              </div>
            )}

            {/* Stock Visualizer */}
            {product.trackInventory && (
              <>
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Stock Visualizer</p>
                  <div className="mt-3 flex items-start justify-between">
                    <div>
                      <p className={`text-3xl font-bold tabular-nums ${status.textColor}`}>
                        {product.currentStock}
                      </p>
                      <p className="text-xs text-gray-400">{product.unit ?? 'Units'}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status.badge}`}>
                      {status.label}
                    </span>
                  </div>

                  {/* Bar */}
                  <div className="relative mt-3 h-3 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full transition-all ${status.dot}`}
                      style={{ width: `${stockBarPct}%` }}
                    />
                    {reorder > 0 && (
                      <div
                        className="absolute top-0 h-full w-0.5 bg-gray-400"
                        style={{ left: `${reorderMarkerPct}%` }}
                      />
                    )}
                  </div>

                  <div className="mt-2 flex justify-between text-xs text-gray-400">
                    {reorder > 0 && <span>Reorder point: {reorder}</span>}
                    {product.trackInventory && product.stockValue > 0 && (
                      <span className="ml-auto">Value: GHS {formatGHS(product.stockValue)}</span>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Pricing & Margins */}
            {(product.costPrice || product.sellingPrice) && (
              <div className="mt-4 border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Pricing &amp; Margins
                </p>
                <div className="mt-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Cost Price</span>
                    <span className="text-sm font-semibold tabular-nums text-gray-900">
                      GHS {formatGHS(product.costPrice ?? '0')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Selling Price</span>
                    <div className="text-right">
                      <span className="text-sm font-semibold tabular-nums text-gray-900">
                        GHS {formatGHS(product.sellingPrice ?? '0')}
                      </span>
                      {product.sellingPriceUsd && (
                        <p className="text-xs text-gray-400">
                          / USD {formatGHS(product.sellingPriceUsd)}
                        </p>
                      )}
                    </div>
                  </div>
                  {grossMargin > 0 && (
                    <div className="flex items-center justify-between border-t border-gray-100 pt-2.5">
                      <span className="text-sm text-gray-500">Gross Margin</span>
                      <div className="text-right">
                        <span className="text-base font-bold tabular-nums text-green-700">
                          GHS {formatGHS(grossMargin)}
                        </span>
                        <p className="text-xs text-green-600">
                          {grossMarginPct.toFixed(2)}% Profit
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Additional quick actions for tracked products */}
          {product.trackInventory && product.isActive && (
            <div className="flex gap-2">
              <Link
                href={`/inventory/${product.id}/opening-stock`}
                className="flex-1 rounded-xl border border-blue-200 bg-blue-50 py-2.5 text-center text-sm font-medium text-blue-700 hover:bg-blue-100"
              >
                Set Opening Stock
              </Link>
              {canAdjust && (
                <Link
                  href={`/inventory/${product.id}/adjust`}
                  className="flex-1 rounded-xl border border-purple-200 bg-purple-50 py-2.5 text-center text-sm font-medium text-purple-700 hover:bg-purple-100"
                >
                  Adjust Stock
                </Link>
              )}
            </div>
          )}
        </div>

        {/* ── Right Card: Stock Movement History ── */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-gray-900">Stock Movement History</h2>
            <div className="flex items-center gap-2">
              <button type="button" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
                </svg>
              </button>
              <button type="button" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
              </button>
            </div>
          </div>

          {/* Table header */}
          {product.movements.length > 0 && (
            <div className="grid grid-cols-[100px,80px,1fr,80px] gap-2 border-b border-gray-50 px-5 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Date</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Type</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Qty</span>
              <span className="text-right text-xs font-semibold uppercase tracking-wider text-gray-400">Cost</span>
            </div>
          )}

          <div className="divide-y divide-gray-50">
            {product.movements.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <svg className="mx-auto h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
                </svg>
                <p className="mt-2 text-sm text-gray-500">No stock movements yet</p>
              </div>
            ) : (
              product.movements.map((m) => (
                <MovementRow key={m.id} movement={m} unit={product.unit} />
              ))
            )}
          </div>

          {product.movements.length > 0 && (
            <div className="border-t border-gray-100 px-5 py-3 text-xs text-gray-400">
              Showing last {product.movements.length} movement{product.movements.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>

      {/* Deactivate confirmation */}
      {showDeactivateConfirm && (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-800">
            Deactivate &ldquo;{product.name}&rdquo;?
          </p>
          <p className="mt-1 text-xs text-red-600">
            This product will no longer appear in search results or be available for new sales.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleDeactivate}
              disabled={isPending}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {isPending ? 'Deactivating...' : 'Yes, Deactivate'}
            </button>
            <button
              type="button"
              onClick={() => setShowDeactivateConfirm(false)}
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function MovementRow({ movement, unit }: { movement: InventoryMovement; unit: string | null }) {
  const style = TYPE_STYLES[movement.transactionType] ?? {
    bg: 'bg-gray-100',
    text: 'text-gray-700',
    label: movement.transactionType,
  }
  const qty = parseFloat(movement.quantity)
  const isPositive = qty > 0

  return (
    <div className="grid grid-cols-[100px,80px,1fr,80px] items-center gap-2 px-5 py-3">
      <span className="text-xs text-gray-500">{formatDate(movement.transactionDate)}</span>
      <span className={`w-fit rounded px-1.5 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}>
        {style.label}
      </span>
      <div>
        <span
          className={`text-sm font-semibold tabular-nums ${isPositive ? 'text-green-700' : 'text-red-600'}`}
        >
          {isPositive ? '+' : ''}
          {qty} {unit ?? 'units'}
        </span>
        {movement.notes && (
          <p className="mt-0.5 text-xs text-gray-400">{movement.notes}</p>
        )}
      </div>
      <span className="text-right text-xs tabular-nums text-gray-500">
        GHS {formatGHS(movement.unitCost)}
      </span>
    </div>
  )
}
