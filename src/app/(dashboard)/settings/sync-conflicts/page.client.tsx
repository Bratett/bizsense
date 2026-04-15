'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  markConflictReviewed,
  markAllConflictsReviewed,
  type SyncConflictRecord,
} from '@/actions/syncConflicts'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/format'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDiffKeys(local: unknown, server: unknown): string[] {
  if (typeof local !== 'object' || typeof server !== 'object') return []
  if (!local || !server) return []
  const l = local as Record<string, unknown>
  const s = server as Record<string, unknown>
  return Object.keys({ ...l, ...s }).filter((k) => JSON.stringify(l[k]) !== JSON.stringify(s[k]))
}

function renderValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function editHref(tableName: string, recordId: string): string | null {
  const TABLE_ROUTES: Record<string, string> = {
    customers: '/customers',
    orders: '/orders',
    expenses: '/expenses',
    products: '/inventory',
    purchase_orders: '/suppliers/purchase-orders',
    goods_received_notes: '/suppliers/grn',
  }
  const base = TABLE_ROUTES[tableName]
  if (!base) return null
  return `${base}/${recordId}/edit`
}

// ─── Conflict Row ─────────────────────────────────────────────────────────────

function ConflictRow({
  conflict,
  onReviewed,
}: {
  conflict: SyncConflictRecord
  onReviewed: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [isPending, startTransition] = useTransition()
  const diffKeys = getDiffKeys(conflict.localValue, conflict.serverValue)
  const local = (conflict.localValue ?? {}) as Record<string, unknown>
  const server = (conflict.serverValue ?? {}) as Record<string, unknown>
  const href = editHref(conflict.tableName, conflict.recordId)

  const handleReview = () => {
    startTransition(async () => {
      await markConflictReviewed(conflict.id)
      onReviewed(conflict.id)
    })
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Summary row */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 capitalize">
            {conflict.tableName.replace(/_/g, ' ')}
          </p>
          <p className="mt-0.5 truncate font-mono text-xs text-gray-400">{conflict.recordId}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs text-gray-500">
            {conflict.conflictedAt ? formatDate(conflict.conflictedAt.toISOString()) : '—'}
          </p>
          <p className="text-xs text-amber-600">{diffKeys.length} field(s) differ</p>
        </div>
        <svg
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 p-4 space-y-4">
          {/* Two-column diff */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Your Device Version
              </p>
              <div className="space-y-1">
                {diffKeys.map((key) => (
                  <div key={key} className="rounded-lg bg-amber-50 px-3 py-1.5">
                    <p className="text-xs font-medium text-amber-800">{key}</p>
                    <p className="mt-0.5 text-xs text-amber-700 break-all">
                      {renderValue(local[key])}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Server Version (kept)
              </p>
              <div className="space-y-1">
                {diffKeys.map((key) => (
                  <div key={key} className="rounded-lg bg-green-50 px-3 py-1.5">
                    <p className="text-xs font-medium text-green-800">{key}</p>
                    <p className="mt-0.5 text-xs text-green-700 break-all">
                      {renderValue(server[key])}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={handleReview} disabled={isPending}>
              {isPending ? 'Marking...' : 'Mark as Reviewed'}
            </Button>
            {href && (
              <Button variant="outline" size="sm" render={<Link href={href} />}>
                Edit Record
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SyncConflictsClient({
  conflicts: initialConflicts,
}: {
  conflicts: SyncConflictRecord[]
}) {
  const router = useRouter()
  const [conflicts, setConflicts] = useState(initialConflicts)
  const [isPending, startTransition] = useTransition()

  const handleReviewed = (id: string) => {
    setConflicts((prev) => prev.filter((c) => c.id !== id))
  }

  const handleMarkAll = () => {
    startTransition(async () => {
      await markAllConflictsReviewed()
      setConflicts([])
      router.refresh()
    })
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 space-y-4">
      <PageHeader
        title="Sync Conflicts"
        backHref="/settings"
        actions={
          conflicts.length > 1 ? (
            <Button variant="outline" size="sm" onClick={handleMarkAll} disabled={isPending}>
              {isPending ? 'Marking all...' : `Mark All Reviewed (${conflicts.length})`}
            </Button>
          ) : undefined
        }
      />

      <p className="text-sm text-gray-500">
        These records had conflicts between your device and the server. The server version was kept.
        Review and manually correct if needed.
      </p>

      {conflicts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <p className="text-sm font-medium text-gray-700">No conflicts detected</p>
          <p className="mt-1 text-xs text-gray-400">Your data is in sync across all devices.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {conflicts.map((c) => (
            <ConflictRow key={c.id} conflict={c} onReviewed={handleReviewed} />
          ))}
        </div>
      )}
    </div>
  )
}
