'use client'

import { useState, useRef, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { updateProduct, type ProductDetail, type UpdateProductInput } from '@/actions/products'
import ProductImageUpload, {
  type ProductImageUploadRef,
} from '@/components/products/ProductImageUpload.client'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { MoneyInput } from '@/components/ui/money-input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageHeader } from '@/components/ui/page-header'

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
  const imageUploadRef = useRef<ProductImageUploadRef>(null)

  // Form state -- pre-populated from product
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
      const [result] = await Promise.all([
        updateProduct(product.id, input),
        imageUploadRef.current?.flush(),
      ])
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
            <BreadcrumbPage>Edit</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader title="Edit Product" backHref={`/inventory/${product.id}`} />

      {/* Error */}
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-4 md:grid md:grid-cols-2 md:gap-x-6 md:gap-y-4 md:space-y-0"
      >
        {/* Name */}
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="name">Product Name *</Label>
          <Input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          {fieldErrors.name && <p className="text-sm text-destructive">{fieldErrors.name}</p>}
        </div>

        {/* SKU -- read-only */}
        <div className="space-y-1.5">
          <Label>SKU</Label>
          <p className="rounded-lg border border-input bg-muted px-3 py-2.5 font-mono text-sm text-muted-foreground">
            {product.sku ?? 'None'}
          </p>
          <p className="text-xs text-muted-foreground">SKU cannot be changed after creation</p>
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
          <Label htmlFor="unit">Unit</Label>
          <Input
            id="unit"
            type="text"
            list="unit-presets"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="e.g. pcs, kg, bags"
          />
          <datalist id="unit-presets">
            {UNIT_PRESETS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </div>

        {/* Selling Price USD — pairs with Unit on desktop */}
        <MoneyInput
          id="sellingPriceUsd"
          label="Selling Price (USD)"
          currency="USD"
          value={String(sellingPriceUsd)}
          onChange={setSellingPriceUsd}
          placeholder="Optional"
        />

        {/* Cost Price + Selling Price */}
        <div className="grid grid-cols-2 gap-3 md:col-span-2">
          <MoneyInput
            id="costPrice"
            label="Cost Price (GHS) *"
            value={String(costPrice)}
            onChange={setCostPrice}
            required
            error={fieldErrors.costPrice}
          />
          <MoneyInput
            id="sellingPrice"
            label="Selling Price (GHS) *"
            value={String(sellingPrice)}
            onChange={setSellingPrice}
            required
            error={fieldErrors.sellingPrice}
          />
        </div>

        {/* Track Inventory toggle */}
        <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3 md:col-span-2">
          <div>
            <p className="text-sm font-medium text-foreground">Track Inventory</p>
            <p className="text-xs text-muted-foreground">Monitor stock levels for this product</p>
          </div>
          <Switch checked={trackInventory} onCheckedChange={setTrackInventory} />
        </div>

        {/* Reorder Level */}
        {trackInventory && (
          <div className="space-y-1.5 md:col-span-2">
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
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Optional product description"
          />
        </div>

        {/* Product Image */}
        <div className="space-y-1.5 md:col-span-2">
          <Label>Product Image (optional)</Label>
          <ProductImageUpload
            ref={imageUploadRef}
            productId={product.id}
            currentImageUrl={product.imageUrl}
          />
        </div>

        {/* Submit */}
        <Button type="submit" disabled={isPending} className="w-full md:col-span-2">
          {isPending ? 'Saving...' : 'Save Changes'}
        </Button>
      </form>
    </div>
  )
}
