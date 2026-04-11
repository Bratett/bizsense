'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import Link from 'next/link'
import {
  createExpense,
  previewExpenseVat,
  type PaymentMethod,
  type CreateExpenseInput,
  type RecurrenceFrequency,
} from '@/actions/expenses'
import { EXPENSE_CATEGORIES } from '@/lib/expenses/categories'
import type { UserRole } from '@/lib/session'

// ─── Constants ───────────────────────────────────────────────────────────────

type PaymentOption = {
  value: PaymentMethod
  label: string
  requiresRef: boolean
}

const PAYMENT_OPTIONS: PaymentOption[] = [
  { value: 'cash', label: 'Cash', requiresRef: false },
  { value: 'momo_mtn', label: 'MTN MoMo', requiresRef: true },
  { value: 'momo_telecel', label: 'Telecel', requiresRef: true },
  { value: 'momo_airtel', label: 'AirtelTigo', requiresRef: true },
  { value: 'bank', label: 'Bank', requiresRef: true },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

function formatGHS(amount: number): string {
  return amount.toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function NewExpenseForm({
  vatRegistered,
  userRole,
}: {
  vatRegistered: boolean
  userRole: UserRole
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [success, setSuccess] = useState<string | null>(null)

  // ─── Form state ───────────────────────────────────────────────────────────
  const [expenseDate, setExpenseDate] = useState(todayISO())
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [momoReference, setMomoReference] = useState('')
  const [bankReference, setBankReference] = useState('')
  const [includesVat, setIncludesVat] = useState(false)
  const [notes, setNotes] = useState('')
  const [capitalAcknowledged, setCapitalAcknowledged] = useState(false)
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<RecurrenceFrequency>('monthly')
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null)
  const [receiptFile, setReceiptFile] = useState<File | null>(null)

  // ─── VAT preview ──────────────────────────────────────────────────────────
  const [vatPreview, setVatPreview] = useState<{
    netAmount: number
    vatAmount: number
  } | null>(null)

  const amountNum = parseFloat(amount) || 0
  const isCapital = category === 'asset_purchase'

  useEffect(() => {
    if (!includesVat || amountNum <= 0 || isCapital) {
      setVatPreview(null)
      return
    }
    const timeout = setTimeout(() => {
      previewExpenseVat(amountNum)
        .then(setVatPreview)
        .catch(() => setVatPreview(null))
    }, 300)
    return () => clearTimeout(timeout)
  }, [includesVat, amountNum, isCapital])

  // Reset capital acknowledgment when category changes
  useEffect(() => {
    if (!isCapital) setCapitalAcknowledged(false)
  }, [isCapital])

  // ─── Validation ───────────────────────────────────────────────────────────
  const selectedOption = PAYMENT_OPTIONS.find((o) => o.value === paymentMethod)
  const canSubmit =
    category &&
    amountNum > 0 &&
    description.trim().length >= 3 &&
    (!selectedOption?.requiresRef ||
      (paymentMethod.startsWith('momo_') ? momoReference.trim() : bankReference.trim())) &&
    (!isCapital || capitalAcknowledged)

  // ─── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = () => {
    setError(null)
    setFieldErrors({})
    setSuccess(null)

    startTransition(async () => {
      try {
        const input: CreateExpenseInput = {
          expenseDate,
          category,
          amount: amountNum,
          paymentMethod,
          description: description.trim(),
          includesVat: includesVat && !isCapital,
          isCapitalExpense: isCapital,
          momoReference: momoReference.trim() || undefined,
          bankReference: bankReference.trim() || undefined,
          notes: notes.trim() || undefined,
          isRecurring: isRecurring && !isCapital,
          recurrenceFrequency: isRecurring && !isCapital ? recurrenceFrequency : undefined,
        }

        const result = await createExpense(input)

        if (result.success) {
          const catLabel =
            EXPENSE_CATEGORIES.find((c) => c.key === category)?.label ?? category

          setSuccess(
            `Expense recorded. GHS ${formatGHS(amountNum)} ${catLabel} on ${expenseDate}.`,
          )

          // Reset form
          setCategory('')
          setAmount('')
          setDescription('')
          setPaymentMethod('cash')
          setMomoReference('')
          setBankReference('')
          setIncludesVat(false)
          setNotes('')
          setCapitalAcknowledged(false)
          setIsRecurring(false)
          setRecurrenceFrequency('monthly')
          setReceiptPreview(null)
          setReceiptFile(null)
          setExpenseDate(todayISO())
        } else {
          setError(result.error)
          if (result.fieldErrors) setFieldErrors(result.fieldErrors)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred')
      }
    })
  }

  // ─── Render ───────────────────────────────────────────────────────────────
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
        <h1 className="text-xl font-semibold text-gray-900">Record Expense</h1>
      </div>

      {/* Cashier info */}
      {userRole === 'cashier' && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          This expense will be submitted for approval by a manager or owner.
        </div>
      )}

      {/* Success message */}
      {success && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          {success}
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {/* Date */}
        <div>
          <label className="text-sm font-medium text-gray-700">Expense Date</label>
          <input
            type="date"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base text-gray-900 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
          />
          {fieldErrors.expenseDate && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.expenseDate}</p>
          )}
        </div>

        {/* Category grid */}
        <div>
          <label className="text-sm font-medium text-gray-700">Category</label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {EXPENSE_CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                type="button"
                onClick={() => setCategory(cat.key)}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  category === cat.key
                    ? 'border-green-600 bg-green-50 ring-2 ring-green-100'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <p className="text-sm font-medium text-gray-900">{cat.label}</p>
              </button>
            ))}
          </div>
          {fieldErrors.category && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.category}</p>
          )}
        </div>

        {/* Capital asset info */}
        {isCapital && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-800">
              Asset purchases are recorded as Fixed Assets on your Balance Sheet, not as expenses.
              This affects your Profit & Loss report.
            </p>
            <label className="mt-3 flex items-center gap-2">
              <input
                type="checkbox"
                checked={capitalAcknowledged}
                onChange={(e) => setCapitalAcknowledged(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <span className="text-sm text-amber-700">I understand</span>
            </label>
          </div>
        )}

        {/* Amount */}
        <div>
          <label className="text-sm font-medium text-gray-700">Amount (GHS)</label>
          <input
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-3 text-lg font-semibold text-gray-900 placeholder-gray-300 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
          />
          {fieldErrors.amount && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.amount}</p>
          )}
        </div>

        {/* VAT toggle */}
        {vatRegistered && !isCapital && (
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">This purchase includes VAT</p>
                <p className="text-xs text-gray-400">Reverse-calculate input VAT</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={includesVat}
                onClick={() => setIncludesVat(!includesVat)}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  includesVat ? 'bg-green-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    includesVat ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* VAT breakdown */}
            {includesVat && vatPreview && amountNum > 0 && (
              <div className="mt-3 flex gap-4 rounded-lg bg-gray-50 p-2 text-xs text-gray-600">
                <span>Net: GHS {formatGHS(vatPreview.netAmount)}</span>
                <span>VAT: GHS {formatGHS(vatPreview.vatAmount)}</span>
                <span>Total: GHS {formatGHS(amountNum)}</span>
              </div>
            )}
          </div>
        )}

        {/* Payment method */}
        <div>
          <label className="text-sm font-medium text-gray-700">Payment Method</label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {PAYMENT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPaymentMethod(opt.value)}
                className={`rounded-xl border p-3 text-center transition-colors ${
                  paymentMethod === opt.value
                    ? 'border-green-600 bg-green-50 ring-2 ring-green-100'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <p className="text-sm font-medium text-gray-900">{opt.label}</p>
              </button>
            ))}
          </div>
          {fieldErrors.paymentMethod && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.paymentMethod}</p>
          )}
        </div>

        {/* MoMo reference */}
        {paymentMethod.startsWith('momo_') && (
          <div>
            <label className="text-sm font-medium text-gray-700">
              MoMo Reference <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={momoReference}
              onChange={(e) => setMomoReference(e.target.value)}
              placeholder="Transaction reference"
              className={`mt-1 w-full rounded-lg border px-3 py-2.5 text-base text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 ${
                fieldErrors.momoReference
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
                  : 'border-gray-300 focus:border-green-600 focus:ring-green-100'
              }`}
            />
            {fieldErrors.momoReference && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.momoReference}</p>
            )}
          </div>
        )}

        {/* Bank reference */}
        {paymentMethod === 'bank' && (
          <div>
            <label className="text-sm font-medium text-gray-700">
              Bank Reference <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={bankReference}
              onChange={(e) => setBankReference(e.target.value)}
              placeholder="Transfer reference"
              className={`mt-1 w-full rounded-lg border px-3 py-2.5 text-base text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 ${
                fieldErrors.bankReference
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
                  : 'border-gray-300 focus:border-green-600 focus:ring-green-100'
              }`}
            />
            {fieldErrors.bankReference && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.bankReference}</p>
            )}
          </div>
        )}

        {/* Description */}
        <div>
          <label className="text-sm font-medium text-gray-700">
            Description <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Fuel for delivery van, September rent"
            className={`mt-1 w-full rounded-lg border px-3 py-2.5 text-base text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 ${
              fieldErrors.description
                ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
                : 'border-gray-300 focus:border-green-600 focus:ring-green-100'
            }`}
          />
          {fieldErrors.description && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.description}</p>
          )}
        </div>

        {/* Receipt capture */}
        <div>
          <label className="text-sm font-medium text-gray-700">Receipt (optional)</label>
          {receiptPreview ? (
            <div className="mt-2 flex items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={receiptPreview}
                alt="Receipt preview"
                className="h-[100px] w-[120px] rounded-lg border border-gray-200 object-cover"
              />
              <button
                type="button"
                onClick={() => {
                  setReceiptPreview(null)
                  setReceiptFile(null)
                }}
                className="text-sm text-red-600 hover:text-red-800"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="mt-2 flex gap-3">
              <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-4 text-sm font-medium text-gray-500 transition-colors hover:border-green-400 hover:text-green-700">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                </svg>
                Take Photo
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    e.target.value = ''
                    setReceiptFile(file)
                    setReceiptPreview(URL.createObjectURL(file))
                  }}
                />
              </label>
              <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-4 text-sm font-medium text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-700">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                </svg>
                Gallery
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    e.target.value = ''
                    setReceiptFile(file)
                    setReceiptPreview(URL.createObjectURL(file))
                  }}
                />
              </label>
            </div>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="text-sm font-medium text-gray-700">Notes (optional)</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base text-gray-900 placeholder-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
            placeholder="Any additional notes"
          />
        </div>

        {/* Recurring expense toggle */}
        {!isCapital && (
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">Recurring expense?</p>
                <p className="text-xs text-gray-400">Auto-posts on schedule</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isRecurring}
                onClick={() => setIsRecurring(!isRecurring)}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  isRecurring ? 'bg-green-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    isRecurring ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {isRecurring && (
              <div className="mt-3 flex gap-2">
                {(['weekly', 'biweekly', 'monthly'] as const).map((freq) => (
                  <button
                    key={freq}
                    type="button"
                    onClick={() => setRecurrenceFrequency(freq)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      recurrenceFrequency === freq
                        ? 'border-green-600 bg-green-50 text-green-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {freq === 'biweekly' ? 'Bi-weekly' : freq.charAt(0).toUpperCase() + freq.slice(1)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Submit */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending || !canSubmit}
          className="w-full rounded-lg bg-green-700 px-4 py-[13px] text-base font-semibold text-white hover:bg-green-800 active:bg-green-900 disabled:opacity-60"
          style={{ minHeight: 52 }}
        >
          {isPending
            ? 'Saving...'
            : userRole === 'cashier'
              ? 'Submit for Approval'
              : 'Record Expense'}
        </button>
      </div>
    </>
  )
}
