'use client'

import { useState, useTransition } from 'react'
import { completeOnboardingStep2 } from '@/actions/onboarding'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { MoneyInput } from '@/components/ui/money-input'

const DEFAULT_ACCOUNTS = [
  { code: '1001', label: 'Cash on Hand' },
  { code: '1002', label: 'MTN MoMo' },
  { code: '1003', label: 'Telecel Cash' },
  { code: '1004', label: 'AirtelTigo Money' },
  { code: '1005', label: 'Bank Account' },
]

type ExtraBank = {
  code: string
  label: string
  amount: string
}

type Props = {
  onComplete: () => void
  onBack: () => void
}

export default function Step2CashBalances({ onComplete, onBack }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const today = new Date()
  const firstOfMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  const [openingDate, setOpeningDate] = useState(firstOfMonth)

  const [amounts, setAmounts] = useState<Record<string, string>>(
    Object.fromEntries(DEFAULT_ACCOUNTS.map((a) => [a.code, ''])),
  )

  const [extraBanks, setExtraBanks] = useState<ExtraBank[]>([])

  function updateAmount(code: string, value: string) {
    setAmounts((prev) => ({ ...prev, [code]: value }))
  }

  function addExtraBank() {
    if (extraBanks.length >= 3) return
    const code = `100${6 + extraBanks.length}`
    setExtraBanks((prev) => [...prev, { code, label: '', amount: '' }])
  }

  function updateExtraBank(index: number, field: 'label' | 'amount', value: string) {
    setExtraBanks((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  function removeExtraBank(index: number) {
    setExtraBanks((prev) => prev.filter((_, i) => i !== index))
  }

  const total = [
    ...DEFAULT_ACCOUNTS.map((a) => parseFloat(amounts[a.code]) || 0),
    ...extraBanks.map((b) => parseFloat(b.amount) || 0),
  ].reduce((sum, v) => sum + v, 0)

  function handleSubmit() {
    setError('')

    if (!openingDate) {
      setError('Opening balance date is required')
      return
    }

    const balances = [
      ...DEFAULT_ACCOUNTS.map((a) => ({
        accountCode: a.code,
        amount: parseFloat(amounts[a.code]) || 0,
        label: a.label,
      })),
      ...extraBanks
        .filter((b) => b.label.trim())
        .map((b) => ({
          accountCode: b.code,
          amount: parseFloat(b.amount) || 0,
          label: b.label.trim(),
        })),
    ]

    startTransition(async () => {
      const result = await completeOnboardingStep2({
        openingBalanceDate: openingDate,
        balances,
      })
      if (result.success) {
        onComplete()
      } else {
        setError(result.error)
      }
    })
  }

  function handleSkip() {
    if (!openingDate) {
      setError('Opening balance date is required even when skipping')
      return
    }
    startTransition(async () => {
      const result = await completeOnboardingStep2({
        openingBalanceDate: openingDate,
        balances: [],
      })
      if (result.success) {
        onComplete()
      } else {
        setError(result.error)
      }
    })
  }

  const inputClass =
    'w-full rounded-lg border border-gray-300 px-4 py-3 text-base text-gray-900 text-right placeholder:text-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100 disabled:bg-gray-50 disabled:text-gray-400'

  return (
    <Card>
      <CardHeader>
        <CardTitle>What&apos;s your current cash position?</CardTitle>
        <CardDescription>
          Enter what you have right now. You can update this later.
        </CardDescription>
      </CardHeader>
      <CardContent>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="mt-5 flex flex-col gap-4">
        {/* Opening balance date */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="openingDate">As of what date?</Label>
          <Input
            id="openingDate"
            type="date"
            value={openingDate}
            onChange={(e) => setOpeningDate(e.target.value)}
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">
            This becomes your BizSense start date. Transactions before this date stay in your paper
            records.
          </p>
        </div>

        {/* Cash accounts */}
        <div className="flex flex-col gap-3">
          {DEFAULT_ACCOUNTS.map((account) => (
            <MoneyInput
              key={account.code}
              id={account.code}
              label={account.label}
              value={amounts[account.code]}
              onChange={(val) => updateAmount(account.code, val)}
              disabled={isPending}
              placeholder="0.00"
            />
          ))}

          {/* Extra bank accounts */}
          {extraBanks.map((bank, i) => (
            <div
              key={bank.code}
              className="flex flex-col gap-1.5 rounded-lg border border-gray-100 bg-gray-50 p-3"
            >
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">Additional Bank {i + 1}</label>
                <button
                  type="button"
                  onClick={() => removeExtraBank(i)}
                  disabled={isPending}
                  className="text-xs text-gray-400 hover:text-red-500"
                >
                  Remove
                </button>
              </div>
              <input
                type="text"
                value={bank.label}
                onChange={(e) => updateExtraBank(i, 'label', e.target.value)}
                disabled={isPending}
                placeholder="Bank name"
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900
                           placeholder:text-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
              />
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                  GHS
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={bank.amount}
                  onChange={(e) => updateExtraBank(i, 'amount', e.target.value)}
                  disabled={isPending}
                  placeholder="0.00"
                  className={`${inputClass} pl-12`}
                />
              </div>
            </div>
          ))}

          {extraBanks.length < 3 && (
            <Button
              type="button"
              variant="link"
              onClick={addExtraBank}
              disabled={isPending}
              className="justify-start p-0 text-sm font-medium text-green-700 hover:text-green-800"
            >
              + Add another bank account
            </Button>
          )}
        </div>

        {/* Total */}
        <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-3">
          <span className="text-sm font-medium text-foreground/80">Total</span>
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
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={onBack}
              disabled={isPending}
              className="text-sm text-muted-foreground"
            >
              Back
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={handleSkip}
              disabled={isPending}
              className="text-sm text-muted-foreground/60"
            >
              Skip this step
            </Button>
          </div>
        </div>
      </div>
      </CardContent>
    </Card>
  )
}
