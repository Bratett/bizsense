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
    return { dot: 'bg-gray-400', label: 'Not tracked', textColor: 'text-gray-600' }
  if (product.currentStock <= 0)
    return { dot: 'bg-red-500', label: 'Out of stock', textColor: 'text-red-600' }
  if (product.reorderLevel > 0 && product.currentStock <= product.reorderLevel)
    return { dot: 'bg-amber-500', label: 'Low stock', textColor: 'text-amber-600' }
  return { dot: 'bg-green-500', label: 'In stock', textColor: 'text-green-600' }
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
    <div>
      {/* Header */}
      <div className="flex items-center gap-2">
        <Link href="/inventory" className="text-gray-600 hover:text-gray-900">
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold text-gray-900">{product.name}</h1>
          <div className="mt-0.5 flex items-center gap-2">
            {product.sku && (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono text-gray-600">
                {product.sku}
              </span>
            )}
            {!product.isActive && (
              <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">
                Deactivated
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Stock Summary Card */}
      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-gray-500">Current Stock</p>
            <p className={`mt-1 text-2xl font-semibold tabular-nums ${status.textColor}`}>
              {product.trackInventory
                ? `${product.currentStock} ${product.unit ?? 'units'}`
                : 'N/A'}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${status.dot}`} />
            <span className={`text-sm font-medium ${status.textColor}`}>{status.label}</span>
          </div>
        </div>

        {product.trackInventory && (
          <div className="mt-4 grid grid-cols-2 gap-4 border-t border-gray-100 pt-4">
            <div>
              <p className="text-xs text-gray-500">Stock Value</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-gray-900">
                GHS {formatGHS(product.stockValue)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Reorder Level</p>
              <p className="mt-0.5 text-sm font-semibold text-gray-900">
                {product.reorderLevel > 0
                  ? `${product.reorderLevel} ${product.unit ?? 'units'}`
                  : 'Not set'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Cost Price</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-gray-900">
                GHS {formatGHS(product.costPrice ?? '0')}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Selling Price</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-gray-900">
                GHS {formatGHS(product.sellingPrice ?? '0')}
                {product.sellingPriceUsd && (
                  <span className="ml-1 text-xs text-gray-500">
                    / USD {formatGHS(product.sellingPriceUsd)}
                  </span>
                )}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Product Info */}
      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="space-y-3">
          {product.category && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Category</span>
              <span className="text-gray-900">{product.category}</span>
            </div>
          )}
          {product.unit && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Unit</span>
              <span className="text-gray-900">{product.unit}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Track Inventory</span>
            <span className="text-gray-900">{product.trackInventory ? 'Yes' : 'No'}</span>
          </div>
          {product.description && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs text-gray-500">Description</p>
              <p className="mt-1 text-sm text-gray-900">{product.description}</p>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={`/inventory/${product.id}/edit`}
          className="flex-1 rounded-lg border border-gray-300 py-2.5 text-center text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Edit Product
        </Link>
        {product.trackInventory && product.isActive && (
          <Link
            href={`/inventory/${product.id}/opening-stock`}
            className="flex-1 rounded-lg border border-blue-300 py-2.5 text-center text-sm font-medium text-blue-700 hover:bg-blue-50"
          >
            Set Opening Stock
          </Link>
        )}
        {product.trackInventory && product.isActive && canAdjust && (
          <Link
            href={`/inventory/${product.id}/adjust`}
            className="flex-1 rounded-lg border border-purple-300 py-2.5 text-center text-sm font-medium text-purple-700 hover:bg-purple-50"
          >
            Adjust Stock
          </Link>
        )}
        {canDeactivate && product.isActive && (
          <button
            type="button"
            onClick={() => setShowDeactivateConfirm(true)}
            className="flex-1 rounded-lg border border-red-300 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Deactivate
          </button>
        )}
      </div>

      {/* Deactivate Confirmation */}
      {showDeactivateConfirm && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">
            Are you sure you want to deactivate &ldquo;{product.name}&rdquo;?
          </p>
          <p className="mt-1 text-xs text-red-700">
            This product will no longer appear in search results or be available for new sales.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleDeactivate}
              disabled={isPending}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {isPending ? 'Deactivating...' : 'Yes, Deactivate'}
            </button>
            <button
              type="button"
              onClick={() => setShowDeactivateConfirm(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Movement History */}
      <div className="mt-6">
        <h2 className="text-sm font-semibold text-gray-900">Stock Movements</h2>
        <div className="mt-3 space-y-2">
          {product.movements.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-gray-200 px-6 py-8 text-center">
              <p className="text-sm text-gray-500">No stock movements yet</p>
            </div>
          ) : (
            product.movements.map((m) => (
              <MovementRow key={m.id} movement={m} unit={product.unit} />
            ))
          )}
        </div>
      </div>
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
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}>
            {style.label}
          </span>
          <span className="text-xs text-gray-500">{formatDate(movement.transactionDate)}</span>
        </div>
        <div className="text-right">
          <span
            className={`text-sm font-semibold tabular-nums ${isPositive ? 'text-green-700' : 'text-red-600'}`}
          >
            {isPositive ? '+' : ''}
            {qty} {unit ?? 'units'}
          </span>
          <p className="text-xs tabular-nums text-gray-500">@ GHS {formatGHS(movement.unitCost)}</p>
        </div>
      </div>
      {movement.notes && <p className="mt-1 text-xs text-gray-500">{movement.notes}</p>}
    </div>
  )
}
