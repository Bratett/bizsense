'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { adjustStock, type AdjustStockInput } from '@/actions/inventory'
import type { ProductDetail } from '@/actions/products'

const REASON_OPTIONS = [
  'Stock received without PO',
  'Damaged / write-off',
  'Theft / shrinkage',
  'Counting error',
  'Donation / give-away',
  'Other',
]

function formatGHS(amount: number): string {
  return amount.toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default function AdjustStockForm({ product }: { product: ProductDetail }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const [adjustmentType, setAdjustmentType] = useState<'add' | 'remove'>('add')
  const [quantity, setQuantity] = useState('')
  const [unitCost, setUnitCost] = useState(product.costPrice ?? '')
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setFieldErrors({})

    const input: AdjustStockInput = {
      productId: product.id,
      adjustmentType,
      quantity: parseFloat(quantity) || 0,
      unitCost: adjustmentType === 'add' ? parseFloat(String(unitCost)) || 0 : undefined,
      reason,
      notes: notes.trim() || undefined,
    }

    startTransition(async () => {
      const result = await adjustStock(input)
      if (result.success) {
        router.push(`/inventory/${product.id}`)
        router.refresh()
      } else {
        setError(result.error)
        if (result.fieldErrors) setFieldErrors(result.fieldErrors)
      }
    })
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-2">
        <Link href={`/inventory/${product.id}`} className="text-gray-600 hover:text-gray-900">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </Link>
        <h1 className="text-xl font-semibold text-gray-900">Adjust Stock</h1>
      </div>

      <p className="mt-2 text-sm text-gray-600">
        Adjust stock for{' '}
        <span className="font-medium text-gray-900">{product.name}</span>
      </p>

      {/* Current Stock Card */}
      <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
        <p className="text-xs text-gray-500">Current Stock</p>
        <p className="mt-0.5 text-lg font-semibold tabular-nums text-gray-900">
          {product.currentStock} {product.unit ?? 'units'}
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        {/* Adjustment Type Toggle */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Adjustment Type</label>
          <div className="mt-1 flex rounded-lg border border-gray-300 bg-gray-50 p-0.5">
            <button
              type="button"
              onClick={() => setAdjustmentType('add')}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                adjustmentType === 'add'
                  ? 'bg-green-700 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Add Stock (+)
            </button>
            <button
              type="button"
              onClick={() => setAdjustmentType('remove')}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                adjustmentType === 'remove'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Remove Stock (-)
            </button>
          </div>
        </div>

        {/* Quantity */}
        <div>
          <label htmlFor="quantity" className="block text-sm font-medium text-gray-700">
            Quantity <span className="text-red-500">*</span>
          </label>
          <input
            id="quantity"
            type="number"
            inputMode="decimal"
            step="any"
            min="0.01"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder={`e.g. 10 ${product.unit ?? 'units'}`}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 tabular-nums placeholder-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
          />
          {fieldErrors.quantity && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.quantity}</p>
          )}
        </div>

        {/* Unit Cost — only for Add */}
        {adjustmentType === 'add' && (
          <div>
            <label htmlFor="unitCost" className="block text-sm font-medium text-gray-700">
              Cost per unit (GHS) <span className="text-red-500">*</span>
            </label>
            <input
              id="unitCost"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              placeholder="0.00"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 tabular-nums placeholder-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
            />
            {fieldErrors.unitCost && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.unitCost}</p>
            )}
          </div>
        )}

        {/* Reason */}
        <div>
          <label htmlFor="reason" className="block text-sm font-medium text-gray-700">
            Reason <span className="text-red-500">*</span>
          </label>
          <select
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
          >
            <option value="">Select a reason</option>
            {REASON_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          {fieldErrors.reason && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.reason}</p>
          )}
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
            Notes
          </label>
          <textarea
            id="notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional additional details"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
          />
        </div>

        {/* Summary */}
        {adjustmentType === 'add' && quantity && unitCost && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Total Value Added</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-gray-900">
              GHS{' '}
              {formatGHS(
                (parseFloat(quantity) || 0) * (parseFloat(String(unitCost)) || 0),
              )}
            </p>
          </div>
        )}

        {adjustmentType === 'remove' && quantity && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs text-amber-700">
              Removing {quantity} {product.unit ?? 'units'} from stock.
              The write-off value will be calculated using FIFO costing.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={isPending}
            className={`flex-1 rounded-lg py-2.5 text-sm font-medium text-white disabled:opacity-50 ${
              adjustmentType === 'add'
                ? 'bg-green-700 hover:bg-green-800'
                : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {isPending
              ? 'Saving...'
              : adjustmentType === 'add'
                ? 'Add Stock'
                : 'Remove Stock'}
          </button>
          <Link
            href={`/inventory/${product.id}`}
            className="flex-1 rounded-lg border border-gray-300 py-2.5 text-center text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
