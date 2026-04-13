'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ClipboardList } from 'lucide-react'
import type { ActiveStocktake } from '@/actions/stocktakes'
import type { UserRole } from '@/lib/session'
import {
  initiateStocktake,
  updateStocktakeCount,
  confirmStocktake,
  cancelStocktake,
} from '@/actions/stocktakes'
import { formatGhs } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'

function formatDateTime(date: Date): string {
  return new Date(date).toLocaleString('en-GH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function StocktakeView({
  activeStocktake,
  userRole,
}: {
  activeStocktake: ActiveStocktake | null
  userRole: UserRole
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)

  // Local state for counted quantities (for optimistic UI)
  const [localCounts, setLocalCounts] = useState<Record<string, string>>(() => {
    if (!activeStocktake) return {}
    const counts: Record<string, string> = {}
    for (const line of activeStocktake.lines) {
      if (line.countedQuantity !== null) {
        counts[line.productId] = String(line.countedQuantity)
      }
    }
    return counts
  })

  const [savingProduct, setSavingProduct] = useState<string | null>(null)

  const canInitiate = ['owner', 'manager', 'accountant'].includes(userRole)
  const canConfirm = ['owner', 'manager'].includes(userRole)

  // ─── No active stocktake ──────────────────────────────────────────

  if (!activeStocktake) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader
          title="Stocktake"
          actions={
            <Button variant="link" render={<Link href="/inventory" />}>
              Back to Inventory
            </Button>
          }
        />

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <EmptyState
          icon={<ClipboardList className="h-10 w-10" />}
          title="No stocktake in progress"
          subtitle="Start a new stocktake to verify your physical stock against system records."
        />

        {canInitiate && (
          <div className="mt-4 flex flex-col items-center space-y-3">
            <Textarea
              placeholder="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mx-auto w-full max-w-sm"
            />
            <Button
              disabled={isPending}
              onClick={() => {
                setError(null)
                startTransition(async () => {
                  const result = await initiateStocktake(notes || undefined)
                  if (!result.success) {
                    setError(result.error)
                  } else {
                    router.refresh()
                  }
                })
              }}
            >
              {isPending ? 'Starting...' : 'Start New Stocktake'}
            </Button>
          </div>
        )}

        <div className="mt-4 text-center">
          <Button variant="link" render={<Link href="/inventory/stocktake/history" />}>
            View stocktake history &rarr;
          </Button>
        </div>
      </div>
    )
  }

  // ─── Active stocktake ────────────────────────────────────────────

  const lines = activeStocktake.lines
  const countedCount = lines.filter(
    (l) => l.countedQuantity !== null || localCounts[l.productId] !== undefined,
  ).length
  const totalCount = lines.length
  const allCounted = countedCount >= totalCount

  const totalVarianceValue = lines.reduce((sum, l) => {
    const v = l.varianceValue ?? 0
    return sum + Math.abs(v)
  }, 0)
  const varianceLineCount = lines.filter(
    (l) => l.varianceQuantity !== null && Math.abs(l.varianceQuantity) > 0.001,
  ).length

  function handleCountChange(productId: string, value: string) {
    setLocalCounts((prev) => ({ ...prev, [productId]: value }))
  }

  function handleSaveCount(productId: string) {
    const value = localCounts[productId]
    if (value === undefined || value === '') return

    const numericValue = Number(value)
    if (isNaN(numericValue) || numericValue < 0) return

    setSavingProduct(productId)
    setError(null)
    startTransition(async () => {
      const result = await updateStocktakeCount(activeStocktake!.id, productId, numericValue)
      setSavingProduct(null)
      if (!result.success) {
        setError(result.error)
      } else {
        router.refresh()
      }
    })
  }

  function handleConfirm() {
    setShowConfirmDialog(false)
    setError(null)
    startTransition(async () => {
      const result = await confirmStocktake(activeStocktake!.id)
      if (!result.success) {
        setError(result.error)
      } else {
        router.refresh()
      }
    })
  }

  function handleCancel() {
    setShowCancelDialog(false)
    setError(null)
    startTransition(async () => {
      const result = await cancelStocktake(activeStocktake!.id)
      if (!result.success) {
        setError(result.error)
      } else {
        router.refresh()
      }
    })
  }

  // Group lines by category
  const grouped = new Map<string, typeof lines>()
  for (const line of lines) {
    const cat = line.productCategory ?? 'Uncategorised'
    if (!grouped.has(cat)) grouped.set(cat, [])
    grouped.get(cat)!.push(line)
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Stocktake"
        actions={
          <Button variant="link" render={<Link href="/inventory" />}>
            Back to Inventory
          </Button>
        }
      />

      {/* Status bar */}
      <Alert className="mt-4 border-primary/30 bg-primary/5">
        <AlertDescription>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Stocktake in progress</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Started {formatDateTime(activeStocktake.initiatedAt)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold tabular-nums text-foreground">
                {countedCount} / {totalCount}
              </p>
              <p className="text-xs text-muted-foreground">products counted</p>
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-3 h-2 rounded-full bg-primary/20">
            <div
              className="h-2 rounded-full bg-primary transition-all"
              style={{ width: `${totalCount > 0 ? (countedCount / totalCount) * 100 : 0}%` }}
            />
          </div>
        </AlertDescription>
      </Alert>

      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Product list grouped by category */}
      <div className="mt-4 space-y-6">
        {Array.from(grouped.entries()).map(([category, categoryLines]) => (
          <div key={category}>
            <h2 className="text-sm font-semibold text-foreground">{category}</h2>
            <div className="mt-2 space-y-2">
              {categoryLines.map((line) => {
                const localValue = localCounts[line.productId]
                const displayedCount =
                  localValue !== undefined
                    ? localValue
                    : line.countedQuantity !== null
                      ? String(line.countedQuantity)
                      : ''
                const isCounted = line.countedQuantity !== null
                const variance = line.varianceQuantity

                return (
                  <Card key={line.id}>
                    <CardContent>
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">{line.productName}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {line.productSku ?? 'No SKU'}
                          </p>
                        </div>
                        <div className="ml-3 text-right">
                          <p className="text-xs text-muted-foreground">Expected</p>
                          <p className="text-sm font-semibold tabular-nums text-foreground">
                            {line.expectedQuantity} {line.productUnit ?? 'units'}
                          </p>
                        </div>
                      </div>

                      {/* Count input + variance */}
                      <div className="mt-3 flex items-end gap-3">
                        <div className="flex-1">
                          <Label className="text-xs">Actual count</Label>
                          <Input
                            type="number"
                            inputMode="decimal"
                            step="any"
                            min="0"
                            placeholder="Enter count"
                            value={displayedCount}
                            onChange={(e) => handleCountChange(line.productId, e.target.value)}
                            className="mt-1 tabular-nums"
                          />
                        </div>
                        <Button
                          variant="secondary"
                          disabled={
                            isPending ||
                            savingProduct === line.productId ||
                            displayedCount === '' ||
                            displayedCount === String(line.countedQuantity)
                          }
                          onClick={() => handleSaveCount(line.productId)}
                        >
                          {savingProduct === line.productId ? 'Saving...' : 'Save'}
                        </Button>
                      </div>

                      {/* Variance display */}
                      {isCounted && variance !== null && (
                        <div className="mt-2">
                          {Math.abs(variance) < 0.001 ? (
                            <Badge variant="secondary" className="bg-green-100 text-green-700">
                              Matches
                            </Badge>
                          ) : variance > 0 ? (
                            <Badge variant="secondary" className="bg-green-100 text-green-700">
                              +{variance} surplus
                            </Badge>
                          ) : (
                            <Badge variant="destructive">
                              {variance} short | {formatGhs(Math.abs(line.varianceValue ?? 0))}
                            </Badge>
                          )}
                        </div>
                      )}

                      {!isCounted && localValue === undefined && (
                        <p className="mt-2 text-xs text-muted-foreground">Not counted yet</p>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom action bar */}
      <div className="mt-6 space-y-3">
        {canConfirm && (
          <Button
            className="w-full py-3"
            disabled={!allCounted || isPending}
            onClick={() => setShowConfirmDialog(true)}
          >
            {isPending ? 'Processing...' : 'Confirm Stocktake'}
          </Button>
        )}

        {!allCounted && (
          <p className="text-center text-xs text-muted-foreground">
            Count all {totalCount - countedCount} remaining products to confirm
          </p>
        )}

        {canConfirm && (
          <Button
            variant="outline"
            className="w-full"
            disabled={isPending}
            onClick={() => setShowCancelDialog(true)}
          >
            Cancel Stocktake
          </Button>
        )}
      </div>

      <div className="mt-4 pb-4 text-center">
        <Button variant="link" render={<Link href="/inventory/stocktake/history" />}>
          View stocktake history &rarr;
        </Button>
      </div>

      {/* ─── Confirm dialog ────────────────────────────────────────── */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-sm p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-foreground">Confirm Stocktake</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              This will post {varianceLineCount} stock adjustment
              {varianceLineCount !== 1 ? 's' : ''} totalling {formatGhs(totalVarianceValue)}.
              This cannot be undone.
            </p>
            <div className="mt-5 flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowConfirmDialog(false)}
              >
                Go Back
              </Button>
              <Button className="flex-1" onClick={handleConfirm} disabled={isPending}>
                {isPending ? 'Posting...' : 'Confirm'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ─── Cancel dialog ────────────────────────────────────────── */}
      {showCancelDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-sm p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-foreground">Cancel Stocktake?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              All counts entered will be discarded. No adjustments will be posted.
            </p>
            <div className="mt-5 flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowCancelDialog(false)}
              >
                Go Back
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleCancel}
                disabled={isPending}
              >
                {isPending ? 'Cancelling...' : 'Cancel Stocktake'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
