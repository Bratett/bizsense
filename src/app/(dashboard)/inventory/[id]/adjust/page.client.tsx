'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { adjustStock, type AdjustStockInput } from '@/actions/inventory'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import type { ProductDetail } from '@/actions/products'
import { formatGhs } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageHeader } from '@/components/ui/page-header'

const REASON_OPTIONS = [
  'Stock received without PO',
  'Damaged / write-off',
  'Theft / shrinkage',
  'Counting error',
  'Donation / give-away',
  'Other',
]

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
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/inventory" />}>Inventory</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href={`/inventory/${product.id}`} />}>
              {product.name}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Adjust Stock</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader
        title="Adjust Stock"
        subtitle={`Adjust stock for ${product.name}`}
        backHref={`/inventory/${product.id}`}
      />

      {/* Current Stock Card */}
      <Card className="mb-4" size="sm">
        <CardContent>
          <p className="text-xs text-muted-foreground">Current Stock</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
            {product.currentStock} {product.unit ?? 'units'}
          </p>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Adjustment Type Toggle */}
        <div className="space-y-1.5">
          <Label>Adjustment Type</Label>
          <div className="flex rounded-lg border border-gray-300 bg-gray-50 p-0.5">
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
            placeholder={`e.g. 10 ${product.unit ?? 'units'}`}
          />
          {fieldErrors.quantity && (
            <p className="text-sm text-destructive">{fieldErrors.quantity}</p>
          )}
        </div>

        {/* Unit Cost -- only for Add */}
        {adjustmentType === 'add' && (
          <div className="space-y-1.5">
            <Label htmlFor="unitCost">
              Cost per unit (GHS) <span className="text-destructive">*</span>
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
        )}

        {/* Reason */}
        <div className="space-y-1.5">
          <Label htmlFor="reason">
            Reason <span className="text-destructive">*</span>
          </Label>
          <select
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-lg border border-input bg-white px-3 py-2.5 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/50"
          >
            <option value="">Select a reason</option>
            {REASON_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          {fieldErrors.reason && <p className="text-sm text-destructive">{fieldErrors.reason}</p>}
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional additional details"
          />
        </div>

        {/* Summary */}
        {adjustmentType === 'add' && quantity && unitCost && (
          <Card size="sm">
            <CardContent>
              <p className="text-xs text-muted-foreground">Total Value Added</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
                {formatGhs((parseFloat(quantity) || 0) * (parseFloat(String(unitCost)) || 0))}
              </p>
            </CardContent>
          </Card>
        )}

        {adjustmentType === 'remove' && quantity && (
          <Alert>
            <AlertDescription>
              Removing {quantity} {product.unit ?? 'units'} from stock. The write-off value will be
              calculated using FIFO costing.
            </AlertDescription>
          </Alert>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button
            type="submit"
            disabled={isPending}
            variant={adjustmentType === 'remove' ? 'destructive' : 'default'}
            className="flex-1"
          >
            {isPending ? 'Saving...' : adjustmentType === 'add' ? 'Add Stock' : 'Remove Stock'}
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
