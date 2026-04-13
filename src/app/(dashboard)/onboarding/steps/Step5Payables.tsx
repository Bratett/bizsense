'use client'

import { useState, useTransition } from 'react'
import { completeOnboardingStep5 } from '@/actions/onboarding'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

type PayableRow = {
  supplierName: string
  phone: string
  amountOwed: string
  dueDate: string
}

const emptyRow: PayableRow = {
  supplierName: '',
  phone: '',
  amountOwed: '',
  dueDate: (() => {
    const d = new Date()
    d.setDate(d.getDate() + 30)
    return d.toISOString().split('T')[0]
  })(),
}

type Props = {
  onComplete: () => void
  onBack: () => void
}

export default function Step5Payables({ onComplete, onBack }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [rows, setRows] = useState<PayableRow[]>([{ ...emptyRow }])

  function updateRow(index: number, field: keyof PayableRow, value: string) {
    setRows((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  function addRow() {
    setRows((prev) => [...prev, { ...emptyRow }])
  }

  function removeRow(index: number) {
    if (rows.length <= 1) return
    setRows((prev) => prev.filter((_, i) => i !== index))
  }

  const total = rows.reduce((sum, r) => sum + (parseFloat(r.amountOwed) || 0), 0)

  function handleSubmit() {
    setError('')

    const validPayables = rows.filter((r) => r.supplierName.trim())
    if (validPayables.length === 0) {
      setError('Add at least one supplier or skip this step')
      return
    }

    for (const p of validPayables) {
      if (!p.amountOwed || parseFloat(p.amountOwed) <= 0) {
        setError(`Payable to "${p.supplierName}": amount is required and must be greater than 0`)
        return
      }
    }

    startTransition(async () => {
      const result = await completeOnboardingStep5({
        payables: validPayables.map((r) => ({
          supplierName: r.supplierName.trim(),
          phone: r.phone.trim() || undefined,
          amountOwed: parseFloat(r.amountOwed),
          dueDate: r.dueDate || undefined,
        })),
      })
      if (result.success) {
        onComplete()
      } else {
        setError(result.error)
      }
    })
  }

  if (!showForm) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Do you owe money to any suppliers?</CardTitle>
          <CardDescription>
            Add what your business owes. Skip if no outstanding payables.
          </CardDescription>
        </CardHeader>
        <CardContent>
        <div className="flex flex-col gap-3">
          <Button
            type="button"
            onClick={() => setShowForm(true)}
            className="w-full bg-green-700 hover:bg-green-800 active:bg-green-900"
            size="lg"
          >
            Yes, add suppliers
          </Button>
          <div className="flex items-center justify-between">
            <Button type="button" variant="ghost" onClick={onBack} className="text-sm text-muted-foreground">
              Back
            </Button>
            <Button type="button" variant="ghost" onClick={onComplete} className="text-sm text-muted-foreground/60">
              Skip this step
            </Button>
          </div>
        </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Outstanding Payables</CardTitle>
        <Button type="button" variant="ghost" onClick={onComplete} disabled={isPending} className="text-sm text-muted-foreground/60">
          Skip this step
        </Button>
      </CardHeader>
      <CardContent>
      <p className="mt-1 text-sm text-gray-500">Add suppliers you owe money to.</p>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-4">
        {rows.map((row, i) => (
          <div key={i} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">Supplier {i + 1}</span>
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  disabled={isPending}
                  className="text-xs text-gray-400 hover:text-red-500"
                >
                  Remove
                </button>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <input
                type="text"
                value={row.supplierName}
                onChange={(e) => updateRow(i, 'supplierName', e.target.value)}
                disabled={isPending}
                placeholder="Supplier Name *"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900
                           placeholder:text-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="tel"
                  inputMode="tel"
                  value={row.phone}
                  onChange={(e) => updateRow(i, 'phone', e.target.value)}
                  disabled={isPending}
                  placeholder="Phone"
                  className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900
                             placeholder:text-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
                />
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                    GHS
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={row.amountOwed}
                    onChange={(e) => updateRow(i, 'amountOwed', e.target.value)}
                    disabled={isPending}
                    placeholder="Amount *"
                    className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-3 text-sm text-right text-gray-900
                               placeholder:text-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-xs text-gray-500">Due Date</label>
                <input
                  type="date"
                  value={row.dueDate}
                  onChange={(e) => updateRow(i, 'dueDate', e.target.value)}
                  disabled={isPending}
                  className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900
                             focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
                />
              </div>
            </div>
          </div>
        ))}

        <Button
          type="button"
          variant="link"
          onClick={addRow}
          disabled={isPending}
          className="justify-start p-0 text-sm font-medium text-green-700 hover:text-green-800"
        >
          + Add another supplier
        </Button>

        {/* Total */}
        <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-3">
          <span className="text-sm font-medium text-foreground/80">Total Payables</span>
          <span className="text-base font-semibold text-foreground">
            GHS{' '}
            {total.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        {/* Actions */}
        <div className="mt-2 flex flex-col gap-2">
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="w-full bg-green-700 hover:bg-green-800 active:bg-green-900"
            size="lg"
          >
            {isPending ? 'Saving\u2026' : 'Continue'}
          </Button>
          <Button type="button" variant="ghost" onClick={onBack} disabled={isPending} className="text-sm text-muted-foreground">
            Back
          </Button>
        </div>
      </div>
      </CardContent>
    </Card>
  )
}
