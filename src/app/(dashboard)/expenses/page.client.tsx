'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Banknote, RefreshCw } from 'lucide-react'
import {
  approveExpense,
  rejectExpense,
  type ExpenseListItem,
  type ExpenseSummary,
} from '@/actions/expenses'
import { useExpenses } from '@/lib/offline/dexieHooks'
import { localDb } from '@/db/local/dexie'
import { getCategoryLabel, EXPENSE_CATEGORIES } from '@/lib/expenses/categories'
import type { UserRole } from '@/lib/session'
import SwipeableRow from '@/components/SwipeableRow.client'
import { Button } from '@/components/ui/button'
import { ErrorMessage } from '@/components/ErrorMessage'
import { Card, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { SearchInput } from '@/components/ui/search-input'

import { formatGhs, formatDate } from '@/lib/format'

const STATUS_BADGE_VARIANT: Record<string, 'approved' | 'pending' | 'rejected'> = {
  approved: 'approved',
  pending_approval: 'pending',
  rejected: 'rejected',
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

// Normalised display shape — compatible with ExpenseListItem and DexieExpense
interface DisplayExpense {
  id: string
  expenseDate: string
  category: string | null
  description: string
  amount: string
  isCapitalExpense: boolean
  paymentMethod: string | null
  approvalStatus: string
  isRecurring?: boolean
  recurrenceRule?: string | null
  parentExpenseId?: string | null
}

function fromExpenseListItem(e: ExpenseListItem): DisplayExpense {
  return {
    id: e.id,
    expenseDate: e.expenseDate,
    category: e.category,
    description: e.description,
    amount: e.amount,
    isCapitalExpense: e.isCapitalExpense,
    paymentMethod: e.paymentMethod,
    approvalStatus: e.approvalStatus,
    isRecurring: e.isRecurring,
    recurrenceRule: e.recurrenceRule,
    parentExpenseId: e.parentExpenseId,
  }
}

export default function ExpenseList({
  businessId,
  initialExpenses,
  summary,
  userRole,
}: {
  businessId: string
  initialExpenses: ExpenseListItem[]
  summary: ExpenseSummary
  userRole: UserRole
}) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [isPending, startTransition] = useTransition()
  const [actionError, setActionError] = useState<string | null>(null)

  // Live from Dexie — returns all expenses for the business (no date cap).
  const dexieExpenses = useExpenses(businessId)

  const canApprove = userRole === 'owner' || userRole === 'manager'

  // Build display list from Dexie (preferred) or SSR fallback
  const allExpenses: DisplayExpense[] =
    dexieExpenses !== undefined
      ? dexieExpenses.map((e) => ({
          id: e.id,
          expenseDate: e.expenseDate,
          category: e.category,
          description: e.description,
          amount: String(e.amount),
          isCapitalExpense: e.isCapitalExpense,
          paymentMethod: e.paymentMethod,
          approvalStatus: e.approvalStatus,
        }))
      : initialExpenses.map(fromExpenseListItem)

  const filtered = allExpenses.filter((e) => {
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
        // Update Dexie so the live query re-renders automatically
        await localDb.expenses.update(expenseId, { approvalStatus: 'approved' })
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
        // Update Dexie so the live query re-renders automatically
        await localDb.expenses.update(expenseId, { approvalStatus: 'rejected' })
      } else {
        setActionError(result.error)
      }
    })
  }

  const total = filtered
    .filter((e) => e.approvalStatus === 'approved')
    .reduce((sum, e) => sum + parseFloat(e.amount), 0)

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Expenses"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" render={<Link href="/expenses/import" />}>
              Import CSV
            </Button>
            <Button render={<Link href="/expenses/new" />}>Record Expense</Button>
          </div>
        }
      />

      {/* Error banner */}
      <ErrorMessage message={actionError} className="mt-3" />

      {/* Filters */}
      <div className="mt-4 flex gap-2">
        <SearchInput
          placeholder="Search expenses..."
          value={search}
          onChange={setSearch}
          className="flex-1"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
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
              {formatGhs(pendingExpenses.reduce((s, e) => s + parseFloat(e.amount), 0))}
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
                      {formatGhs(expense.amount)}
                    </span>
                    <Button
                      size="sm"
                      className="min-h-[44px]"
                      onClick={() => handleApprove(expense.id)}
                      disabled={isPending}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="min-h-[44px]"
                      onClick={() => handleReject(expense.id)}
                      disabled={isPending}
                    >
                      Reject
                    </Button>
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
          <EmptyState
            icon={<Banknote className="h-10 w-10" />}
            title="No expenses yet"
            subtitle="Record your first expense to start tracking spending."
            action={{ label: 'Record Expense', href: '/expenses/new' }}
          />
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
                        <StatusBadge variant={STATUS_BADGE_VARIANT[expense.approvalStatus]}>
                          {STATUS_LABELS[expense.approvalStatus]}
                        </StatusBadge>
                      )}
                      {expense.isCapitalExpense && <Badge variant="secondary">Asset</Badge>}
                      {expense.isRecurring && (
                        <Badge variant="outline" className="gap-1 text-xs">
                          <RefreshCw className="h-3 w-3" />
                          {expense.recurrenceRule
                            ? expense.recurrenceRule.charAt(0).toUpperCase() +
                              expense.recurrenceRule.slice(1)
                            : 'Recurring'}
                        </Badge>
                      )}
                      {expense.parentExpenseId && !expense.isRecurring && (
                        <span className="text-xs text-muted-foreground">Auto-posted</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {formatDate(expense.expenseDate)} &middot;{' '}
                      {getCategoryLabel(expense.category ?? '') ??
                        expense.category ??
                        'Uncategorized'}{' '}
                      &middot;{' '}
                      {PAYMENT_LABELS[expense.paymentMethod ?? ''] ?? expense.paymentMethod}
                    </p>
                  </div>
                  <p className="ml-3 text-sm font-semibold text-gray-900 tabular-nums">
                    {formatGhs(expense.amount)}
                  </p>
                </div>
              </Link>
            </SwipeableRow>
          ))
        )}
      </div>

      {/* Summary footer */}
      {(otherExpenses.length > 0 || pendingExpenses.length > 0) && (
        <Card className="mt-4">
          <CardContent>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Total (approved):{' '}
                <span className="font-semibold text-foreground">{formatGhs(total)}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                {filtered.length} expense{filtered.length !== 1 ? 's' : ''}
              </p>
            </div>
            {summary.pendingApprovalCount > 0 && canApprove && (
              <p className="mt-1 text-xs text-amber-600">
                {summary.pendingApprovalCount} pending &middot; GHS{' '}
                {formatGhs(summary.pendingApprovalTotal)}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
