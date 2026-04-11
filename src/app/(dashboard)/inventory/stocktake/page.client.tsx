'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { ActiveStocktake } from '@/actions/stocktakes'
import type { UserRole } from '@/lib/session'
import {
  initiateStocktake,
  updateStocktakeCount,
  confirmStocktake,
  cancelStocktake,
} from '@/actions/stocktakes'

// ─── Helpers ─────────────────────────────────────────────────────��──────────

function formatGHS(amount: number): string {
  return amount.toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

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

  // ─── No active stocktake ───────────────���─────────────────────────

  if (!activeStocktake) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Stocktake</h1>
          <Link
            href="/inventory"
            className="text-sm font-medium text-green-700 hover:text-green-800"
          >
            Back to Inventory
          </Link>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="mt-6 rounded-xl border-2 border-dashed border-gray-200 px-6 py-12 text-center">
          <svg
            className="mx-auto h-10 w-10 text-gray-300"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
            />
          </svg>
          <p className="mt-3 text-sm font-medium text-gray-900">No stocktake in progress</p>
          <p className="mt-1 text-sm text-gray-500">
            Start a new stocktake to verify your physical stock against system records.
          </p>

          {canInitiate && (
            <div className="mt-6 space-y-3">
              <textarea
                placeholder="Notes (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="mx-auto w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
              />
              <button
                type="button"
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
                className="rounded-lg bg-green-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50"
              >
                {isPending ? 'Starting...' : 'Start New Stocktake'}
              </button>
            </div>
          )}
        </div>

        <div className="mt-4 text-center">
          <Link
            href="/inventory/stocktake/history"
            className="text-sm font-medium text-green-700 hover:text-green-800"
          >
            View stocktake history &rarr;
          </Link>
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
    <div className="mx-auto max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Stocktake</h1>
        <Link href="/inventory" className="text-sm font-medium text-green-700 hover:text-green-800">
          Back to Inventory
        </Link>
      </div>

      {/* Status bar */}
      <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-blue-900">Stocktake in progress</p>
            <p className="mt-0.5 text-xs text-blue-700">
              Started {formatDateTime(activeStocktake.initiatedAt)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold tabular-nums text-blue-900">
              {countedCount} / {totalCount}
            </p>
            <p className="text-xs text-blue-700">products counted</p>
          </div>
        </div>
        {/* Progress bar */}
        <div className="mt-3 h-2 rounded-full bg-blue-200">
          <div
            className="h-2 rounded-full bg-blue-600 transition-all"
            style={{ width: `${totalCount > 0 ? (countedCount / totalCount) * 100 : 0}%` }}
          />
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Product list grouped by category */}
      <div className="mt-4 space-y-6">
        {Array.from(grouped.entries()).map(([category, categoryLines]) => (
          <div key={category}>
            <h2 className="text-sm font-semibold text-gray-700">{category}</h2>
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
                  <div
                    key={line.id}
                    className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900">{line.productName}</p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {line.productSku ?? 'No SKU'}
                        </p>
                      </div>
                      <div className="ml-3 text-right">
                        <p className="text-xs text-gray-500">Expected</p>
                        <p className="text-sm font-semibold tabular-nums text-gray-900">
                          {line.expectedQuantity} {line.productUnit ?? 'units'}
                        </p>
                      </div>
                    </div>

                    {/* Count input + variance */}
                    <div className="mt-3 flex items-end gap-3">
                      <div className="flex-1">
                        <label className="text-xs font-medium text-gray-600">Actual count</label>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          min="0"
                          placeholder="Enter count"
                          value={displayedCount}
                          onChange={(e) => handleCountChange(line.productId, e.target.value)}
                          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm tabular-nums text-gray-900 placeholder-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
                        />
                      </div>
                      <button
                        type="button"
                        disabled={
                          isPending ||
                          savingProduct === line.productId ||
                          displayedCount === '' ||
                          displayedCount === String(line.countedQuantity)
                        }
                        onClick={() => handleSaveCount(line.productId)}
                        className="rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-40"
                      >
                        {savingProduct === line.productId ? 'Saving...' : 'Save'}
                      </button>
                    </div>

                    {/* Variance display */}
                    {isCounted && variance !== null && (
                      <div className="mt-2">
                        {Math.abs(variance) < 0.001 ? (
                          <span className="text-xs font-medium text-green-700">Matches</span>
                        ) : variance > 0 ? (
                          <span className="text-xs font-medium text-green-700">
                            +{variance} surplus
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-red-600">
                            {variance} short | GHS {formatGHS(Math.abs(line.varianceValue ?? 0))}
                          </span>
                        )}
                      </div>
                    )}

                    {!isCounted && localValue === undefined && (
                      <p className="mt-2 text-xs text-gray-400">Not counted yet</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom action bar */}
      <div className="mt-6 space-y-3">
        {canConfirm && (
          <button
            type="button"
            disabled={!allCounted || isPending}
            onClick={() => setShowConfirmDialog(true)}
            className="w-full rounded-lg bg-green-700 py-3 text-sm font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? 'Processing...' : 'Confirm Stocktake'}
          </button>
        )}

        {!allCounted && (
          <p className="text-center text-xs text-gray-500">
            Count all {totalCount - countedCount} remaining products to confirm
          </p>
        )}

        {canConfirm && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => setShowCancelDialog(true)}
            className="w-full rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel Stocktake
          </button>
        )}
      </div>

      <div className="mt-4 pb-4 text-center">
        <Link
          href="/inventory/stocktake/history"
          className="text-sm font-medium text-green-700 hover:text-green-800"
        >
          View stocktake history &rarr;
        </Link>
      </div>

      {/* ─── Confirm dialog ─────────────────────────���─────────────── */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Confirm Stocktake</h3>
            <p className="mt-2 text-sm text-gray-600">
              This will post {varianceLineCount} stock adjustment
              {varianceLineCount !== 1 ? 's' : ''} totalling GHS {formatGHS(totalVarianceValue)}.
              This cannot be undone.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmDialog(false)}
                className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isPending}
                className="flex-1 rounded-lg bg-green-700 py-2.5 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50"
              >
                {isPending ? 'Posting...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Cancel dialog ────────────────────────────────────────── */}
      {showCancelDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Cancel Stocktake?</h3>
            <p className="mt-2 text-sm text-gray-600">
              All counts entered will be discarded. No adjustments will be posted.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setShowCancelDialog(false)}
                className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={isPending}
                className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isPending ? 'Cancelling...' : 'Cancel Stocktake'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
