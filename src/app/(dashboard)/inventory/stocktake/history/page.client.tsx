'use client'

import Link from 'next/link'
import type { StocktakeHistoryItem } from '@/actions/stocktakes'

function formatGHS(amount: number): string {
  return amount.toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-GH', { dateStyle: 'medium' })
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  confirmed: { bg: 'bg-green-100', text: 'text-green-800', label: 'Confirmed' },
  cancelled: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Cancelled' },
  in_progress: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'In Progress' },
}

export default function StocktakeHistoryView({
  history,
}: {
  history: StocktakeHistoryItem[]
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Stocktake History</h1>
        <Link
          href="/inventory/stocktake"
          className="text-sm font-medium text-green-700 hover:text-green-800"
        >
          Back to Stocktake
        </Link>
      </div>

      <div className="mt-4 space-y-2">
        {history.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-gray-200 px-6 py-12 text-center">
            <p className="text-sm font-medium text-gray-900">No stocktakes yet</p>
            <p className="mt-1 text-sm text-gray-500">
              Start your first stocktake from the stocktake page.
            </p>
          </div>
        ) : (
          history.map((item) => {
            const status = STATUS_STYLES[item.status] ?? STATUS_STYLES.cancelled
            return (
              <div
                key={item.id}
                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {formatDate(item.initiatedAt)}
                    </p>
                    {item.confirmedAt && (
                      <p className="mt-0.5 text-xs text-gray-500">
                        Confirmed {formatDate(item.confirmedAt)}
                      </p>
                    )}
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.bg} ${status.text}`}
                  >
                    {status.label}
                  </span>
                </div>
                <div className="mt-2 flex gap-4 text-xs text-gray-500">
                  <span>{item.lineCount} products</span>
                  {item.status === 'confirmed' && (
                    <span>
                      Total variance: GHS {formatGHS(item.totalVarianceValue)}
                    </span>
                  )}
                </div>
                {item.notes && (
                  <p className="mt-1 text-xs text-gray-400">{item.notes}</p>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
