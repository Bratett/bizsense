'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  approveExpense,
  rejectExpense,
  type ExpenseListItem,
  type ExpenseSummary,
} from '@/actions/expenses'
import { getCategoryLabel, EXPENSE_CATEGORIES } from '@/lib/expenses/categories'
import type { UserRole } from '@/lib/session'
import SwipeableRow from '@/components/SwipeableRow.client'

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
  pending_approval: 'Pending',
  rejected: 'Rejected',
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash',
  momo_mtn: 'MTN MoMo',
  momo_telecel: 'Telecel',
  momo_airtel: 'AirtelTigo',
  bank: 'Bank',
}

export default function ExpenseList({
  initialExpenses,
  summary,
  userRole,
}: {
  initialExpenses: ExpenseListItem[]
  summary: ExpenseSummary
  userRole: UserRole
}) {
  const router = useRouter()
  const [expenses, setExpenses] = useState(initialExpenses)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [isPending, startTransition] = useTransition()
  const [actionError, setActionError] = useState<string | null>(null)

  const canApprove = userRole === 'owner' || userRole === 'manager'

  const filtered = expenses.filter((e) => {
    if (search) {
      const term = search.toLowerCase()
      if (!e.description.toLowerCase().includes(term)) return false
    }
    if (categoryFilter && e.category !== categoryFilter) return false
    return true
  })

  const pendingExpenses = filtered.filter((e) => e.approvalStatus === 'pending_approval')
  const otherExpenses = filtered.filter((e) => e.approvalStatus !== 'pending_approval')

  const handleApprove = (expenseId: string) => {
    setActionError(null)
    startTransition(async () => {
      const result = await approveExpense(expenseId)
      if (result.success) {
        setExpenses((prev) =>
          prev.map((e) =>
            e.id === expenseId ? { ...e, approvalStatus: 'approved' } : e,
          ),
        )
      } else {
        setActionError(result.error)
      }
    })
  }

  const handleReject = (expenseId: string) => {
    setActionError(null)
    startTransition(async () => {
      const result = await rejectExpense(expenseId)
      if (result.success) {
        setExpenses((prev) =>
          prev.map((e) =>
            e.id === expenseId ? { ...e, approvalStatus: 'rejected' } : e,
          ),
        )
      } else {
        setActionError(result.error)
      }
    })
  }

  const total = filtered
    .filter((e) => e.approvalStatus === 'approved')
    .reduce((sum, e) => sum + parseFloat(e.amount), 0)

  return (
    <div className="mx-auto max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Expenses</h1>
        <Link
          href="/expenses/new"
          className="rounded-lg bg-green-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-800"
        >
          Record Expense
        </Link>
      </div>

      {/* Error banner */}
      {actionError && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {actionError}
        </div>
      )}

      {/* Filters */}
      <div className="mt-4 flex gap-2">
        <input
          type="search"
          placeholder="Search expenses..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
        >
          <option value="">All Categories</option>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {/* Pending approvals section */}
      {canApprove && pendingExpenses.length > 0 && (
        <div className="mt-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-800">
              {pendingExpenses.length} expense{pendingExpenses.length > 1 ? 's' : ''} awaiting
              approval &mdash; GHS{' '}
              {formatGHS(
                pendingExpenses.reduce((s, e) => s + parseFloat(e.amount), 0),
              )}
            </p>

            <div className="mt-3 space-y-2">
              {pendingExpenses.map((expense) => (
                <div
                  key={expense.id}
                  className="flex items-center justify-between rounded-lg bg-white p-3 shadow-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {expense.description}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatDate(expense.expenseDate)} &middot;{' '}
                      {getCategoryLabel(expense.category ?? '') ?? expense.category}
                    </p>
                  </div>
                  <div className="ml-3 flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900 tabular-nums">
                      GHS {formatGHS(expense.amount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleApprove(expense.id)}
                      disabled={isPending}
                      className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReject(expense.id)}
                      disabled={isPending}
                      className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Expense list */}
      <div className="mt-4 space-y-2">
        {otherExpenses.length === 0 && pendingExpenses.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-gray-200 px-6 py-12 text-center">
            <svg
              className="mx-auto h-10 w-10 text-gray-300"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"
              />
            </svg>
            <p className="mt-3 text-sm font-medium text-gray-900">No expenses yet</p>
            <p className="mt-1 text-sm text-gray-500">
              Record your first expense to start tracking spending.
            </p>
            <Link
              href="/expenses/new"
              className="mt-4 inline-block rounded-lg bg-green-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-800"
            >
              Record Expense
            </Link>
          </div>
        ) : (
          otherExpenses.map((expense) => (
            <SwipeableRow
              key={expense.id}
              actions={[
                {
                  label: 'View',
                  color: 'bg-blue-500',
                  onClick: () => router.push(`/expenses/${expense.id}`),
                },
              ]}
            >
              <Link
                href={`/expenses/${expense.id}`}
                className="block rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-gray-300"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {expense.description}
                      </p>
                      {expense.approvalStatus === 'rejected' && (
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[expense.approvalStatus]}`}
                        >
                          {STATUS_LABELS[expense.approvalStatus]}
                        </span>
                      )}
                      {expense.isCapitalExpense && (
                        <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                          Asset
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {formatDate(expense.expenseDate)} &middot;{' '}
                      {getCategoryLabel(expense.category ?? '') ?? expense.category ?? 'Uncategorized'}{' '}
                      &middot; {PAYMENT_LABELS[expense.paymentMethod] ?? expense.paymentMethod}
                    </p>
                  </div>
                  <p className="ml-3 text-sm font-semibold text-gray-900 tabular-nums">
                    GHS {formatGHS(expense.amount)}
                  </p>
                </div>
              </Link>
            </SwipeableRow>
          ))
        )}
      </div>

      {/* Summary footer */}
      {(otherExpenses.length > 0 || pendingExpenses.length > 0) && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Total (approved): <span className="font-semibold">GHS {formatGHS(total)}</span>
            </p>
            <p className="text-sm text-gray-500">
              {filtered.length} expense{filtered.length !== 1 ? 's' : ''}
            </p>
          </div>
          {summary.pendingApprovalCount > 0 && canApprove && (
            <p className="mt-1 text-xs text-amber-600">
              {summary.pendingApprovalCount} pending &middot; GHS{' '}
              {formatGHS(summary.pendingApprovalTotal)}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
