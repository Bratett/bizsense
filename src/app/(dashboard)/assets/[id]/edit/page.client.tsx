'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { FixedAssetDetail } from '@/actions/assets'
import { updateFixedAsset } from '@/actions/assets'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'

const CATEGORY_SUGGESTIONS = [
  'Vehicles',
  'Equipment',
  'Furniture',
  'Computers',
  'Land & Buildings',
  'Other',
]

export default function EditAssetForm({ asset }: { asset: FixedAssetDetail }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState(asset.name)
  const [category, setCategory] = useState(asset.category ?? '')
  const [usefulLifeMonths, setUsefulLifeMonths] = useState(String(asset.usefulLifeMonths))
  const [residualValue, setResidualValue] = useState(parseFloat(asset.residualValue).toString())
  const [notes, setNotes] = useState(asset.notes ?? '')

  const handleSubmit = () => {
    setError(null)
    startTransition(async () => {
      const result = await updateFixedAsset(asset.id, {
        name: name || undefined,
        category: category || undefined,
        usefulLifeMonths: parseInt(usefulLifeMonths) || undefined,
        residualValue: parseFloat(residualValue) || 0,
        notes: notes || undefined,
      })

      if (result.success) {
        router.push(`/assets/${asset.id}`)
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-xl">
        <PageHeader title="Edit Fixed Asset" backHref={`/assets/${asset.id}`} />

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Read-only context */}
        <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-100">
          Purchase cost (
          {parseFloat(asset.purchaseCost).toLocaleString('en-GH', { minimumFractionDigits: 2 })}{' '}
          GHS) and purchase date cannot be changed as this would affect posted journal entries.
        </div>

        <div className="mt-4 space-y-4 rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          {/* Asset Name */}
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium text-gray-700">
              Asset Name *
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-base ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Category */}
          <div>
            <label htmlFor="category" className="mb-1 block text-sm font-medium text-gray-700">
              Category
            </label>
            <input
              id="category"
              type="text"
              list="category-suggestions"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-base ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <datalist id="category-suggestions">
              {CATEGORY_SUGGESTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>

          {/* Useful Life */}
          <div>
            <label htmlFor="useful-life" className="mb-1 block text-sm font-medium text-gray-700">
              Useful Life (months) *
            </label>
            <input
              id="useful-life"
              type="text"
              min="1"
              step="1"
              value={usefulLifeMonths}
              onChange={(e) => setUsefulLifeMonths(e.target.value)}
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-base ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Residual Value */}
          <div>
            <label
              htmlFor="residual-value"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Residual Value (GHS)
            </label>
            <input
              id="residual-value"
              type="text"
              min="0"
              step="0.01"
              value={residualValue}
              onChange={(e) => setResidualValue(e.target.value)}
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-base ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="notes" className="mb-1 block text-sm font-medium text-gray-700">
              Notes
            </label>
            <textarea
              id="notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <div className="mt-6 flex gap-3 pb-8">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => router.push(`/assets/${asset.id}`)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button className="flex-1 h-13" onClick={handleSubmit} disabled={isPending || !name}>
            {isPending ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </main>
  )
}
