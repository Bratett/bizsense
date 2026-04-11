'use client'

import { useState, useTransition } from 'react'
import { completeOnboardingStep3, importProductsCsv } from '@/actions/onboarding'
import CsvImportModal from '@/components/CsvImportModal.client'
import { validateProductsCsv } from '@/lib/csvImport/validateProducts'
import { generateProductsTemplate } from '@/lib/csvImport/generateTemplate'

const UNITS = ['piece', 'kg', 'litre', 'box', 'bag', 'carton', 'other']

type ProductRow = {
  name: string
  sku: string
  category: string
  unit: string
  qtyOnHand: string
  costPrice: string
}

const emptyRow: ProductRow = {
  name: '',
  sku: '',
  category: '',
  unit: 'piece',
  qtyOnHand: '',
  costPrice: '',
}

type Props = {
  onComplete: () => void
  onBack: () => void
}

export default function Step3Inventory({ onComplete, onBack }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showCsvModal, setShowCsvModal] = useState(false)
  const [rows, setRows] = useState<ProductRow[]>([{ ...emptyRow }])

  function updateRow(index: number, field: keyof ProductRow, value: string) {
    setRows((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  function addRow() {
    if (rows.length >= 50) return
    setRows((prev) => [...prev, { ...emptyRow }])
  }

  function removeRow(index: number) {
    if (rows.length <= 1) return
    setRows((prev) => prev.filter((_, i) => i !== index))
  }

  const totalValue = rows.reduce((sum, r) => {
    const qty = parseFloat(r.qtyOnHand) || 0
    const cost = parseFloat(r.costPrice) || 0
    return sum + qty * cost
  }, 0)

  function handleSubmit() {
    setError('')

    const validProducts = rows.filter((r) => r.name.trim())
    if (validProducts.length === 0) {
      setError('Add at least one product or skip this step')
      return
    }

    // Validate required fields
    for (let i = 0; i < validProducts.length; i++) {
      const r = validProducts[i]
      if (!r.qtyOnHand || parseFloat(r.qtyOnHand) < 0) {
        setError(`Product "${r.name}": quantity is required and must be 0 or more`)
        return
      }
      if (!r.costPrice || parseFloat(r.costPrice) < 0) {
        setError(`Product "${r.name}": cost price is required and must be 0 or more`)
        return
      }
    }

    startTransition(async () => {
      const result = await completeOnboardingStep3({
        products: validProducts.map((r) => ({
          name: r.name.trim(),
          sku: r.sku.trim() || undefined,
          category: r.category.trim() || undefined,
          unit: r.unit || undefined,
          qtyOnHand: parseFloat(r.qtyOnHand) || 0,
          costPrice: parseFloat(r.costPrice) || 0,
        })),
      })
      if (result.success) {
        onComplete()
      } else {
        setError(result.error)
      }
    })
  }

  if (!showForm) {
    return (
      <>
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Do you have products or stock?</h2>
          <p className="mt-1 text-sm text-gray-500">
            Add what you have on hand. Skip if you sell services only.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="w-full rounded-lg bg-green-700 px-4 py-3 text-base font-semibold text-white
                         transition-colors hover:bg-green-800 active:bg-green-900"
            >
              Yes, add products
            </button>
            <button
              type="button"
              onClick={() => setShowCsvModal(true)}
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-base font-medium text-gray-700
                         transition-colors hover:bg-gray-50 active:bg-gray-100"
            >
              Import from CSV
            </button>
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={onBack}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Back
              </button>
              <button
                type="button"
                onClick={onComplete}
                className="text-sm text-gray-400 hover:text-gray-600"
              >
                Skip this step
              </button>
            </div>
          </div>
        </div>
        <CsvImportModal
          isOpen={showCsvModal}
          onClose={() => setShowCsvModal(false)}
          title="Import Products from CSV"
          templateFilename="bizsense-products-template.csv"
          generateTemplate={generateProductsTemplate}
          validate={validateProductsCsv}
          onImport={async (rows) => {
            const result = await importProductsCsv({ products: rows })
            if (result.success) {
              setTimeout(() => onComplete(), 1500)
            }
            return result
          }}
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'sku', label: 'SKU' },
            { key: 'costPrice', label: 'Cost Price' },
            { key: 'sellingPrice', label: 'Selling Price' },
          ]}
        />
      </>
    )
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-5 py-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Opening Stock</h2>
        <button
          type="button"
          onClick={onComplete}
          disabled={isPending}
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          Skip this step
        </button>
      </div>
      <p className="mt-1 text-sm text-gray-500">
        Add your current products. You can add more after setup.
      </p>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-4">
        {rows.map((row, i) => (
          <div key={i} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">Product {i + 1}</span>
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  disabled={isPending}
                  className="text-xs text-gray-400 hover:text-red-500"
                >
                  Remove
                </button>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <input
                type="text"
                value={row.name}
                onChange={(e) => updateRow(i, 'name', e.target.value)}
                disabled={isPending}
                placeholder="Product Name *"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900
                           placeholder:text-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={row.sku}
                  onChange={(e) => updateRow(i, 'sku', e.target.value)}
                  disabled={isPending}
                  placeholder="SKU (auto)"
                  className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900
                             placeholder:text-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
                />
                <input
                  type="text"
                  value={row.category}
                  onChange={(e) => updateRow(i, 'category', e.target.value)}
                  disabled={isPending}
                  placeholder="Category"
                  className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900
                             placeholder:text-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={row.unit}
                  onChange={(e) => updateRow(i, 'unit', e.target.value)}
                  disabled={isPending}
                  className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900
                             focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
                >
                  {UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
                <div className="relative">
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="1"
                    value={row.qtyOnHand}
                    onChange={(e) => updateRow(i, 'qtyOnHand', e.target.value)}
                    disabled={isPending}
                    placeholder="Qty *"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-right text-gray-900
                               placeholder:text-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
                  />
                </div>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                    GHS
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={row.costPrice}
                    onChange={(e) => updateRow(i, 'costPrice', e.target.value)}
                    disabled={isPending}
                    placeholder="Cost *"
                    className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-3 text-sm text-right text-gray-900
                               placeholder:text-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
                  />
                </div>
              </div>
            </div>
          </div>
        ))}

        {rows.length < 50 && (
          <button
            type="button"
            onClick={addRow}
            disabled={isPending}
            className="text-sm font-medium text-green-700 hover:text-green-800"
          >
            + Add another product
          </button>
        )}
        {rows.length >= 40 && rows.length < 50 && (
          <p className="text-xs text-amber-600">
            You can add up to 50 products during setup. More can be added after.
          </p>
        )}

        {/* Total */}
        <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
          <span className="text-sm font-medium text-gray-700">Total Inventory Value</span>
          <span className="text-base font-semibold text-gray-900">
            GHS{' '}
            {totalValue.toLocaleString('en-GH', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>

        {/* Actions */}
        <div className="mt-2 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="w-full rounded-lg bg-green-700 px-4 py-3 text-base font-semibold text-white
                       transition-colors hover:bg-green-800 active:bg-green-900
                       disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? 'Saving\u2026' : 'Continue'}
          </button>
          <button
            type="button"
            onClick={onBack}
            disabled={isPending}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Back
          </button>
        </div>
      </div>
    </div>
  )
}
