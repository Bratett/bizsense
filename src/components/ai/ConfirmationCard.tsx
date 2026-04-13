'use client'

import { useState, useEffect } from 'react'

// ─── Action Metadata ──────────────────────────────────────────────────────────

const ACTION_META: Record<string, { icon: string; label: string }> = {
  record_sale: { icon: '🧾', label: 'Proposed Sale' },
  record_expense: { icon: '💸', label: 'Proposed Expense' },
  record_payment_received: { icon: '✅', label: 'Proposed Payment Receipt' },
  add_customer: { icon: '👤', label: 'New Customer' },
  update_customer: { icon: '✏️', label: 'Update Customer' },
  add_supplier: { icon: '🏭', label: 'New Supplier' },
  adjust_stock: { icon: '📦', label: 'Stock Adjustment' },
}

// Map result tables to their detail route prefix
const RESULT_ROUTES: Partial<Record<string, string>> = {
  orders: '/orders',
  expenses: '/expenses',
  payments_received: '/orders',
  customers: '/customers',
  suppliers: '/suppliers',
}

// ─── ExpiryCountdown ─────────────────────────────────────────────────────────

function ExpiryCountdown({ expiresAt }: { expiresAt: string }) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)),
  )

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [expiresAt])

  if (secondsLeft === 0) return <span className="text-sm text-red-500">Expired</span>
  const mins = Math.floor(secondsLeft / 60)
  const secs = secondsLeft % 60
  return (
    <span className="text-sm text-amber-600">
      Expires in {mins}:{String(secs).padStart(2, '0')}
    </span>
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type PendingActionProps = {
  id: string
  actionType: string
  humanReadable: string
  proposedData: Record<string, unknown>
  expiresAt: string
  status: 'pending' | 'confirmed' | 'rejected' | 'expired'
  resultId?: string
  resultTable?: string
}

type ConfirmationCardProps = {
  pendingAction: PendingActionProps
  onConfirm: (id: string) => Promise<void>
  onReject: (id: string) => Promise<void>
}

// ─── ConfirmationCard ─────────────────────────────────────────────────────────

export function ConfirmationCard({ pendingAction, onConfirm, onReject }: ConfirmationCardProps) {
  const { id, actionType, humanReadable, proposedData, expiresAt, resultId, resultTable } =
    pendingAction

  const meta = ACTION_META[actionType] ?? { icon: '📋', label: actionType }

  // Derive initial local status from prop
  const [localStatus, setLocalStatus] = useState<
    'idle' | 'loading' | 'confirmed' | 'rejected' | 'error'
  >(
    pendingAction.status === 'confirmed'
      ? 'confirmed'
      : pendingAction.status === 'rejected'
        ? 'rejected'
        : 'idle',
  )
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Expiry tracking — set a timer so the UI disables when the action expires
  const [isExpired, setIsExpired] = useState(() => new Date(expiresAt) < new Date())
  useEffect(() => {
    if (isExpired) return
    const ms = new Date(expiresAt).getTime() - Date.now()
    if (ms <= 0) {
      setIsExpired(true)
      return
    }
    const t = setTimeout(() => setIsExpired(true), ms)
    return () => clearTimeout(t)
  }, [expiresAt, isExpired])

  const isLoading = localStatus === 'loading'

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleConfirm() {
    setLocalStatus('loading')
    setErrorMsg(null)
    try {
      await onConfirm(id)
      setLocalStatus('confirmed')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setLocalStatus('error')
    }
  }

  async function handleReject() {
    setLocalStatus('loading')
    try {
      await onReject(id)
      setLocalStatus('rejected')
    } catch {
      setLocalStatus('idle')
    }
  }

  // ── Confirmed state ───────────────────────────────────────────────────────

  if (localStatus === 'confirmed') {
    const route = resultTable ? RESULT_ROUTES[resultTable] : undefined
    return (
      <div className="rounded-xl border-2 border-green-300 bg-green-50 p-4 shadow-sm">
        <p className="text-sm font-semibold text-green-800">
          ✓ Recorded — {meta.label.replace('Proposed ', '')}
        </p>
        {route && resultId && (
          <a href={`${route}/${resultId}`} className="mt-1 block text-xs text-green-700 underline">
            View record →
          </a>
        )}
      </div>
    )
  }

  // ── Rejected state ────────────────────────────────────────────────────────

  if (localStatus === 'rejected') {
    return (
      <div className="rounded-xl border-2 border-gray-200 bg-gray-50 p-4 shadow-sm">
        <p className="text-sm text-gray-500">✗ Not recorded</p>
      </div>
    )
  }

  // ── Pending / loading state ───────────────────────────────────────────────

  return (
    <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span aria-hidden="true">{meta.icon}</span>
          <span className="text-sm font-semibold text-gray-900">{meta.label}</span>
        </div>
        <ExpiryCountdown expiresAt={expiresAt} />
      </div>

      {/* Body */}
      <div className="mt-3 space-y-1">
        {isExpired ? (
          <p className="text-sm text-red-600">This action has expired. Please ask again.</p>
        ) : (
          humanReadable.split('\n').map((line, i) => (
            <p key={i} className="text-sm text-gray-800">
              {line}
            </p>
          ))
        )}
      </div>

      {/* Warning: capital expense */}
      {!isExpired && proposedData.isCapitalExpense === true && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-100 p-2">
          <p className="text-xs text-amber-800">This records as a Fixed Asset, not an expense</p>
        </div>
      )}

      {/* Error state */}
      {localStatus === 'error' && errorMsg && (
        <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-2">
          <p className="text-xs text-red-700">{errorMsg}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-4 flex flex-col gap-2">
        <button
          onClick={handleConfirm}
          disabled={isLoading || isExpired}
          className="flex h-13 w-full items-center justify-center rounded-lg bg-green-700 text-sm font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? (
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            '✓ Confirm'
          )}
        </button>
        <button
          onClick={handleReject}
          disabled={isLoading}
          className="flex h-13 w-full items-center justify-center rounded-xl border border-red-300 bg-white text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? (
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-red-400 border-t-transparent" />
          ) : (
            '✗ Reject'
          )}
        </button>
      </div>
    </div>
  )
}
