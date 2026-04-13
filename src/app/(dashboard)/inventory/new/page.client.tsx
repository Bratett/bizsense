'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createProduct, type CreateProductInput } from '@/actions/products'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { MoneyInput } from '@/components/ui/money-input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { CheckCircle } from 'lucide-react'

const UNIT_PRESETS = ['pcs', 'kg', 'bags', 'litres', 'boxes', 'crates', 'cartons', 'bottles']

export default function NewProductForm({ categories }: { categories: string[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [createdId, setCreatedId] = useState<string | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [sku, setSku] = useState('')
  const [category, setCategory] = useState('')
  const [unit, setUnit] = useState('')
  const [costPrice, setCostPrice] = useState('')
  const [sellingPrice, setSellingPrice] = useState('')
  const [sellingPriceUsd, setSellingPriceUsd] = useState('')
  const [trackInventory, setTrackInventory] = useState(true)
  const [reorderLevel, setReorderLevel] = useState('')
  const [description, setDescription] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setFieldErrors({})
    setCreatedId(null)

    const input: CreateProductInput = {
      name: name.trim(),
      sku: sku.trim() || undefined,
      description: description.trim() || undefined,
      category: category.trim() || undefined,
      unit: unit.trim() || undefined,
      costPrice: parseFloat(costPrice) || 0,
      sellingPrice: parseFloat(sellingPrice) || 0,
      sellingPriceUsd: sellingPriceUsd ? parseFloat(sellingPriceUsd) : undefined,
      trackInventory,
      reorderLevel: reorderLevel ? parseInt(reorderLevel, 10) : 0,
    }

    startTransition(async () => {
      const result = await createProduct(input)
      if (result.success) {
        setCreatedId(result.productId)
      } else {
        setError(result.error)
        if (result.fieldErrors) setFieldErrors(result.fieldErrors)
      }
    })
  }

  if (createdId) {
    return (
      <div>
        <PageHeader title="Add Product" backHref="/inventory" />

        <Card className="border-green-200 bg-green-50">
          <CardContent className="text-center">
            <CheckCircle className="mx-auto h-10 w-10 text-green-600" />
            <p className="mt-3 text-sm font-semibold text-green-800">Product saved</p>
            <p className="mt-1 text-sm text-green-700">Add opening stock?</p>
            <div className="mt-4 flex justify-center gap-3">
              <Button variant="outline" render={<Link href={`/inventory/${createdId}`} />}>
                View Product
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setCreatedId(null)
                  setName('')
                  setSku('')
                  setCategory('')
                  setUnit('')
                  setCostPrice('')
                  setSellingPrice('')
                  setSellingPriceUsd('')
                  setTrackInventory(true)
                  setReorderLevel('')
                  setDescription('')
                }}
              >
                Add Another
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Add Product" backHref="/inventory" />

      {/* Error */}
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name */}
        <div className="space-y-1.5">
          <Label htmlFor="name">Product Name *</Label>
          <Input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Rice Bag 50kg"
            required
          />
          {fieldErrors.name && <p className="text-sm text-destructive">{fieldErrors.name}</p>}
        </div>

        {/* SKU */}
        <div className="space-y-1.5">
          <Label htmlFor="sku">SKU</Label>
          <Input
            id="sku"
            type="text"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            placeholder="Auto-generated if left blank"
          />
          {fieldErrors.sku && <p className="text-sm text-destructive">{fieldErrors.sku}</p>}
        </div>

        {/* Category */}
        <div className="space-y-1.5">
          <Label htmlFor="category">Category</Label>
          <Input
            id="category"
            type="text"
            list="category-suggestions"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. Grains, Beverages, Electronics"
          />
          <datalist id="category-suggestions">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>

        {/* Unit */}
        <div className="space-y-1.5">
          <Label htmlFor="unit">Unit *</Label>
          <Input
            id="unit"
            type="text"
            list="unit-presets"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="e.g. pcs, kg, bags, litres"
          />
          <datalist id="unit-presets">
            {UNIT_PRESETS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </div>

        {/* Cost Price + Selling Price row */}
        <div className="grid grid-cols-2 gap-3">
          <MoneyInput
            id="costPrice"
            label="Cost Price (GHS) *"
            value={costPrice}
            onChange={setCostPrice}
            placeholder="0.00"
            required
            error={fieldErrors.costPrice}
          />
          <MoneyInput
            id="sellingPrice"
            label="Selling Price (GHS) *"
            value={sellingPrice}
            onChange={setSellingPrice}
            placeholder="0.00"
            required
            error={fieldErrors.sellingPrice}
          />
        </div>

        {/* Selling Price USD */}
        <MoneyInput
          id="sellingPriceUsd"
          label="Selling Price (USD)"
          currency="USD"
          value={sellingPriceUsd}
          onChange={setSellingPriceUsd}
          placeholder="Optional"
          error={fieldErrors.sellingPriceUsd}
        />

        {/* Track Inventory toggle */}
        <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3">
          <div>
            <p className="text-sm font-medium text-gray-900">Track Inventory</p>
            <p className="text-xs text-gray-500">Monitor stock levels for this product</p>
          </div>
          <Switch checked={trackInventory} onCheckedChange={setTrackInventory} />
        </div>

        {!trackInventory && (
          <Alert>
            <AlertDescription>
              Stock levels will not be tracked for this product. Use this for services or products
              you don&apos;t physically stock.
            </AlertDescription>
          </Alert>
        )}

        {/* Reorder Level -- only shown if tracking */}
        {trackInventory && (
          <div className="space-y-1.5">
            <Label htmlFor="reorderLevel">Reorder Level</Label>
            <p className="text-xs text-muted-foreground">
              Alert me when stock falls below this quantity
            </p>
            <Input
              id="reorderLevel"
              type="text"
              inputMode="numeric"
              value={reorderLevel}
              onChange={(e) => setReorderLevel(e.target.value)}
              placeholder="0"
            />
            {fieldErrors.reorderLevel && (
              <p className="text-sm text-destructive">{fieldErrors.reorderLevel}</p>
            )}
          </div>
        )}

        {/* Description */}
        <div className="space-y-1.5">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Optional product description"
          />
        </div>

        {/* Submit */}
        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? 'Saving...' : 'Save Product'}
        </Button>
      </form>
    </div>
  )
}
