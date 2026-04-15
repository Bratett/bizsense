'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { FixedAssetDetail, DepreciationScheduleRow } from '@/actions/assets'
import { disposeFixedAsset } from '@/actions/assets'
import type { UserRole } from '@/lib/session'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { Alert, AlertDescription } from '@/components/ui/alert'

function formatGhs(value: number | string): string {
  const n = typeof value === 'string' ? parseFloat(value) : value
  return `GHS ${n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function AssetStatusBadge({ asset }: { asset: FixedAssetDetail }) {
  if (asset.disposalDate) {
    return <Badge variant="secondary">Disposed</Badge>
  }
  if (!asset.isActive) {
    return <Badge className="bg-gray-100 text-gray-600 hover:bg-gray-100">Fully Depreciated</Badge>
  }
  return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Active</Badge>
}

export default function AssetDetailView({
  asset,
  schedule,
  userRole,
}: {
  asset: FixedAssetDetail
  schedule: DepreciationScheduleRow[]
  userRole: UserRole
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showConfirmDispose, setShowConfirmDispose] = useState(false)

  const canEdit = userRole === 'owner' || userRole === 'manager' || userRole === 'accountant'
  const canDispose = userRole === 'owner' || userRole === 'accountant'

  const depreciableAmount = Number(asset.purchaseCost) - Number(asset.residualValue)
  const accumulated = Number(asset.accumulatedDepreciation)
  const pctDepreciated =
    depreciableAmount > 0 ? Math.min(100, Math.round((accumulated / depreciableAmount) * 100)) : 100

  const handleDispose = () => {
    setError(null)
    const today = new Date().toISOString().slice(0, 10)
    startTransition(async () => {
      const result = await disposeFixedAsset(asset.id, today)
      if (result.success) {
        router.push('/assets')
        router.refresh()
      } else {
        setError(result.error)
        setShowConfirmDispose(false)
      }
    })
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader
          title={asset.name}
          backHref="/assets"
          actions={
            <div className="flex items-center gap-2">
              {asset.category && <span className="text-sm text-gray-500">{asset.category}</span>}
              <AssetStatusBadge asset={asset} />
            </div>
          }
        />

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Financial Summary */}
        <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Financial Summary
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-gray-400">Purchase Cost</p>
              <p className="mt-0.5 text-sm font-medium text-gray-700">
                {formatGhs(asset.purchaseCost)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Residual Value</p>
              <p className="mt-0.5 text-sm font-medium text-gray-700">
                {formatGhs(asset.residualValue)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Accumulated Depreciation</p>
              <p className="mt-0.5 text-sm font-medium text-gray-700">
                {formatGhs(asset.accumulatedDepreciation)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Net Book Value</p>
              <p className="mt-0.5 text-base font-bold text-gray-900">
                {formatGhs(asset.netBookValue)}
              </p>
            </div>
          </div>

          {/* Depreciation progress bar */}
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs text-gray-400">
              <span>Depreciation progress</span>
              <span>{pctDepreciated}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-green-500 transition-all"
                style={{ width: `${pctDepreciated}%` }}
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 border-t border-gray-100 pt-4 text-sm">
            <div>
              <span className="text-gray-500">Purchase date:</span>{' '}
              <span className="text-gray-700">
                {new Date(asset.purchaseDate + 'T00:00:00Z').toLocaleDateString('en-GH', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  timeZone: 'UTC',
                })}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Useful life:</span>{' '}
              <span className="text-gray-700">{asset.usefulLifeMonths} months</span>
            </div>
            <div>
              <span className="text-gray-500">Method:</span>{' '}
              <span className="text-gray-700">Straight-line</span>
            </div>
            {asset.notes && (
              <div className="col-span-2">
                <span className="text-gray-500">Notes:</span>{' '}
                <span className="text-gray-700">{asset.notes}</span>
              </div>
            )}
          </div>
        </div>

        {/* Depreciation Schedule */}
        {schedule.length > 0 && (
          <div className="rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
            <div className="border-b border-gray-100 px-6 py-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                Depreciation Schedule
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    <th className="px-6 py-3 text-xs font-medium text-gray-400 uppercase">Month</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase">
                      Depreciation
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase">
                      Accumulated
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase">
                      NBV
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {schedule.slice(0, 12).map((row) => (
                    <tr key={row.month} className="hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium text-gray-700">{row.month}</td>
                      <td className="px-6 py-3 text-right tabular-nums text-gray-600">
                        {formatGhs(row.amount)}
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums text-gray-600">
                        {formatGhs(row.accumulated)}
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums font-medium text-gray-900">
                        {formatGhs(row.nbv)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {schedule.length > 12 && (
                <p className="px-6 py-3 text-xs text-gray-400">
                  Showing first 12 of {schedule.length} months
                </p>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        {(canEdit || canDispose) && !asset.disposalDate && (
          <div className="flex gap-3 pb-8">
            {canEdit && (
              <Button
                variant="outline"
                className="flex-1"
                render={<Link href={`/assets/${asset.id}/edit`} />}
              >
                Edit Asset
              </Button>
            )}
            {canDispose && asset.isActive && !showConfirmDispose && (
              <Button
                variant="outline"
                className="flex-1 border-red-200 text-red-600 hover:bg-red-50"
                onClick={() => setShowConfirmDispose(true)}
                disabled={isPending}
              >
                Dispose Asset
              </Button>
            )}
            {canDispose && showConfirmDispose && (
              <div className="flex flex-1 gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowConfirmDispose(false)}
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-700"
                  onClick={handleDispose}
                  disabled={isPending}
                >
                  {isPending ? 'Disposing…' : 'Confirm Dispose'}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
