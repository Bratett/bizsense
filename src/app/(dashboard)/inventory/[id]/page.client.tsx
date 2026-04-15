'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { deactivateProduct, type ProductDetail, type InventoryMovement } from '@/actions/products'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import type { UserRole } from '@/lib/session'
import { formatGhs, formatDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Pencil, Trash2, ListOrdered, TrendingUp, Package, ArrowUpDown } from 'lucide-react'

const TYPE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  opening: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Opening' },
  purchase: { bg: 'bg-green-100', text: 'text-green-700', label: 'Purchase' },
  sale: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Sale' },
  adjustment: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Adjustment' },
  return_in: { bg: 'bg-teal-100', text: 'text-teal-700', label: 'Return In' },
  return_out: { bg: 'bg-red-100', text: 'text-red-700', label: 'Return Out' },
}

function stockStatusInfo(product: ProductDetail) {
  if (!product.trackInventory)
    return {
      dot: 'bg-gray-400',
      label: 'Not tracked',
      textColor: 'text-gray-600',
      badge: 'bg-gray-100 text-gray-600',
    }
  if (product.currentStock <= 0)
    return {
      dot: 'bg-red-500',
      label: 'Out of Stock',
      textColor: 'text-red-600',
      badge: 'bg-red-100 text-red-700',
    }
  if (product.reorderLevel > 0 && product.currentStock <= product.reorderLevel)
    return {
      dot: 'bg-amber-500',
      label: 'Low Stock',
      textColor: 'text-amber-600',
      badge: 'bg-amber-100 text-amber-700',
    }
  return {
    dot: 'bg-green-500',
    label: 'Optimal Level',
    textColor: 'text-green-600',
    badge: 'bg-green-100 text-green-700',
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ProductDetailView({
  product,
  userRole,
}: {
  product: ProductDetail
  userRole: UserRole
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const status = stockStatusInfo(product)
  const canDeactivate = userRole === 'owner' || userRole === 'manager'
  const canAdjust = userRole === 'owner' || userRole === 'manager'

  const costPrice = parseFloat(product.costPrice ?? '0')
  const sellingPrice = parseFloat(product.sellingPrice ?? '0')
  const grossMargin = sellingPrice - costPrice
  const grossMarginPct = sellingPrice > 0 ? (grossMargin / sellingPrice) * 100 : 0

  const reorder = product.reorderLevel > 0 ? product.reorderLevel : 0
  const maxBar = Math.max(product.currentStock * 1.5, reorder * 3, 1)
  const stockBarPct = Math.min((product.currentStock / maxBar) * 100, 100)
  const reorderPct = Math.min((reorder / maxBar) * 100, 100)

  const handleDeactivate = () => {
    setError(null)
    startTransition(async () => {
      const result = await deactivateProduct(product.id)
      if (result.success) {
        router.push('/inventory')
        router.refresh()
      } else {
        setError(result.error)
        setShowDeactivateConfirm(false)
      }
    })
  }

  const hasPricing = !!(product.costPrice || product.sellingPrice)

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* Product image (if set) */}
      {product.imageUrl && (
        <a href={product.imageUrl} target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full max-h-60 rounded-xl object-cover"
          />
        </a>
      )}

      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/inventory" />}>Inventory</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{product.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Page header */}
      <PageHeader
        title={product.name}
        subtitle={product.sku ? `SKU: ${product.sku}` : undefined}
        backHref="/inventory"
        actions={
          <>
            {canDeactivate && product.isActive && (
              <Button variant="destructive" onClick={() => setShowDeactivateConfirm(true)}>
                <Trash2 data-icon="inline-start" />
                Delete
              </Button>
            )}
            <Button render={<Link href={`/inventory/${product.id}/edit`} />}>
              <Pencil data-icon="inline-start" />
              Edit Product
            </Button>
          </>
        }
      />

      {!product.isActive && <Badge variant="destructive">Deactivated</Badge>}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ── Main two-column grid ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        {/* ── Left column (3/5) ── */}
        <div className="space-y-5 lg:col-span-3">
          {/* Card A — Product Details */}
          <Card>
            <CardHeader className="border-b pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <Package className="h-4 w-4 text-muted-foreground" />
                Product Details
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5">
              <div className="grid grid-cols-3 gap-4">
                {/* Category */}
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Category
                  </p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {product.category ?? <span className="text-muted-foreground">—</span>}
                  </p>
                </div>
                {/* Unit */}
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Unit
                  </p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {product.unit ?? <span className="text-muted-foreground">—</span>}
                  </p>
                </div>
                {/* Inventory tracking */}
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Inventory
                  </p>
                  <p className="mt-1">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                        product.trackInventory
                          ? 'bg-green-50 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          product.trackInventory ? 'bg-green-500' : 'bg-gray-400'
                        }`}
                      />
                      {product.trackInventory ? 'Tracked' : 'Not tracked'}
                    </span>
                  </p>
                </div>
              </div>

              {product.description && (
                <>
                  <Separator className="my-4" />
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Description
                    </p>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {product.description}
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Card B — Stock Level */}
          {product.trackInventory && (
            <Card>
              <CardHeader className="border-b pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                    Stock Level
                  </CardTitle>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status.badge}`}
                  >
                    {status.label}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="pt-5">
                {/* Hero stock number */}
                <div className="flex items-end gap-3">
                  <p className={`text-5xl font-bold tabular-nums leading-none ${status.textColor}`}>
                    {product.currentStock}
                  </p>
                  <p className="mb-1 text-sm text-muted-foreground">{product.unit ?? 'units'}</p>
                </div>

                {/* Progress bar */}
                <div className="relative mt-4 h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-full rounded-full transition-all ${status.dot}`}
                    style={{ width: `${stockBarPct}%` }}
                  />
                  {reorder > 0 && (
                    <div
                      className="absolute top-0 h-full w-0.5 bg-gray-400"
                      style={{ left: `${reorderPct}%` }}
                    />
                  )}
                </div>

                {/* Stats below bar */}
                <div className="mt-2.5 flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {reorder > 0
                      ? `Reorder point: ${reorder} ${product.unit ?? 'units'}`
                      : 'No reorder point set'}
                  </span>
                  {product.stockValue > 0 && (
                    <span className="font-medium text-foreground">
                      Value: {formatGhs(product.stockValue)}
                    </span>
                  )}
                </div>

                {/* Actions */}
                {product.isActive && (
                  <>
                    <Separator className="my-4" />
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        render={<Link href={`/inventory/${product.id}/opening-stock`} />}
                      >
                        Set Opening Stock
                      </Button>
                      {canAdjust && (
                        <Button
                          variant="outline"
                          className="flex-1"
                          render={<Link href={`/inventory/${product.id}/adjust`} />}
                        >
                          Adjust Stock
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Card C — Pricing */}
          {hasPricing && (
            <Card>
              <CardHeader className="border-b pb-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  Pricing &amp; Margins
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-5">
                {/* Two price columns */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg bg-gray-50 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Cost Price
                    </p>
                    <p className="mt-1.5 text-xl font-bold tabular-nums text-foreground">
                      {formatGhs(product.costPrice ?? '0')}
                    </p>
                  </div>
                  <div className="rounded-lg bg-gray-50 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Selling Price
                    </p>
                    <p className="mt-1.5 text-xl font-bold tabular-nums text-foreground">
                      {formatGhs(product.sellingPrice ?? '0')}
                    </p>
                    {product.sellingPriceUsd && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        USD {formatGhs(product.sellingPriceUsd)}
                      </p>
                    )}
                  </div>
                </div>

                {/* Margin row */}
                {grossMargin > 0 && (
                  <div className="mt-4 flex items-center justify-between rounded-lg bg-green-50 px-4 py-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-green-700">
                        Gross Margin
                      </p>
                      <p className="mt-0.5 text-xs text-green-600">per unit sold</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold tabular-nums text-green-700">
                        {formatGhs(grossMargin)}
                      </p>
                      <p className="text-xs font-semibold text-green-600">
                        {grossMarginPct.toFixed(1)}% profit
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Right column (2/5) — Stock Movement History ── */}
        <div className="lg:col-span-2">
          <Card className="flex h-full flex-col">
            <CardHeader className="border-b pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ListOrdered className="h-4 w-4 text-muted-foreground" />
                  Stock Movements
                </CardTitle>
                {product.movements.length > 0 && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                    {product.movements.length}
                  </span>
                )}
              </div>
            </CardHeader>

            {product.movements.length === 0 ? (
              <CardContent className="flex flex-1 items-center justify-center">
                <EmptyState
                  icon={<ListOrdered className="h-8 w-8" />}
                  title="No stock movements yet"
                />
              </CardContent>
            ) : (
              <div className="flex-1 overflow-y-auto">
                <div className="divide-y divide-gray-50">
                  {product.movements.map((m) => (
                    <MovementRow key={m.id} movement={m} unit={product.unit} />
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Deactivate confirmation */}
      {showDeactivateConfirm && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>
            <p className="font-semibold">Deactivate &ldquo;{product.name}&rdquo;?</p>
            <p className="mt-1 text-xs">
              This product will no longer appear in search results or be available for new sales.
            </p>
            <div className="mt-3 flex gap-2">
              <Button variant="destructive" onClick={handleDeactivate} disabled={isPending}>
                {isPending ? 'Deactivating...' : 'Yes, Deactivate'}
              </Button>
              <Button variant="outline" onClick={() => setShowDeactivateConfirm(false)}>
                Cancel
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}

// ─── Movement row ─────────────────────────────────────────────────────────────

function MovementRow({ movement, unit }: { movement: InventoryMovement; unit: string | null }) {
  const style = TYPE_STYLES[movement.transactionType] ?? {
    bg: 'bg-gray-100',
    text: 'text-gray-700',
    label: movement.transactionType,
  }
  const qty = parseFloat(movement.quantity)
  const isPositive = qty > 0

  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-gray-50/60">
      {/* Left: type badge + date */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${style.bg} ${style.text}`}
          >
            {style.label}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {formatDate(movement.transactionDate)}
          </span>
        </div>
        {movement.notes && (
          <p className="mt-1 truncate text-xs text-muted-foreground">{movement.notes}</p>
        )}
      </div>

      {/* Right: qty + cost */}
      <div className="shrink-0 text-right">
        <p
          className={`text-sm font-bold tabular-nums ${isPositive ? 'text-green-700' : 'text-red-600'}`}
        >
          {isPositive ? '+' : ''}
          {qty} {unit ?? 'units'}
        </p>
        <p className="text-[11px] tabular-nums text-muted-foreground">
          {formatGhs(movement.unitCost)}/unit
        </p>
      </div>
    </div>
  )
}
