'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, Plus, Pencil, Trash2 } from 'lucide-react'
import {
  upsertExpenseBudget,
  getExpenseBudgetStatus,
  deactivateBudget,
  type BudgetStatus,
} from '@/actions/expenseBudgets'
import { Button } from '@/components/ui/button'
import type { UserRole } from '@/lib/session'
import { formatGhs } from '@/lib/format'

type ExpenseAccount = { id: string; code: string; name: string }

function buildMonthOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = []
  const now = new Date()
  for (let i = -5; i <= 1; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleString('default', { month: 'long', year: 'numeric' })
    options.push({ value, label })
  }
  return options.reverse()
}

function ProgressBar({ percent }: { percent: number }) {
  const capped = Math.min(percent, 100)
  const colour = percent > 100 ? 'bg-red-500' : percent >= 70 ? 'bg-amber-400' : 'bg-green-500'

  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
      <div
        className={`h-full rounded-full transition-all ${colour}`}
        style={{ width: `${capped}%` }}
      />
    </div>
  )
}

interface BudgetFormProps {
  expenseAccounts: ExpenseAccount[]
  initial?: BudgetStatus | null
  onSave: (input: {
    accountId: string
    category: string
    monthlyBudget: number
    alertThreshold: number
  }) => void
  onCancel: () => void
  isSaving: boolean
}

function BudgetForm({ expenseAccounts, initial, onSave, onCancel, isSaving }: BudgetFormProps) {
  const [accountId, setAccountId] = useState(initial?.accountId ?? '')
  const [category, setCategory] = useState(initial?.category ?? '')
  const [budget, setBudget] = useState(initial?.monthlyBudget?.toString() ?? '')
  const [threshold, setThreshold] = useState(
    initial ? Math.round(initial.alertThreshold * 100).toString() : '80',
  )

  function handleAccountChange(id: string) {
    setAccountId(id)
    const acc = expenseAccounts.find((a) => a.id === id)
    if (acc && !category) setCategory(acc.name)
  }

  function handleSubmit() {
    const budgetNum = parseFloat(budget)
    const thresholdNum = parseInt(threshold, 10)
    if (!accountId || !category || isNaN(budgetNum) || budgetNum <= 0) {
      toast.error('Please fill in all fields with valid values.')
      return
    }
    onSave({
      accountId,
      category,
      monthlyBudget: budgetNum,
      alertThreshold: thresholdNum / 100,
    })
  }

  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-900">
        {initial ? 'Edit Budget' : 'Add Budget'}
      </h3>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Expense Account</label>
          <select
            value={accountId}
            onChange={(e) => handleAccountChange(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Select account...</option>
            {expenseAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Category Label</label>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. Transport & Fuel"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Monthly Limit (GHS)
            </label>
            <input
              type="text"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="w-28">
            <label className="mb-1 block text-xs font-medium text-gray-600">Alert at (%)</label>
            <input
              type="text"
              inputMode="decimal"
              min="1"
              max="100"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <Button size="sm" onClick={handleSubmit} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save Budget'}
        </Button>
        <Button variant="outline" size="sm" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

export default function BudgetsPageClient({
  initialStatuses,
  initialMonth,
  expenseAccounts,
  userRole,
}: {
  initialStatuses: BudgetStatus[]
  initialMonth: string
  expenseAccounts: ExpenseAccount[]
  userRole: UserRole
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [statuses, setStatuses] = useState<BudgetStatus[]>(initialStatuses)
  const [month, setMonth] = useState(initialMonth)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingBudget, setEditingBudget] = useState<BudgetStatus | null>(null)

  const canEdit = userRole === 'owner' || userRole === 'manager'
  const monthOptions = buildMonthOptions()

  function refreshForMonth(newMonth: string) {
    setMonth(newMonth)
    startTransition(async () => {
      try {
        const updated = await getExpenseBudgetStatus(newMonth)
        setStatuses(updated)
      } catch {
        toast.error('Failed to load budget data.')
      }
    })
  }

  function handleSave(input: {
    accountId: string
    category: string
    monthlyBudget: number
    alertThreshold: number
  }) {
    startTransition(async () => {
      try {
        await upsertExpenseBudget(input)
        toast.success('Budget saved.')
        setShowAddForm(false)
        setEditingBudget(null)
        const updated = await getExpenseBudgetStatus(month)
        setStatuses(updated)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to save budget.')
      }
    })
  }

  function handleDeactivate(budgetId: string, category: string) {
    if (!confirm(`Remove budget for "${category}"? This cannot be undone.`)) return
    startTransition(async () => {
      try {
        await deactivateBudget(budgetId)
        toast.success(`Budget for "${category}" removed.`)
        const updated = await getExpenseBudgetStatus(month)
        setStatuses(updated)
      } catch {
        toast.error('Failed to remove budget.')
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-gray-900">Expense Budgets</h1>
          <p className="text-sm text-gray-500">Set monthly spending limits per category</p>
        </div>
        {canEdit && (
          <Button
            size="sm"
            className="gap-1"
            onClick={() => {
              setShowAddForm(true)
              setEditingBudget(null)
            }}
          >
            <Plus className="h-4 w-4" /> Add Budget
          </Button>
        )}
      </div>

      {/* Month selector */}
      <select
        value={month}
        onChange={(e) => refreshForMonth(e.target.value)}
        disabled={isPending}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
      >
        {monthOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {/* Add/edit form */}
      {showAddForm && !editingBudget && (
        <BudgetForm
          expenseAccounts={expenseAccounts}
          initial={null}
          onSave={handleSave}
          onCancel={() => setShowAddForm(false)}
          isSaving={isPending}
        />
      )}
      {editingBudget && (
        <BudgetForm
          expenseAccounts={expenseAccounts}
          initial={editingBudget}
          onSave={handleSave}
          onCancel={() => setEditingBudget(null)}
          isSaving={isPending}
        />
      )}

      {/* Budget status cards */}
      {statuses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center">
          <p className="text-sm font-medium text-gray-700">No budgets set</p>
          <p className="mt-1 text-xs text-gray-500">
            Set monthly spending limits for categories like Rent, Fuel, and Marketing. BizSense will
            alert you when you&apos;re approaching your limit.
          </p>
          {canEdit && (
            <Button size="sm" className="mt-4 gap-1" onClick={() => setShowAddForm(true)}>
              <Plus className="h-4 w-4" /> Add Budget
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {statuses.map((s) => {
            const overBudgetBy = s.spentThisMonth - s.monthlyBudget
            return (
              <div
                key={s.id}
                className={`rounded-xl border bg-white p-4 ${
                  s.isOverBudget
                    ? 'border-red-200'
                    : s.isNearLimit
                      ? 'border-amber-200'
                      : 'border-gray-200'
                }`}
              >
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{s.category}</p>
                    <p className="text-xs text-gray-500">{s.accountName}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {canEdit && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingBudget(s)
                            setShowAddForm(false)
                          }}
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          aria-label={`Edit ${s.category} budget`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeactivate(s.id, s.category)}
                          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                          aria-label={`Remove ${s.category} budget`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
                  <span>
                    Spent:{' '}
                    <span className="font-medium text-gray-800">{formatGhs(s.spentThisMonth)}</span>
                  </span>
                  <span>
                    Budget:{' '}
                    <span className="font-medium text-gray-800">{formatGhs(s.monthlyBudget)}</span>
                  </span>
                  <span>
                    {s.isOverBudget ? (
                      <span className="font-semibold text-red-600">
                        OVER by {formatGhs(overBudgetBy)}
                      </span>
                    ) : (
                      <>
                        Left:{' '}
                        <span className="font-medium text-gray-800">
                          {formatGhs(s.remainingBudget)}
                        </span>
                      </>
                    )}
                  </span>
                </div>

                <ProgressBar percent={s.percentUsed} />

                <p
                  className={`mt-1 text-right text-xs font-medium ${
                    s.isOverBudget
                      ? 'text-red-600'
                      : s.isNearLimit
                        ? 'text-amber-600'
                        : 'text-gray-500'
                  }`}
                >
                  {s.percentUsed}% used
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
