'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { recordOpeningStock, type RecordOpeningStockInput } from '@/actions/inventory'
import type { ProductDetail } from '@/actions/products'

export default function OpeningStockForm({ product }: { product: ProductDetail }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const [quantity, setQuantity] = useState('')
  const [unitCost, setUnitCost] = useState(product.costPrice ?? '')
  const [transactionDate, setTransactionDate] = useState(
    new Date().toISOString().split('T')[0],
  )
  const [notes, setNotes] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setFieldErrors({})

    const input: RecordOpeningStockInput = {
      productId: product.id,
      quantity: parseFloat(quantity) || 0,
      unitCost: parseFloat(String(unitCost)) || 0,
      transactionDate,
      notes: notes.trim() || undefined,
    }

    startTransition(async () => {
      const result = await recordOpeningStock(input)
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
        <h1 className="text-xl font-semibold text-gray-900">Set Opening Stock</h1>
      </div>

      <p className="mt-2 text-sm text-gray-600">
        Set the initial stock quantity and cost for{' '}
        <span className="font-medium text-gray-900">{product.name}</span>.
      </p>

      {/* Error */}
      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
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
            placeholder={`e.g. 100 ${product.unit ?? 'units'}`}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 tabular-nums placeholder-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
          />
          {fieldErrors.quantity && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.quantity}</p>
          )}
        </div>

        {/* Unit Cost */}
        <div>
          <label htmlFor="unitCost" className="block text-sm font-medium text-gray-700">
            Cost Price per unit (GHS) <span className="text-red-500">*</span>
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

        {/* Date */}
        <div>
          <label htmlFor="transactionDate" className="block text-sm font-medium text-gray-700">
            Date <span className="text-red-500">*</span>
          </label>
          <input
            id="transactionDate"
            type="date"
            value={transactionDate}
            onChange={(e) => setTransactionDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
          />
          {fieldErrors.transactionDate && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.transactionDate}</p>
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
            placeholder="Optional notes about this opening stock"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
          />
        </div>

        {/* Summary */}
        {quantity && unitCost && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Total Opening Value</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-gray-900">
              GHS{' '}
              {(
                (parseFloat(quantity) || 0) * (parseFloat(String(unitCost)) || 0)
              ).toLocaleString('en-GH', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={isPending}
            className="flex-1 rounded-lg bg-green-700 py-2.5 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
          >
            {isPending ? 'Saving...' : 'Set Opening Stock'}
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
