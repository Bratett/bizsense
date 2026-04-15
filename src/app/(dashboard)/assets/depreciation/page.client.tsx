'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import type { FixedAssetListItem } from '@/actions/assets'
import type { DepreciationRunResult } from '@/actions/depreciation'
import { runMonthlyDepreciation } from '@/actions/depreciation'
import type { UserRole } from '@/lib/session'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'

function formatGhs(value: number | string): string {
  const n = typeof value === 'string' ? parseFloat(value) : value
  return `GHS ${n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function getDefaultYearMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

export default function DepreciationRunPage({
  initialAssets,
  userRole,
}: {
  initialAssets: FixedAssetListItem[]
  userRole: UserRole
}) {
  const [isPending, startTransition] = useTransition()
  const [yearMonth, setYearMonth] = useState(getDefaultYearMonth())
  const [result, setResult] = useState<DepreciationRunResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const canRun = userRole === 'owner' || userRole === 'accountant'

  const activeAssets = initialAssets.filter((a) => a.isActive && !a.disposalDate)
  const [year, month] = yearMonth.split('-').map(Number)

  const totalMonthlyDepreciation = activeAssets.reduce((sum, a) => {
    const depreciable = Number(a.purchaseCost) - Number(a.residualValue)
    const monthly = Math.round((depreciable / a.usefulLifeMonths) * 100) / 100
    return sum + monthly
  }, 0)

  const handleRun = () => {
    setError(null)
    setResult(null)
    startTransition(async () => {
      try {
        const res = await runMonthlyDepreciation({ year, month })
        setResult(res)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unexpected error.')
      }
    })
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Run Monthly Depreciation" backHref="/assets" />

        {!canRun && (
          <Alert className="mt-4 border-amber-200 bg-amber-50">
            <AlertDescription className="text-amber-800">
              Only owners and accountants can run monthly depreciation.
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {canRun && (
          <>
            {/* Month selector */}
            <div className="mt-6 rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Target Month
              </h2>
              <div>
                <label
                  htmlFor="dep-month"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Month
                </label>
                <input
                  id="dep-month"
                  type="month"
                  value={yearMonth}
                  onChange={(e) => {
                    setYearMonth(e.target.value)
                    setResult(null)
                  }}
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-base ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            {/* Preview */}
            {activeAssets.length > 0 && !result && (
              <div className="mt-4 rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Preview
                </h2>
                <p className="mb-3 text-sm text-gray-600">
                  This will post depreciation for{' '}
                  <span className="font-semibold">{activeAssets.length} active asset{activeAssets.length !== 1 ? 's' : ''}</span>:
                </p>
                <p className="mb-4 text-base font-semibold text-gray-900">
                  Total monthly depreciation: {formatGhs(Math.round(totalMonthlyDepreciation * 100) / 100)}
                </p>
                <ul className="divide-y divide-gray-50 text-sm">
                  {activeAssets.slice(0, 5).map((a) => {
                    const monthly =
                      Math.round(
                        ((Number(a.purchaseCost) - Number(a.residualValue)) / a.usefulLifeMonths) *
                          100,
                      ) / 100
                    return (
                      <li key={a.id} className="flex justify-between py-2">
                        <span className="text-gray-700">{a.name}</span>
                        <span className="tabular-nums text-gray-500">{formatGhs(monthly)}</span>
                      </li>
                    )
                  })}
                  {activeAssets.length > 5 && (
                    <li className="py-2 text-xs text-gray-400">
                      + {activeAssets.length - 5} more assets
                    </li>
                  )}
                </ul>
              </div>
            )}

            {activeAssets.length === 0 && (
              <div className="mt-4 rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500 ring-1 ring-gray-200">
                No active assets to depreciate.{' '}
                <Link href="/assets/new" className="font-medium text-green-700 hover:underline">
                  Add a fixed asset
                </Link>{' '}
                first.
              </div>
            )}

            {/* Results */}
            {result && (
              <div className="mt-4 rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Results
                </h2>
                <div className="mb-4 grid grid-cols-3 gap-4 text-center">
                  <div className="rounded-lg bg-green-50 p-3">
                    <p className="text-2xl font-bold text-green-700">{result.processed}</p>
                    <p className="text-xs text-green-600">Processed</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-2xl font-bold text-gray-600">{result.skipped}</p>
                    <p className="text-xs text-gray-500">Skipped</p>
                  </div>
                  <div className="rounded-lg bg-blue-50 p-3">
                    <p className="text-2xl font-bold text-blue-600">{result.alreadyRun}</p>
                    <p className="text-xs text-blue-500">Already run</p>
                  </div>
                </div>

                {result.alreadyRun > 0 && (
                  <p className="mb-3 text-sm text-blue-700">
                    {result.alreadyRun}{' '}
                    {result.alreadyRun === 1 ? 'asset was' : 'assets were'} already depreciated for this month.
                  </p>
                )}

                {result.errors.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-2 text-sm font-medium text-red-700">
                      {result.errors.length} error{result.errors.length !== 1 ? 's' : ''}:
                    </p>
                    <ul className="space-y-2">
                      {result.errors.map((e) => (
                        <li
                          key={e.assetId}
                          className="flex items-start justify-between rounded-lg bg-red-50 px-3 py-2 text-sm"
                        >
                          <div>
                            <span className="font-medium text-red-800">{e.name}</span>
                            <p className="text-red-600">{e.error}</p>
                          </div>
                          <Link
                            href={`/assets/${e.assetId}`}
                            className="ml-3 shrink-0 text-xs font-medium text-red-700 hover:underline"
                          >
                            View
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.processed > 0 && (
                  <div className="mt-4 flex items-center gap-2">
                    <Badge className="bg-green-100 text-green-700">
                      Depreciation posted successfully
                    </Badge>
                    <Link
                      href="/ledger"
                      className="text-sm font-medium text-green-700 hover:underline"
                    >
                      View in General Ledger →
                    </Link>
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 pb-8">
              <Button
                className="w-full h-13"
                onClick={handleRun}
                disabled={isPending || activeAssets.length === 0}
              >
                {isPending
                  ? 'Running…'
                  : `Run Depreciation — ${yearMonth}`}
              </Button>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
