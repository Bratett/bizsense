'use client'

import { useState, useEffect, useTransition } from 'react'
import {
  getOpeningPositionSummary,
  completeOnboarding,
  type OpeningPositionSummary,
} from '@/actions/onboarding'
import { formatGhs } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

type Props = {
  onBack: () => void
}

export default function Step6Review({ onBack }: Props) {
  const [isPending, startTransition] = useTransition()
  const [summary, setSummary] = useState<OpeningPositionSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await getOpeningPositionSummary()
        if (!cancelled) {
          setSummary(data)
          setLoading(false)
        }
      } catch {
        if (!cancelled) {
          setError('Failed to load opening position summary')
          setLoading(false)
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  function handleFinish() {
    setError('')
    startTransition(async () => {
      const result = await completeOnboarding()
      if (result.success) {
        window.location.href = '/dashboard'
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Here&apos;s your opening position</CardTitle>
        <CardDescription>Review before we finalise your books.</CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {loading && (
          <div className="mt-8 flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-green-600 border-t-transparent" />
            <span className="ml-3 text-sm text-gray-500">Loading summary...</span>
          </div>
        )}

        {summary && (
          <div className="mt-5">
            {/* Opening date */}
            {summary.openingBalanceDate && (
              <p className="mb-4 text-sm text-gray-500">
                As of{' '}
                <span className="font-medium text-gray-700">
                  {new Date(summary.openingBalanceDate + 'T00:00:00').toLocaleDateString('en-GH', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </span>
              </p>
            )}

            {/* Summary card */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              {/* Assets */}
              <div className="mb-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Assets
                </h3>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">Cash & Mobile Money</span>
                    <span className="text-sm font-medium text-gray-900">
                      {formatGhs(summary.cashTotal)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">Inventory Value</span>
                    <span className="text-sm font-medium text-gray-900">
                      {formatGhs(summary.inventoryTotal)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">Receivables</span>
                    <span className="text-sm font-medium text-gray-900">
                      {formatGhs(summary.receivablesTotal)}
                    </span>
                  </div>
                  <div className="my-1 border-t border-gray-300" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-900">Total Assets</span>
                    <span className="text-sm font-bold text-gray-900">
                      {formatGhs(summary.totalAssets)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Liabilities */}
              <div className="mb-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Liabilities
                </h3>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">Payables</span>
                    <span className="text-sm font-medium text-gray-900">
                      {formatGhs(summary.payablesTotal)}
                    </span>
                  </div>
                  <div className="my-1 border-t border-gray-300" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-900">Total Liabilities</span>
                    <span className="text-sm font-bold text-gray-900">
                      {formatGhs(summary.payablesTotal)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Net Equity */}
              <div className="rounded-lg bg-white p-3">
                <div className="flex items-center justify-between">
                  <span className="text-base font-semibold text-gray-900">Net Opening Equity</span>
                  <span className="text-base font-bold text-green-700">
                    {formatGhs(summary.netEquity)}
                  </span>
                </div>
              </div>
            </div>

            {/* Trial balance status */}
            <div className="mt-4">
              {summary.balanced ? (
                <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
                  Your books are balanced and ready.
                </div>
              ) : (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
                  Your opening entries don&apos;t balance. Difference: GHS{' '}
                  {formatGhs(Math.abs(summary.difference))}. Please go back and check your entries.
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="mt-6 flex flex-col gap-2">
              <Button
                type="button"
                onClick={handleFinish}
                disabled={isPending || !summary.balanced}
                className="w-full bg-green-700 hover:bg-green-800 active:bg-green-900"
                size="lg"
              >
                {isPending ? 'Finishing setup\u2026' : 'Finish Setup'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={onBack}
                disabled={isPending}
                className="text-sm text-muted-foreground"
              >
                Back
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
