'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { backfillCogs, type BackfillResult } from '@/actions/migrations/backfillCogs'

export default function BackfillView() {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<BackfillResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleRun = () => {
    setError(null)
    setResult(null)

    startTransition(async () => {
      try {
        const res = await backfillCogs()
        setResult(res)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred')
      }
    })
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-2">
        <Link href="/inventory" className="text-gray-600 hover:text-gray-900">
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </Link>
        <h1 className="text-xl font-semibold text-gray-900">COGS Backfill</h1>
      </div>

      {/* Explanation */}
      <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
        <h2 className="text-sm font-semibold text-blue-900">What does this do?</h2>
        <ul className="mt-2 space-y-1.5 text-sm text-blue-800">
          <li>Scans all past sales orders that have product-linked line items.</li>
          <li>
            For each order, computes the Cost of Goods Sold (COGS) using FIFO costing and adds the
            missing journal entry lines.
          </li>
          <li>
            This corrects the ledger so that your Profit &amp; Loss report reflects the true cost of
            goods sold.
          </li>
          <li>
            Running this multiple times is safe — orders that have already been backfilled are
            skipped automatically.
          </li>
        </ul>
      </div>

      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
        <p className="text-sm text-amber-800">
          Before running, make sure you have set opening stock for all products that were sold in
          past orders. Products without opening stock will be reported as errors.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Run Button */}
      {!result && (
        <button
          type="button"
          onClick={handleRun}
          disabled={isPending}
          className="mt-4 w-full rounded-lg bg-green-700 py-2.5 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
        >
          {isPending ? 'Running Backfill...' : 'Run COGS Backfill'}
        </button>
      )}

      {/* Results */}
      {result && (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900">Backfill Complete</h2>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500">Orders Processed</p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums text-green-700">
                  {result.processed}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Orders Skipped</p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums text-gray-600">
                  {result.skipped}
                </p>
              </div>
            </div>
          </div>

          {result.errors.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <h3 className="text-sm font-semibold text-red-900">
                Errors ({result.errors.length})
              </h3>
              <div className="mt-2 space-y-2">
                {result.errors.map((err, i) => (
                  <div key={i} className="text-sm text-red-800">
                    {err.orderNumber ? (
                      <span>
                        Order <span className="font-mono font-medium">{err.orderNumber}</span>
                        {' — '}
                      </span>
                    ) : null}
                    {err.reason}
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleRun}
            disabled={isPending}
            className="w-full rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {isPending ? 'Running...' : 'Run Again'}
          </button>
        </div>
      )}
    </div>
  )
}
