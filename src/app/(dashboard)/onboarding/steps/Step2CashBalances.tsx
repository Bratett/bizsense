'use client'

import { useState, useTransition } from 'react'
import { completeOnboardingStep2 } from '@/actions/onboarding'

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
    <div className="rounded-2xl border border-gray-200 bg-white px-5 py-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">
        What&apos;s your current cash position?
      </h2>
      <p className="mt-1 text-sm text-gray-500">
        Enter what you have right now. You can update this later.
      </p>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="mt-5 flex flex-col gap-4">
        {/* Opening balance date */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="openingDate" className="text-sm font-medium text-gray-700">
            As of what date?
          </label>
          <input
            id="openingDate"
            type="date"
            value={openingDate}
            onChange={(e) => setOpeningDate(e.target.value)}
            disabled={isPending}
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base text-gray-900
                       focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100
                       disabled:bg-gray-50 disabled:text-gray-400"
          />
          <p className="text-xs text-gray-400">
            This becomes your BizSense start date. Transactions before this date stay in your paper
            records.
          </p>
        </div>

        {/* Cash accounts */}
        <div className="flex flex-col gap-3">
          {DEFAULT_ACCOUNTS.map((account) => (
            <div key={account.code} className="flex flex-col gap-1">
              <label htmlFor={account.code} className="text-sm font-medium text-gray-700">
                {account.label}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                  GHS
                </span>
                <input
                  id={account.code}
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={amounts[account.code]}
                  onChange={(e) => updateAmount(account.code, e.target.value)}
                  disabled={isPending}
                  placeholder="0.00"
                  className={`${inputClass} pl-12`}
                />
              </div>
            </div>
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
            <button
              type="button"
              onClick={addExtraBank}
              disabled={isPending}
              className="text-sm font-medium text-green-700 hover:text-green-800"
            >
              + Add another bank account
            </button>
          )}
        </div>

        {/* Total */}
        <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
          <span className="text-sm font-medium text-gray-700">Total</span>
          <span className="text-base font-semibold text-gray-900">
            GHS{' '}
            {total.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        {/* Actions */}
        <div className="mt-2 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="w-full rounded-lg bg-green-700 px-4 py-3 text-base font-semibold text-white
                       transition-colors hover:bg-green-800 active:bg-green-900
                       disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? 'Saving\u2026' : 'Continue'}
          </button>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onBack}
              disabled={isPending}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleSkip}
              disabled={isPending}
              className="text-sm text-gray-400 hover:text-gray-600"
            >
              Skip this step
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
