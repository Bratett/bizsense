'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { recordPaymentReceived } from '@/actions/payments'
import type { OrderDetail } from '@/actions/orders'

// ─── Constants ───────────────────────────────────────────────────────────────

const PAYMENT_OPTIONS = [
  { value: 'cash', label: 'Cash', icon: '\u{1F4B5}', requiresRef: false },
  { value: 'momo_mtn', label: 'MTN MoMo', icon: '\u{1F4F1}', requiresRef: true },
  { value: 'momo_telecel', label: 'Telecel', icon: '\u{1F4F1}', requiresRef: true },
  { value: 'momo_airtel', label: 'AirtelTigo', icon: '\u{1F4F1}', requiresRef: true },
  { value: 'bank', label: 'Bank', icon: '\u{1F3E6}', requiresRef: true },
] as const

type PaymentMethod = (typeof PAYMENT_OPTIONS)[number]['value']

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatGHS(amount: number): string {
  return amount.toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PaymentFormClient({ order }: { order: OrderDetail }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [success, setSuccess] = useState(false)

  const totalAmount = Number(order.totalAmount ?? 0)
  const alreadyPaid = Number(order.amountPaid)
  const remaining = Math.max(0, Math.round((totalAmount - alreadyPaid) * 100) / 100)

  const [amount, setAmount] = useState(remaining.toFixed(2))
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [momoReference, setMomoReference] = useState('')
  const [bankReference, setBankReference] = useState('')
  const [paymentDate, setPaymentDate] = useState(todayISO())
  const [notes, setNotes] = useState('')

  const amountNum = Math.max(0, parseFloat(amount) || 0)
  const selectedOption = PAYMENT_OPTIONS.find((o) => o.value === paymentMethod)
  const hasRef = paymentMethod.startsWith('momo_')
    ? momoReference.trim().length > 0
    : paymentMethod === 'bank'
      ? bankReference.trim().length > 0
      : true

  const canSubmit =
    amountNum > 0 &&
    amountNum <= remaining + 0.001 &&
    hasRef &&
    !isPending

  const handleSubmit = () => {
    setError(null)
    setFieldErrors({})

    startTransition(async () => {
      try {
        const result = await recordPaymentReceived({
          orderId: order.id,
          amount: amountNum,
          paymentMethod,
          paymentDate,
          momoReference: momoReference.trim() || undefined,
          bankReference: bankReference.trim() || undefined,
          notes: notes.trim() || undefined,
        })

        if (result.success) {
          setSuccess(true)
          setTimeout(() => router.push(`/orders/${order.id}`), 1200)
        } else {
          setError(result.error)
          if (result.fieldErrors) setFieldErrors(result.fieldErrors)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred')
      }
    })
  }

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          href={`/orders/${order.id}`}
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          aria-label="Back to order"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Record Payment</h1>
          <p className="text-sm text-gray-500">{order.orderNumber}</p>
        </div>
      </div>

      {/* Success banner */}
      {success && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          Payment recorded. Redirecting...
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Invoice summary */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-medium text-gray-500">Invoice Summary</p>
        {order.customer && (
          <p className="mt-1 font-medium text-gray-900">{order.customer.name}</p>
        )}
        <div className="mt-2 space-y-1 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>Invoice total</span>
            <span>GHS {formatGHS(totalAmount)}</span>
          </div>
          {alreadyPaid > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>Previously paid</span>
              <span>GHS {formatGHS(alreadyPaid)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-gray-100 pt-1">
            <span className="font-medium text-amber-700">Outstanding</span>
            <span className="text-lg font-bold text-amber-700">GHS {formatGHS(remaining)}</span>
          </div>
        </div>

        {/* FX info */}
        {order.fxRate && Number(order.fxRate) > 1 && (
          <div className="mt-2 rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-700">
            Original rate: 1 USD = GHS {Number(order.fxRate).toFixed(4)} &middot; Invoice: GHS{' '}
            {formatGHS(totalAmount)} (USD {(totalAmount / Number(order.fxRate)).toFixed(2)})
          </div>
        )}
      </div>

      <div className="mt-4 space-y-4">
        {/* Amount field */}
        <div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">
              GHS received <span className="text-red-500">*</span>
            </label>
            <button
              type="button"
              onClick={() => setAmount(remaining.toFixed(2))}
              className="text-xs font-medium text-green-700 hover:underline"
            >
              Pay in full (GHS {formatGHS(remaining)})
            </button>
          </div>
          <input
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            max={remaining}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base text-gray-900 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
          />
          {amountNum > 0 && amountNum < remaining - 0.001 && (
            <p className="mt-1 text-xs text-gray-500">
              GHS {formatGHS(remaining - amountNum)} still outstanding after this payment
            </p>
          )}
        </div>

        {/* Payment method */}
        <div>
          <p className="mb-2 text-sm font-medium text-gray-700">Payment Method</p>
          <div className="grid grid-cols-2 gap-2">
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
                <span className="text-xl">{opt.icon}</span>
                <p className="mt-1 text-sm font-medium text-gray-900">{opt.label}</p>
              </button>
            ))}
          </div>
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

        {/* Date */}
        <div>
          <label className="text-sm font-medium text-gray-700">Payment Date</label>
          <input
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base text-gray-900 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="text-sm font-medium text-gray-700">Notes (optional)</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base text-gray-900 placeholder-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
            placeholder="Payment notes"
          />
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full rounded-lg bg-green-700 px-4 py-3 text-base font-semibold text-white hover:bg-green-800 active:bg-green-900 disabled:opacity-60"
        >
          {isPending ? 'Recording...' : 'Record Payment'}
        </button>
      </div>
    </>
  )
}
