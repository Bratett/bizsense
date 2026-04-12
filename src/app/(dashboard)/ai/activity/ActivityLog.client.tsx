'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { PendingActionRow, FlaggedLogRow } from '@/actions/aiPromotions'
import { reverseAiAction } from '@/actions/aiPromotions'

// ─── Status helpers ───────────────────────────────────────────────────────────

type Status = 'all' | 'confirmed' | 'rejected' | 'pending' | 'expired'

const STATUS_TABS: { value: Status; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'pending', label: 'Pending' },
  { value: 'expired', label: 'Expired' },
]

function StatusBadge({ action }: { action: PendingActionRow }) {
  if (action.reversedAt) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800">
        ↩ Reversed
      </span>
    )
  }
  switch (action.status) {
    case 'confirmed':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
          ✓ Confirmed
        </span>
      )
    case 'rejected':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
          ✗ Rejected
        </span>
      )
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
          ⏳ Pending
        </span>
      )
    case 'expired':
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
          ⌛ Expired
        </span>
      )
  }
}

const RESULT_ROUTES: Partial<Record<string, string>> = {
  orders: '/orders',
  expenses: '/expenses',
  customers: '/customers',
  suppliers: '/suppliers',
}

// ─── ReversalModal ────────────────────────────────────────────────────────────

function ReversalModal({
  pendingId,
  onClose,
  onSuccess,
}: {
  pendingId: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (reason.trim().length < 5) {
      setError('Reason must be at least 5 characters.')
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        await reverseAiAction(pendingId, reason.trim())
        onSuccess()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Reversal failed.')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Reverse this transaction</h2>
        <form onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Reason for reversal <span className="text-red-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            placeholder="e.g. Wrong amount entered, customer cancelled order..."
            disabled={isPending}
          />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <div className="mt-4 flex gap-3">
            <button
              type="submit"
              disabled={isPending || reason.trim().length < 5}
              className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? 'Reversing…' : 'Confirm Reversal'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="flex-1 rounded-xl border border-gray-300 bg-white py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── ActionRow ────────────────────────────────────────────────────────────────

function ActionRow({
  action,
  userRole,
}: {
  action: PendingActionRow
  userRole: string
}) {
  const [expanded, setExpanded] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [reversed, setReversed] = useState(!!action.reversedAt)
  const router = useRouter()

  const canReverse =
    action.status === 'confirmed' &&
    !reversed &&
    (userRole === 'owner' || userRole === 'manager')

  const resultRoute = action.resultTable ? RESULT_ROUTES[action.resultTable] : undefined

  return (
    <>
      {showModal && (
        <ReversalModal
          pendingId={action.id}
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false)
            setReversed(true)
            router.refresh()
          }}
        />
      )}

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {/* Row summary — tap to expand */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <StatusBadge action={reversed ? { ...action, reversedAt: new Date() } : action} />
                <span className="text-xs text-gray-500 capitalize">
                  {action.actionType.replace(/_/g, ' ')}
                </span>
              </div>
              <p className="text-sm text-gray-800 line-clamp-2">{action.humanReadable}</p>
              <p className="mt-0.5 text-xs text-gray-400">
                {new Date(action.createdAt).toLocaleString()}
              </p>
            </div>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </button>

        {/* Expanded details */}
        {expanded && (
          <div className="border-t border-gray-100 px-4 py-3 space-y-3 bg-gray-50">
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{action.humanReadable}</p>

            <details className="text-xs">
              <summary className="cursor-pointer text-gray-500 hover:text-gray-700 font-medium">
                Proposed data (JSON)
              </summary>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-gray-100 p-3 text-xs text-gray-700">
                {JSON.stringify(action.proposedData, null, 2)}
              </pre>
            </details>

            {action.resultId && resultRoute && (
              <a
                href={`${resultRoute}/${action.resultId}`}
                className="inline-flex items-center gap-1 text-sm text-green-700 hover:underline"
              >
                View record →
              </a>
            )}

            {reversed && action.reversalReason && (
              <div className="rounded-lg bg-purple-50 border border-purple-200 p-3">
                <p className="text-xs font-medium text-purple-800">Reversal reason</p>
                <p className="text-sm text-purple-700 mt-0.5">{action.reversalReason}</p>
              </div>
            )}

            {canReverse && (
              <button
                type="button"
                onClick={() => setShowModal(true)}
                className="text-sm text-red-600 hover:underline font-medium"
              >
                Reverse this transaction
              </button>
            )}
          </div>
        )}
      </div>
    </>
  )
}

// ─── ActivityLogClient ────────────────────────────────────────────────────────

export function ActivityLogClient({
  actions,
  flaggedLogs,
  userRole,
  initialStatus,
  initialDateFrom,
  initialDateTo,
}: {
  actions: PendingActionRow[]
  flaggedLogs: FlaggedLogRow[]
  userRole: string
  initialStatus: Status
  initialDateFrom: string
  initialDateTo: string
}) {
  const [activeTab, setActiveTab] = useState<Status>(initialStatus)
  const [showFlagged, setShowFlagged] = useState(flaggedLogs.length > 0)
  const router = useRouter()

  const filtered =
    activeTab === 'all' ? actions : actions.filter((a) => a.status === activeTab)

  function applyDateFilter(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const from = fd.get('dateFrom') as string
    const to = fd.get('dateTo') as string
    const params = new URLSearchParams({ status: activeTab, dateFrom: from, dateTo: to })
    router.push(`/ai/activity?${params.toString()}`)
  }

  return (
    <div className="space-y-4">
      {/* Flagged for review banner */}
      {flaggedLogs.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-red-800">
              ⚠ {flaggedLogs.length} conversation{flaggedLogs.length !== 1 ? 's' : ''} flagged for
              security review
            </p>
            <button
              type="button"
              onClick={() => setShowFlagged((v) => !v)}
              className="text-xs text-red-700 hover:underline"
            >
              {showFlagged ? 'Hide' : 'Show'}
            </button>
          </div>

          {showFlagged && (
            <div className="mt-3 space-y-3">
              {flaggedLogs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-lg border border-red-200 bg-white p-3 text-sm text-gray-700"
                >
                  <p className="font-medium text-red-700 mb-1">⚠ Flagged for review</p>
                  <p className="text-xs text-gray-500 mb-2">
                    {new Date(log.createdAt).toLocaleString()}
                  </p>
                  <p>
                    <span className="font-medium">User:</span> {log.userMessage}
                  </p>
                  {log.aiResponse && (
                    <p className="mt-1 text-gray-600">
                      <span className="font-medium">AI:</span>{' '}
                      {log.aiResponse.slice(0, 200)}
                      {log.aiResponse.length > 200 ? '…' : ''}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Date filter */}
      <form
        onSubmit={applyDateFilter}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4"
      >
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input
            type="date"
            name="dateFrom"
            defaultValue={initialDateFrom}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input
            type="date"
            name="dateTo"
            defaultValue={initialDateTo}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
        >
          Filter
        </button>
      </form>

      {/* Status tabs */}
      <div className="flex gap-1 overflow-x-auto">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActiveTab(tab.value)}
            className={`flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab.value
                ? 'bg-green-700 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Action list */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center">
          <p className="text-sm text-gray-500">No activity found for the selected filters.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((action) => (
            <ActionRow key={action.id} action={action} userRole={userRole} />
          ))}
        </div>
      )}
    </div>
  )
}
