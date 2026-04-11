'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { updateProduct, type ProductDetail, type UpdateProductInput } from '@/actions/products'

const UNIT_PRESETS = ['pcs', 'kg', 'bags', 'litres', 'boxes', 'crates', 'cartons', 'bottles']

export default function EditProductForm({
  product,
  categories,
}: {
  product: ProductDetail
  categories: string[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // Form state — pre-populated from product
  const [name, setName] = useState(product.name)
  const [category, setCategory] = useState(product.category ?? '')
  const [unit, setUnit] = useState(product.unit ?? '')
  const [costPrice, setCostPrice] = useState(product.costPrice ?? '')
  const [sellingPrice, setSellingPrice] = useState(product.sellingPrice ?? '')
  const [sellingPriceUsd, setSellingPriceUsd] = useState(product.sellingPriceUsd ?? '')
  const [trackInventory, setTrackInventory] = useState(product.trackInventory)
  const [reorderLevel, setReorderLevel] = useState(String(product.reorderLevel || ''))
  const [description, setDescription] = useState(product.description ?? '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setFieldErrors({})

    const input: UpdateProductInput = {
      name: name.trim(),
      description: description.trim() || undefined,
      category: category.trim() || undefined,
      unit: unit.trim() || undefined,
      costPrice: parseFloat(String(costPrice)) || 0,
      sellingPrice: parseFloat(String(sellingPrice)) || 0,
      sellingPriceUsd: sellingPriceUsd ? parseFloat(String(sellingPriceUsd)) : undefined,
      trackInventory,
      reorderLevel: reorderLevel ? parseInt(reorderLevel, 10) : 0,
    }

    startTransition(async () => {
      const result = await updateProduct(product.id, input)
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
        <h1 className="text-xl font-semibold text-gray-900">Edit Product</h1>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {/* Name */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700">
            Product Name *
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
            required
          />
          {fieldErrors.name && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p>
          )}
        </div>

        {/* SKU — read-only */}
        <div>
          <label className="block text-sm font-medium text-gray-700">SKU</label>
          <p className="mt-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-mono text-gray-600">
            {product.sku ?? 'None'}
          </p>
          <p className="mt-1 text-xs text-gray-400">SKU cannot be changed after creation</p>
        </div>

        {/* Category */}
        <div>
          <label htmlFor="category" className="block text-sm font-medium text-gray-700">
            Category
          </label>
          <input
            id="category"
            type="text"
            list="category-suggestions"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
            placeholder="e.g. Grains, Beverages, Electronics"
          />
          <datalist id="category-suggestions">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>

        {/* Unit */}
        <div>
          <label htmlFor="unit" className="block text-sm font-medium text-gray-700">
            Unit
          </label>
          <input
            id="unit"
            type="text"
            list="unit-presets"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
            placeholder="e.g. pcs, kg, bags"
          />
          <datalist id="unit-presets">
            {UNIT_PRESETS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </div>

        {/* Cost Price + Selling Price */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="costPrice" className="block text-sm font-medium text-gray-700">
              Cost Price (GHS) *
            </label>
            <input
              id="costPrice"
              type="text"
              inputMode="decimal"
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm tabular-nums text-gray-900 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
              required
            />
            {fieldErrors.costPrice && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.costPrice}</p>
            )}
          </div>
          <div>
            <label htmlFor="sellingPrice" className="block text-sm font-medium text-gray-700">
              Selling Price (GHS) *
            </label>
            <input
              id="sellingPrice"
              type="text"
              inputMode="decimal"
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm tabular-nums text-gray-900 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
              required
            />
            {fieldErrors.sellingPrice && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.sellingPrice}</p>
            )}
          </div>
        </div>

        {/* Selling Price USD */}
        <div>
          <label htmlFor="sellingPriceUsd" className="block text-sm font-medium text-gray-700">
            Selling Price (USD)
          </label>
          <input
            id="sellingPriceUsd"
            type="text"
            inputMode="decimal"
            value={sellingPriceUsd}
            onChange={(e) => setSellingPriceUsd(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm tabular-nums text-gray-900 placeholder-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
            placeholder="Optional"
          />
        </div>

        {/* Track Inventory toggle */}
        <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3">
          <div>
            <p className="text-sm font-medium text-gray-900">Track Inventory</p>
            <p className="text-xs text-gray-500">Monitor stock levels for this product</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={trackInventory}
            onClick={() => setTrackInventory(!trackInventory)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
              trackInventory ? 'bg-green-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                trackInventory ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Reorder Level */}
        {trackInventory && (
          <div>
            <label htmlFor="reorderLevel" className="block text-sm font-medium text-gray-700">
              Reorder Level
            </label>
            <p className="text-xs text-gray-500">
              Alert me when stock falls below this quantity
            </p>
            <input
              id="reorderLevel"
              type="text"
              inputMode="numeric"
              value={reorderLevel}
              onChange={(e) => setReorderLevel(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
              placeholder="0"
            />
            {fieldErrors.reorderLevel && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.reorderLevel}</p>
            )}
          </div>
        )}

        {/* Description */}
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700">
            Description
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
            placeholder="Optional product description"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-green-700 py-3 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50"
        >
          {isPending ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  )
}
