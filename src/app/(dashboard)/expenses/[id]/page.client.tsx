'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  approveExpense,
  rejectExpense,
  reverseExpense,
  type ExpenseDetail,
} from '@/actions/expenses'
import { getCategoryLabel } from '@/lib/expenses/categories'
import ReceiptCapture from '@/components/receipts/ReceiptCapture.client'
import type { UserRole } from '@/lib/session'

function formatGHS(amount: string | number): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  return num.toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const STATUS_STYLES: Record<string, string> = {
  approved: 'bg-green-100 text-green-700',
  pending_approval: 'bg-amber-100 text-amber-700',
  rejected: 'bg-red-100 text-red-700',
}

const STATUS_LABELS: Record<string, string> = {
  approved: 'Approved',
  pending_approval: 'Pending Approval',
  rejected: 'Rejected',
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash',
  momo_mtn: 'MTN MoMo',
  momo_telecel: 'Telecel',
  momo_airtel: 'AirtelTigo',
  bank: 'Bank',
}

export default function ExpenseDetailView({
  expense,
  userRole,
}: {
  expense: ExpenseDetail
  userRole: UserRole
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showReversalDialog, setShowReversalDialog] = useState(false)
  const [reversalReason, setReversalReason] = useState('')

  const canApprove =
    (userRole === 'owner' || userRole === 'manager') &&
    expense.approvalStatus === 'pending_approval'

  const canReverse =
    (userRole === 'owner' || userRole === 'manager') &&
    expense.approvalStatus === 'approved' &&
    expense.journalEntryId

  const handleApprove = () => {
    setError(null)
    startTransition(async () => {
      const result = await approveExpense(expense.id)
      if (result.success) {
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  const handleReject = () => {
    setError(null)
    startTransition(async () => {
      const result = await rejectExpense(expense.id)
      if (result.success) {
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  const handleReverse = () => {
    if (reversalReason.trim().length < 5) return
    setError(null)
    startTransition(async () => {
      const result = await reverseExpense(expense.id, reversalReason.trim())
      if (result.success) {
        setShowReversalDialog(false)
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/expenses"
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          aria-label="Back to expenses"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Expense Detail</h1>
          <p className="text-sm text-gray-500">
            {getCategoryLabel(expense.category ?? '') ?? expense.category ?? 'Uncategorized'}
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {/* Main info card */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-lg font-bold text-gray-900">GHS {formatGHS(expense.amount)}</p>
              <p className="mt-1 text-sm text-gray-600">{expense.description}</p>
            </div>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                STATUS_STYLES[expense.approvalStatus] ?? 'bg-gray-100 text-gray-600'
              }`}
            >
              {STATUS_LABELS[expense.approvalStatus] ?? expense.approvalStatus}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-gray-500">Date</p>
              <p className="font-medium text-gray-900">{formatDate(expense.expenseDate)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Payment Method</p>
              <p className="font-medium text-gray-900">
                {PAYMENT_LABELS[expense.paymentMethod] ?? expense.paymentMethod}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Account</p>
              <p className="font-medium text-gray-900">
                {expense.accountCode} &mdash; {expense.accountName}
              </p>
            </div>
            {expense.isCapitalExpense && (
              <div>
                <p className="text-xs text-gray-500">Type</p>
                <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                  Capital Asset
                </span>
              </div>
            )}
          </div>

          {expense.approvedBy && expense.approvedAt && (
            <div className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-500">
              Approved on{' '}
              {new Date(expense.approvedAt).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
            </div>
          )}
        </div>

        {/* Receipt */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="mb-2 text-sm font-medium text-gray-700">Receipt</p>
          <ReceiptCapture
            expenseId={expense.id}
            existingReceiptPath={expense.receiptUrl}
            onUploadComplete={() => router.refresh()}
          />
        </div>

        {/* Notes */}
        {expense.notes && (
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="mb-1 text-sm font-medium text-gray-700">Notes</p>
            <p className="whitespace-pre-wrap text-sm text-gray-600">{expense.notes}</p>
          </div>
        )}

        {/* Journal reference */}
        {expense.journalEntryId && (userRole === 'owner' || userRole === 'accountant') && (
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="mb-1 text-sm font-medium text-gray-700">Journal Entry</p>
            <p className="text-xs font-mono text-gray-500">
              EXP-{expense.id.slice(0, 8).toUpperCase()}
            </p>
            <Link
              href="/ledger"
              className="mt-1 inline-block text-sm text-blue-600 hover:text-blue-800"
            >
              View in ledger
            </Link>
          </div>
        )}

        {/* Actions */}
        {canApprove && (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleApprove}
              disabled={isPending}
              className="flex-1 rounded-lg bg-green-700 px-4 py-3 text-base font-semibold text-white hover:bg-green-800 disabled:opacity-60"
            >
              {isPending ? 'Processing...' : 'Approve'}
            </button>
            <button
              type="button"
              onClick={handleReject}
              disabled={isPending}
              className="flex-1 rounded-lg border border-red-300 px-4 py-3 text-base font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
            >
              Reject
            </button>
          </div>
        )}

        {canReverse && !showReversalDialog && (
          <button
            type="button"
            onClick={() => setShowReversalDialog(true)}
            className="w-full rounded-lg border border-red-300 px-4 py-3 text-base font-medium text-red-600 hover:bg-red-50"
          >
            Reverse Expense
          </button>
        )}

        {/* Reversal dialog */}
        {showReversalDialog && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-800">
              This will post a reversal journal entry. The original expense and entry will remain
              for audit purposes.
            </p>
            <div className="mt-3">
              <label className="text-sm font-medium text-gray-700">
                Reason for reversal <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={reversalReason}
                onChange={(e) => setReversalReason(e.target.value)}
                placeholder="e.g. Entered wrong amount, duplicate entry"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base text-gray-900 placeholder-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
              />
              {reversalReason.trim().length > 0 && reversalReason.trim().length < 5 && (
                <p className="mt-1 text-xs text-red-600">Reason must be at least 5 characters</p>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={handleReverse}
                disabled={isPending || reversalReason.trim().length < 5}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isPending ? 'Reversing...' : 'Confirm Reversal'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowReversalDialog(false)
                  setReversalReason('')
                }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
