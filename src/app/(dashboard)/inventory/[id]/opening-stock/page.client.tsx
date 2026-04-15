'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { recordOpeningStock, type RecordOpeningStockInput } from '@/actions/inventory'
import type { ProductDetail } from '@/actions/products'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageHeader } from '@/components/ui/page-header'

export default function OpeningStockForm({ product }: { product: ProductDetail }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const [quantity, setQuantity] = useState('')
  const [unitCost, setUnitCost] = useState(product.costPrice ?? '')
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().split('T')[0])
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
      <PageHeader
        title="Set Opening Stock"
        subtitle={`Set the initial stock quantity and cost for ${product.name}.`}
        backHref={`/inventory/${product.id}`}
      />

      {/* Error */}
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Quantity */}
        <div className="space-y-1.5">
          <Label htmlFor="quantity">
            Quantity <span className="text-destructive">*</span>
          </Label>
          <Input
            id="quantity"
            type="text"
            inputMode="decimal"
            step="any"
            min="0.01"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder={`e.g. 100 ${product.unit ?? 'units'}`}
          />
          {fieldErrors.quantity && (
            <p className="text-sm text-destructive">{fieldErrors.quantity}</p>
          )}
        </div>

        {/* Unit Cost */}
        <div className="space-y-1.5">
          <Label htmlFor="unitCost">
            Cost Price per unit (GHS) <span className="text-destructive">*</span>
          </Label>
          <Input
            id="unitCost"
            type="text"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={unitCost}
            onChange={(e) => setUnitCost(e.target.value)}
            placeholder="0.00"
          />
          {fieldErrors.unitCost && (
            <p className="text-sm text-destructive">{fieldErrors.unitCost}</p>
          )}
        </div>

        {/* Date */}
        <div className="space-y-1.5">
          <Label htmlFor="transactionDate">
            Date <span className="text-destructive">*</span>
          </Label>
          <Input
            id="transactionDate"
            type="date"
            value={transactionDate}
            onChange={(e) => setTransactionDate(e.target.value)}
          />
          {fieldErrors.transactionDate && (
            <p className="text-sm text-destructive">{fieldErrors.transactionDate}</p>
          )}
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes about this opening stock"
          />
        </div>

        {/* Summary */}
        {quantity && unitCost && (
          <Card size="sm">
            <CardContent>
              <p className="text-xs text-muted-foreground">Total Opening Value</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
                GHS{' '}
                {((parseFloat(quantity) || 0) * (parseFloat(String(unitCost)) || 0)).toLocaleString(
                  'en-GH',
                  {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  },
                )}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={isPending} className="flex-1">
            {isPending ? 'Saving...' : 'Set Opening Stock'}
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            render={<Link href={`/inventory/${product.id}`} />}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
