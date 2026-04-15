'use client'

import Link from 'next/link'
import { Building2 } from 'lucide-react'
import type { FixedAssetListItem } from '@/actions/assets'
import type { UserRole } from '@/lib/session'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'

function formatGhs(value: number | string): string {
  const n = typeof value === 'string' ? parseFloat(value) : value
  return `GHS ${n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function StatusBadge({ asset }: { asset: FixedAssetListItem }) {
  if (asset.disposalDate) {
    return <Badge variant="secondary">Disposed</Badge>
  }
  if (!asset.isActive) {
    return <Badge className="bg-gray-100 text-gray-600 hover:bg-gray-100">Fully Depreciated</Badge>
  }
  return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Active</Badge>
}

export default function AssetList({
  initialAssets,
  userRole,
}: {
  initialAssets: FixedAssetListItem[]
  userRole: UserRole
}) {
  const canRunDepreciation = userRole === 'owner' || userRole === 'accountant'

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-4xl">
        <PageHeader
          title="Fixed Assets"
          subtitle={`${initialAssets.length} asset${initialAssets.length !== 1 ? 's' : ''}`}
          actions={
            <div className="flex gap-2">
              {canRunDepreciation && (
                <Button render={<Link href="/assets/depreciation" />} variant="outline" size="lg">
                  Run Depreciation
                </Button>
              )}
              <Button render={<Link href="/assets/new" />} size="lg">
                Add Fixed Asset
              </Button>
            </div>
          }
        />

        {initialAssets.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              icon={<Building2 className="h-8 w-8" />}
              title="No fixed assets yet"
              subtitle="Register equipment, vehicles, and other long-term assets to track depreciation."
            />
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {initialAssets.map((asset) => {
              const depreciableAmount =
                Number(asset.purchaseCost) - Number(asset.residualValue)
              const pctDepreciated =
                depreciableAmount > 0
                  ? Math.min(
                      100,
                      Math.round((Number(asset.accumulatedDepreciation) / depreciableAmount) * 100),
                    )
                  : 100

              return (
                <li key={asset.id}>
                  <Link
                    href={`/assets/${asset.id}`}
                    className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100 transition hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900 truncate">{asset.name}</p>
                        {asset.category && (
                          <span className="hidden sm:inline text-xs text-gray-400">
                            {asset.category}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-sm text-gray-500">
                        Purchased{' '}
                        {new Date(asset.purchaseDate + 'T00:00:00Z').toLocaleDateString('en-GH', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          timeZone: 'UTC',
                        })}
                      </p>
                      {/* Depreciation progress bar */}
                      <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-green-500 transition-all"
                          style={{ width: `${pctDepreciated}%` }}
                        />
                      </div>
                      <p className="mt-0.5 text-xs text-gray-400">{pctDepreciated}% depreciated</p>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-6">
                      <div className="text-right sm:text-left">
                        <p className="text-xs text-gray-400">Cost</p>
                        <p className="text-sm font-medium text-gray-700">
                          {formatGhs(asset.purchaseCost)}
                        </p>
                      </div>
                      <div className="text-right sm:text-left">
                        <p className="text-xs text-gray-400">Net Book Value</p>
                        <p className="text-sm font-semibold text-gray-900">
                          {formatGhs(asset.netBookValue)}
                        </p>
                      </div>
                      <StatusBadge asset={asset} />
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </main>
  )
}
