'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { deactivateProduct, type ProductDetail, type InventoryMovement } from '@/actions/products'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import type { UserRole } from '@/lib/session'
import { formatGhs, formatDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Pencil, Trash2, ListOrdered } from 'lucide-react'

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
    return { dot: 'bg-gray-400', label: 'Not tracked', textColor: 'text-gray-600', badge: 'bg-gray-100 text-gray-600' }
  if (product.currentStock <= 0)
    return { dot: 'bg-red-500', label: 'Out of Stock', textColor: 'text-red-600', badge: 'bg-red-100 text-red-700' }
  if (product.reorderLevel > 0 && product.currentStock <= product.reorderLevel)
    return { dot: 'bg-amber-500', label: 'Low Stock', textColor: 'text-amber-600', badge: 'bg-amber-100 text-amber-700' }
  return { dot: 'bg-green-500', label: 'Optimal Level', textColor: 'text-green-600', badge: 'bg-green-100 text-green-700' }
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

  // Stock visualizer
  const reorder = product.reorderLevel > 0 ? product.reorderLevel : 0
  const maxBar = Math.max(product.currentStock * 1.5, reorder * 3, 1)
  const stockBarPct = Math.min((product.currentStock / maxBar) * 100, 100)
  const reorderMarkerPct = Math.min((reorder / maxBar) * 100, 100)

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

  return (
    <div className="mx-auto max-w-5xl">
      <Breadcrumb className="mb-4">
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

      <PageHeader
        title={product.name}
        subtitle={product.sku ? `SKU: ${product.sku}` : undefined}
        backHref="/inventory"
        actions={
          <>
            {canDeactivate && product.isActive && (
              <Button
                variant="destructive"
                onClick={() => setShowDeactivateConfirm(true)}
              >
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

      {!product.isActive && (
        <Badge variant="destructive" className="mb-4">Deactivated</Badge>
      )}

      {/* Error */}
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* ── Left Card: Stock & Pricing ── */}
        <div className="space-y-4">
          <Card>
            <CardContent>
              {/* Category + unit */}
              <div className="grid grid-cols-2 gap-4">
                {product.category && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Category</p>
                    <p className="mt-1 text-sm font-medium text-foreground">{product.category}</p>
                  </div>
                )}
                {product.unit && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Unit</p>
                    <p className="mt-1 text-sm font-medium text-foreground">{product.unit}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Track Inventory</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{product.trackInventory ? 'Yes' : 'No'}</p>
                </div>
              </div>

              {product.description && (
                <>
                  <Separator className="my-4" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</p>
                    <p className="mt-1 text-sm text-muted-foreground">{product.description}</p>
                  </div>
                </>
              )}

              {/* Stock Visualizer */}
              {product.trackInventory && (
                <>
                  <Separator className="my-4" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stock Visualizer</p>
                    <div className="mt-3 flex items-start justify-between">
                      <div>
                        <p className={`text-3xl font-bold tabular-nums ${status.textColor}`}>
                          {product.currentStock}
                        </p>
                        <p className="text-xs text-muted-foreground">{product.unit ?? 'Units'}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status.badge}`}>
                        {status.label}
                      </span>
                    </div>

                    {/* Bar */}
                    <div className="relative mt-3 h-3 w-full overflow-hidden rounded-full bg-gray-100">
                      <div
                        className={`h-full rounded-full transition-all ${status.dot}`}
                        style={{ width: `${stockBarPct}%` }}
                      />
                      {reorder > 0 && (
                        <div
                          className="absolute top-0 h-full w-0.5 bg-gray-400"
                          style={{ left: `${reorderMarkerPct}%` }}
                        />
                      )}
                    </div>

                    <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                      {reorder > 0 && <span>Reorder point: {reorder}</span>}
                      {product.trackInventory && product.stockValue > 0 && (
                        <span className="ml-auto">Value: {formatGhs(product.stockValue)}</span>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Pricing & Margins */}
              {(product.costPrice || product.sellingPrice) && (
                <>
                  <Separator className="my-4" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Pricing &amp; Margins
                    </p>
                    <div className="mt-3 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Cost Price</span>
                        <span className="text-sm font-semibold tabular-nums text-foreground">
                          {formatGhs(product.costPrice ?? '0')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Selling Price</span>
                        <div className="text-right">
                          <span className="text-sm font-semibold tabular-nums text-foreground">
                            {formatGhs(product.sellingPrice ?? '0')}
                          </span>
                          {product.sellingPriceUsd && (
                            <p className="text-xs text-muted-foreground">
                              / USD {formatGhs(product.sellingPriceUsd)}
                            </p>
                          )}
                        </div>
                      </div>
                      {grossMargin > 0 && (
                        <div className="flex items-center justify-between border-t border-gray-100 pt-2.5">
                          <span className="text-sm text-muted-foreground">Gross Margin</span>
                          <div className="text-right">
                            <span className="text-base font-bold tabular-nums text-green-700">
                              {formatGhs(grossMargin)}
                            </span>
                            <p className="text-xs text-green-600">
                              {grossMarginPct.toFixed(2)}% Profit
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Additional quick actions for tracked products */}
          {product.trackInventory && product.isActive && (
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
          )}
        </div>

        {/* ── Right Card: Stock Movement History ── */}
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Stock Movement History</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {product.movements.length === 0 ? (
              <EmptyState
                icon={<ListOrdered className="h-8 w-8" />}
                title="No stock movements yet"
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {product.movements.map((m) => (
                    <MovementRow key={m.id} movement={m} unit={product.unit} />
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
          {product.movements.length > 0 && (
            <div className="border-t px-4 py-3 text-xs text-muted-foreground">
              Showing last {product.movements.length} movement{product.movements.length !== 1 ? 's' : ''}
            </div>
          )}
        </Card>
      </div>

      {/* Deactivate confirmation */}
      {showDeactivateConfirm && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>
            <p className="font-semibold">
              Deactivate &ldquo;{product.name}&rdquo;?
            </p>
            <p className="mt-1 text-xs">
              This product will no longer appear in search results or be available for new sales.
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                variant="destructive"
                onClick={handleDeactivate}
                disabled={isPending}
              >
                {isPending ? 'Deactivating...' : 'Yes, Deactivate'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowDeactivateConfirm(false)}
              >
                Cancel
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}

function MovementRow({ movement, unit }: { movement: InventoryMovement; unit: string | null }) {
  const style = TYPE_STYLES[movement.transactionType] ?? {
    bg: 'bg-gray-100',
    text: 'text-gray-700',
    label: movement.transactionType,
  }
  const qty = parseFloat(movement.quantity)
  const isPositive = qty > 0

  return (
    <TableRow>
      <TableCell className="text-xs text-muted-foreground">{formatDate(movement.transactionDate)}</TableCell>
      <TableCell>
        <Badge variant="secondary" className={`${style.bg} ${style.text}`}>
          {style.label}
        </Badge>
      </TableCell>
      <TableCell>
        <span
          className={`text-sm font-semibold tabular-nums ${isPositive ? 'text-green-700' : 'text-red-600'}`}
        >
          {isPositive ? '+' : ''}
          {qty} {unit ?? 'units'}
        </span>
        {movement.notes && (
          <p className="mt-0.5 text-xs text-muted-foreground">{movement.notes}</p>
        )}
      </TableCell>
      <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
        {formatGhs(movement.unitCost)}
      </TableCell>
    </TableRow>
  )
}
