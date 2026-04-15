'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createFixedAsset } from '@/actions/assets'
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

function formatGhs(n: number): string {
  return `GHS ${n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function getFullyDepreciatedBy(purchaseDate: string, usefulLifeMonths: number): string {
  if (!purchaseDate || usefulLifeMonths < 1) return '—'
  const [y, m] = purchaseDate.split('-').map(Number)
  const endDate = new Date(Date.UTC(y, m - 1 + usefulLifeMonths, 1))
  return endDate.toLocaleDateString('en-GH', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export default function NewAssetForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const today = new Date().toISOString().slice(0, 10)

  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(today)
  const [purchaseCost, setPurchaseCost] = useState('')
  const [usefulLifeMonths, setUsefulLifeMonths] = useState('')
  const [residualValue, setResidualValue] = useState('0')
  const [notes, setNotes] = useState('')

  const cost = parseFloat(purchaseCost) || 0
  const residual = parseFloat(residualValue) || 0
  const life = parseInt(usefulLifeMonths) || 0
  const monthlyDepreciation =
    cost > residual && life > 0
      ? Math.round(((cost - residual) / life) * 100) / 100
      : null

  const handleSubmit = () => {
    setError(null)
    startTransition(async () => {
      const result = await createFixedAsset({
        name,
        category: category || undefined,
        purchaseDate,
        purchaseCost: cost,
        usefulLifeMonths: life,
        residualValue: residual,
        notes: notes || undefined,
      })

      if (result.success) {
        router.push(`/assets/${result.assetId}`)
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-xl">
        <PageHeader title="Add Fixed Asset" backHref="/assets" />

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="mt-6 space-y-4 rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          {/* Asset Name */}
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium text-gray-700">
              Asset Name *
            </label>
            <input
              id="name"
              type="text"
              placeholder="e.g. Honda Generator 5.5kVA"
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
              placeholder="e.g. Equipment"
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

          {/* Purchase Date */}
          <div>
            <label
              htmlFor="purchase-date"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Purchase Date *
            </label>
            <input
              id="purchase-date"
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-base ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Purchase Cost */}
          <div>
            <label
              htmlFor="purchase-cost"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Purchase Cost (GHS) *
            </label>
            <input
              id="purchase-cost"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              value={purchaseCost}
              onChange={(e) => setPurchaseCost(e.target.value)}
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-base ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Useful Life */}
          <div>
            <label
              htmlFor="useful-life"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Useful Life (months) *
            </label>
            <input
              id="useful-life"
              type="number"
              min="1"
              step="1"
              placeholder="60"
              value={usefulLifeMonths}
              onChange={(e) => setUsefulLifeMonths(e.target.value)}
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-base ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="mt-1 text-xs text-gray-500">
              Common values: 60 months = 5 years · 36 = 3 years · 120 = 10 years
            </p>
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
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={residualValue}
              onChange={(e) => setResidualValue(e.target.value)}
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-base ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="mt-1 text-xs text-gray-500">
              Expected value at end of useful life (usually 0 for equipment).
            </p>
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="notes" className="mb-1 block text-sm font-medium text-gray-700">
              Notes
            </label>
            <textarea
              id="notes"
              rows={3}
              placeholder="Serial number, location, purchase order reference…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {/* Auto-computed preview */}
        {monthlyDepreciation !== null && (
          <div className="mt-4 rounded-xl bg-green-50 p-4 ring-1 ring-green-100">
            <p className="text-sm font-medium text-green-800">
              Monthly depreciation: {formatGhs(monthlyDepreciation)}
            </p>
            <p className="mt-1 text-sm text-green-700">
              Fully depreciated by:{' '}
              {getFullyDepreciatedBy(purchaseDate, life)}
            </p>
          </div>
        )}

        <div className="mt-6 flex gap-3 pb-8">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => router.push('/assets')}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 h-13"
            onClick={handleSubmit}
            disabled={isPending || !name || cost <= 0 || life < 1}
          >
            {isPending ? 'Saving…' : 'Add Fixed Asset'}
          </Button>
        </div>
      </div>
    </main>
  )
}
