'use client'

import { useState, useTransition, useCallback, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  createOrder,
  previewOrderTax,
  type PaymentMethod,
  type OrderLineInput,
  type CreateOrderInput,
} from '@/actions/orders'
import { getLatestFxRate, recordFxRate } from '@/actions/fx'
import type { CustomerListItem } from '@/actions/customers'
import { generateOrderNumber } from '@/lib/orderNumber'
import type { TaxCalculationResult } from '@/lib/tax'

// ─── Types ───────────────────────────────────────────────────────────────────

type LineItem = {
  key: number
  description: string
  quantity: string
  unitPrice: string
  unitPriceCurrency: 'GHS' | 'USD'
  discountAmount: string
}

type PaymentOption = {
  value: PaymentMethod
  label: string
  icon: string
  requiresRef: boolean
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PAYMENT_OPTIONS: PaymentOption[] = [
  { value: 'cash', label: 'Cash', icon: '\u{1F4B5}', requiresRef: false },
  { value: 'momo_mtn', label: 'MTN MoMo', icon: '\u{1F4F1}', requiresRef: true },
  { value: 'momo_telecel', label: 'Telecel', icon: '\u{1F4F1}', requiresRef: true },
  { value: 'momo_airtel', label: 'AirtelTigo', icon: '\u{1F4F1}', requiresRef: true },
  { value: 'bank', label: 'Bank', icon: '\u{1F3E6}', requiresRef: true },
]

const STEPS = ['Customer', 'Items', 'Payment'] as const
type Step = (typeof STEPS)[number]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseNum(s: string): number {
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

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

export default function NewOrderForm({
  customers,
  vatRegistered,
}: {
  customers: CustomerListItem[]
  vatRegistered: boolean
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedCustomerId = searchParams.get('customerId')

  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // ─── Step state ────────────────────────────────────────────────────────────
  const [currentStep, setCurrentStep] = useState<number>(0)

  // ─── Customer state ────────────────────────────────────────────────────────
  const [customerId, setCustomerId] = useState<string | undefined>(
    preselectedCustomerId ?? undefined,
  )
  const [customerSearch, setCustomerSearch] = useState('')

  // ─── Line items state ──────────────────────────────────────────────────────
  const [lineKeyCounter, setLineKeyCounter] = useState(1)
  const [lines, setLines] = useState<LineItem[]>([
    {
      key: 0,
      description: '',
      quantity: '1',
      unitPrice: '',
      unitPriceCurrency: 'GHS',
      discountAmount: '0',
    },
  ])

  // ─── Order-level state ─────────────────────────────────────────────────────
  const [orderDate, setOrderDate] = useState(todayISO())
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage')
  const [discountValue, setDiscountValue] = useState('')
  const [applyVat, setApplyVat] = useState(vatRegistered)
  const [notes, setNotes] = useState('')
  const [fxRate, setFxRate] = useState('')

  // ─── FX state ───────────────────────────────────────────────────────────────
  const [lastStoredRate, setLastStoredRate] = useState<number | null>(null)
  const [fxRateConfirmed, setFxRateConfirmed] = useState(false)
  const [fxRateFetched, setFxRateFetched] = useState(false)

  // ─── Payment state ─────────────────────────────────────────────────────────
  type PaymentMode = 'paid' | 'unpaid' | 'partial'
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('paid')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [amountPaidNow, setAmountPaidNow] = useState('')
  const [momoReference, setMomoReference] = useState('')
  const [bankReference, setBankReference] = useState('')
  const [creditWarning, setCreditWarning] = useState<string | null>(null)

  // ─── Tax preview ───────────────────────────────────────────────────────────
  const [taxPreview, setTaxPreview] = useState<TaxCalculationResult | null>(null)

  // ─── Computed values ───────────────────────────────────────────────────────
  const hasUsdLine = lines.some((l) => l.unitPriceCurrency === 'USD')
  const fxRateNum = parseNum(fxRate)

  const computedLines = lines.map((l) => {
    const qty = parseNum(l.quantity)
    const price = parseNum(l.unitPrice)
    const priceGhs = l.unitPriceCurrency === 'USD' ? price * (fxRateNum || 1) : price
    const gross = Math.round(priceGhs * qty * 100) / 100
    const disc = Math.round(parseNum(l.discountAmount) * 100) / 100
    return { ...l, lineTotal: Math.max(0, gross - disc) }
  })

  const subtotal = computedLines.reduce((sum, l) => sum + l.lineTotal, 0)

  const orderDiscountNum = parseNum(discountValue)
  let orderDiscountAmount = 0
  if (discountType === 'percentage' && orderDiscountNum > 0) {
    orderDiscountAmount = Math.round(subtotal * (orderDiscountNum / 100) * 100) / 100
  } else if (discountType === 'fixed' && orderDiscountNum > 0) {
    orderDiscountAmount = Math.min(Math.round(orderDiscountNum * 100) / 100, subtotal)
  }

  const taxableAmount = Math.round((subtotal - orderDiscountAmount) * 100) / 100
  const taxAmount = taxPreview?.totalTaxAmount ?? 0
  const total = Math.round((taxableAmount + taxAmount) * 100) / 100

  // ─── FX rate pre-population ─────────────────────────────────────────────────
  useEffect(() => {
    if (!hasUsdLine || fxRateFetched) return
    setFxRateFetched(true)
    getLatestFxRate('USD')
      .then((stored) => {
        if (stored) {
          const rate = parseFloat(stored.rate)
          setLastStoredRate(rate)
          setFxRate((prev) => (prev === '' ? rate.toFixed(4) : prev))
        }
      })
      .catch(() => {})
  }, [hasUsdLine, fxRateFetched])

  // Reset fetched flag when no USD lines remain
  useEffect(() => {
    if (!hasUsdLine) {
      setFxRateFetched(false)
      setFxRateConfirmed(false)
    }
  }, [hasUsdLine])

  // ─── FX deviation check ───────────────────────────────────────────────────
  const fxDeviation =
    lastStoredRate && fxRateNum > 0 ? Math.abs(fxRateNum - lastStoredRate) / lastStoredRate : 0
  const fxDeviationWarning = fxDeviation > 0.2

  // ─── Tax preview fetch ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!applyVat || taxableAmount <= 0) {
      setTaxPreview(null)
      return
    }
    const timeout = setTimeout(() => {
      previewOrderTax(taxableAmount)
        .then(setTaxPreview)
        .catch(() => setTaxPreview(null))
    }, 300)
    return () => clearTimeout(timeout)
  }, [applyVat, taxableAmount])

  // ─── Line item handlers ────────────────────────────────────────────────────
  const addLine = useCallback(() => {
    setLines((prev) => [
      ...prev,
      {
        key: lineKeyCounter,
        description: '',
        quantity: '1',
        unitPrice: '',
        unitPriceCurrency: 'GHS' as const,
        discountAmount: '0',
      },
    ])
    setLineKeyCounter((c) => c + 1)
  }, [lineKeyCounter])

  const removeLine = useCallback((key: number) => {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev))
  }, [])

  const updateLine = useCallback((key: number, field: keyof LineItem, value: string) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, [field]: value } : l)))
  }, [])

  // ─── Customer filtering ────────────────────────────────────────────────────
  const filteredCustomers = customers.filter((c) => {
    if (!customerSearch) return true
    const term = customerSearch.toLowerCase()
    return c.name.toLowerCase().includes(term) || (c.phone && c.phone.includes(term))
  })

  const selectedCustomer = customers.find((c) => c.id === customerId)

  // ─── Step validation ───────────────────────────────────────────────────────
  const canProceedFromStep0 = true // customer is optional

  const canProceedFromStep1 = lines.every(
    (l) => l.description.trim() && parseNum(l.quantity) > 0 && parseNum(l.unitPrice) >= 0,
  )

  const selectedOption = PAYMENT_OPTIONS.find((o) => o.value === paymentMethod)
  const amountPaidNowNum = parseNum(amountPaidNow)
  const needsCustomerForCredit = paymentMode === 'unpaid' && !customerId
  const canSubmit =
    canProceedFromStep1 &&
    !needsCustomerForCredit &&
    (paymentMode === 'unpaid' ||
      !selectedOption?.requiresRef ||
      (paymentMethod.startsWith('momo_') ? momoReference.trim() : bankReference.trim())) &&
    (paymentMode !== 'partial' || (amountPaidNowNum > 0 && amountPaidNowNum < total)) &&
    (!hasUsdLine || fxRateNum > 0) &&
    (!fxDeviationWarning || fxRateConfirmed)

  // ─── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = () => {
    setError(null)
    setFieldErrors({})

    startTransition(async () => {
      try {
        const orderNumber = await generateOrderNumber()

        const orderLines: OrderLineInput[] = lines.map((l) => ({
          description: l.description.trim(),
          quantity: parseNum(l.quantity),
          unitPrice: parseNum(l.unitPrice),
          unitPriceCurrency: l.unitPriceCurrency,
          discountAmount: parseNum(l.discountAmount) || undefined,
        }))

        const input: CreateOrderInput = {
          orderNumber,
          customerId: customerId || undefined,
          orderDate,
          lines: orderLines,
          paymentStatus: paymentMode,
          paymentMethod: paymentMode !== 'unpaid' ? paymentMethod : undefined,
          amountPaid: paymentMode === 'partial' ? amountPaidNowNum : undefined,
          momoReference: momoReference.trim() || undefined,
          bankReference: bankReference.trim() || undefined,
          discountType: orderDiscountNum > 0 ? discountType : undefined,
          discountValue: orderDiscountNum > 0 ? orderDiscountNum : undefined,
          applyVat,
          fxRate: hasUsdLine ? fxRateNum : undefined,
          notes: notes.trim() || undefined,
        }

        const result = await createOrder(input)

        if (result.success) {
          if (hasUsdLine && fxRateNum > 0) {
            recordFxRate({ fromCurrency: 'USD', rate: fxRateNum, rateDate: orderDate }).catch(
              () => {},
            )
          }
          if (result.creditWarning) {
            setCreditWarning(result.creditWarning)
          }
          router.push(`/orders/${result.orderId}`)
        } else {
          setError(result.error)
          if (result.fieldErrors) setFieldErrors(result.fieldErrors)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred')
      }
    })
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/orders"
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          aria-label="Back to orders"
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
        <h1 className="text-xl font-semibold text-gray-900">New Sale</h1>
      </div>

      {/* Step indicator */}
      <div className="mb-6 flex gap-1">
        {STEPS.map((step, i) => (
          <button
            key={step}
            type="button"
            onClick={() => setCurrentStep(i)}
            className={`flex-1 rounded-full py-1.5 text-center text-xs font-medium transition-colors ${
              i === currentStep
                ? 'bg-green-700 text-white'
                : i < currentStep
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-400'
            }`}
          >
            {step}
          </button>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Step 0: Customer */}
      {currentStep === 0 && (
        <div className="space-y-4">
          {/* Walk-in option */}
          <button
            type="button"
            onClick={() => {
              setCustomerId(undefined)
              setCustomerSearch('')
            }}
            className={`w-full rounded-xl border p-4 text-left transition-colors ${
              !customerId
                ? 'border-green-600 bg-green-50 ring-2 ring-green-100'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <p className="font-medium text-gray-900">Walk-in / No customer</p>
            <p className="mt-0.5 text-sm text-gray-500">Quick sale without customer record</p>
          </button>

          {/* Customer search */}
          <input
            type="search"
            placeholder="Search customer by name or phone"
            value={customerSearch}
            onChange={(e) => setCustomerSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base text-gray-900 placeholder-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
          />

          {/* Customer list */}
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {filteredCustomers.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCustomerId(c.id)}
                className={`w-full rounded-xl border p-3 text-left transition-colors ${
                  customerId === c.id
                    ? 'border-green-600 bg-green-50 ring-2 ring-green-100'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <p className="font-medium text-gray-900">{c.name}</p>
                {c.phone && <p className="text-sm text-gray-500">{c.phone}</p>}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setCurrentStep(1)}
            className="mt-4 w-full rounded-lg bg-green-700 px-4 py-3 text-base font-semibold text-white hover:bg-green-800 active:bg-green-900"
          >
            Next
          </button>
        </div>
      )}

      {/* Step 1: Line Items */}
      {currentStep === 1 && (
        <div className="space-y-4">
          {selectedCustomer && (
            <div className="rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700">
              Customer: <span className="font-medium">{selectedCustomer.name}</span>
            </div>
          )}

          {/* Line items */}
          {lines.map((line, idx) => (
            <div
              key={line.key}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-500">Item {idx + 1}</p>
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLine(line.key)}
                    className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              <input
                type="text"
                placeholder="Description"
                value={line.description}
                onChange={(e) => updateLine(line.key, 'description', e.target.value)}
                className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base text-gray-900 placeholder-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
              />
              {fieldErrors[`line_${idx}_description`] && (
                <p className="mt-1 text-xs text-red-600">
                  {fieldErrors[`line_${idx}_description`]}
                </p>
              )}

              <div className="mt-2 flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-gray-500">Qty</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="any"
                    value={line.quantity}
                    onChange={(e) => updateLine(line.key, 'quantity', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-500">Price</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={line.unitPrice}
                    onChange={(e) => updateLine(line.key, 'unitPrice', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
                  />
                </div>
                <div className="w-20">
                  <label className="text-xs text-gray-500">Currency</label>
                  <select
                    value={line.unitPriceCurrency}
                    onChange={(e) => updateLine(line.key, 'unitPriceCurrency', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-2 py-2 text-base text-gray-900 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
                  >
                    <option value="GHS">GHS</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>

              <div className="mt-1 text-right text-sm text-gray-500">
                Line total: GHS {formatGHS(computedLines[idx]?.lineTotal ?? 0)}
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addLine}
            className="w-full rounded-lg border border-dashed border-gray-300 px-4 py-3 text-sm font-medium text-gray-600 hover:border-gray-400 hover:bg-gray-50"
          >
            + Add Item
          </button>

          {/* FX Rate (shown when any USD line exists) */}
          {hasUsdLine && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
              <label className="text-sm font-medium text-yellow-800">
                Exchange Rate &mdash; 1 USD = GHS
              </label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.0001"
                value={fxRate}
                onChange={(e) => {
                  setFxRate(e.target.value)
                  setFxRateConfirmed(false)
                }}
                placeholder="e.g. 15.4000"
                className="mt-1 w-full rounded-lg border border-yellow-300 px-3 py-2 text-base text-gray-900 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
              />
              <p className="mt-1 text-xs text-yellow-700">
                This rate will be locked permanently to this sale.
              </p>
              {fieldErrors.fxRate && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.fxRate}</p>
              )}

              {/* 20% deviation warning */}
              {fxDeviationWarning && !fxRateConfirmed && (
                <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
                  <p className="text-sm text-amber-800">
                    This rate looks unusual. Last recorded rate: GHS {lastStoredRate!.toFixed(4)}.
                    Continue?
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setFxRateConfirmed(true)}
                      className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setFxRate(lastStoredRate!.toFixed(4))}
                      className="rounded-lg border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100"
                    >
                      Use Last Rate
                    </button>
                  </div>
                </div>
              )}
              {fxDeviationWarning && fxRateConfirmed && (
                <p className="mt-1 text-xs text-amber-600">Rate deviation confirmed.</p>
              )}
            </div>
          )}

          {/* Order date */}
          <div>
            <label className="text-sm font-medium text-gray-700">Order Date</label>
            <input
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base text-gray-900 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
            />
          </div>

          {/* Order discount */}
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <label className="text-sm font-medium text-gray-700">Discount (optional)</label>
            <div className="mt-2 flex gap-2">
              <div className="flex rounded-lg border border-gray-300">
                <button
                  type="button"
                  onClick={() => setDiscountType('percentage')}
                  className={`px-3 py-1.5 text-sm ${
                    discountType === 'percentage' ? 'bg-green-700 text-white' : 'text-gray-600'
                  } rounded-l-lg`}
                >
                  %
                </button>
                <button
                  type="button"
                  onClick={() => setDiscountType('fixed')}
                  className={`px-3 py-1.5 text-sm ${
                    discountType === 'fixed' ? 'bg-green-700 text-white' : 'text-gray-600'
                  } rounded-r-lg`}
                >
                  GHS
                </button>
              </div>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder="0"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-base text-gray-900 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
              />
            </div>
          </div>

          {/* VAT toggle */}
          <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3">
            <div>
              <p className="text-sm font-medium text-gray-700">Apply VAT</p>
              <p className="text-xs text-gray-400">Ghana GRA taxes</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={applyVat}
              onClick={() => setApplyVat(!applyVat)}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                applyVat ? 'bg-green-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  applyVat ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm font-medium text-gray-700">Notes (optional)</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base text-gray-900 placeholder-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
              placeholder="Any notes about this sale"
            />
          </div>

          {/* Totals summary */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal</span>
              <span>GHS {formatGHS(subtotal)}</span>
            </div>
            {orderDiscountAmount > 0 && (
              <div className="mt-1 flex justify-between text-sm text-gray-600">
                <span>Discount</span>
                <span className="text-red-600">-GHS {formatGHS(orderDiscountAmount)}</span>
              </div>
            )}
            {taxPreview && taxPreview.totalTaxAmount > 0 && (
              <>
                {taxPreview.breakdown.map((b) => (
                  <div
                    key={b.componentCode}
                    className="mt-1 flex justify-between text-xs text-gray-500"
                  >
                    <span>
                      {b.componentName} ({(b.rate * 100).toFixed(1)}%)
                    </span>
                    <span>GHS {formatGHS(b.taxAmount)}</span>
                  </div>
                ))}
                <div className="mt-1 flex justify-between text-sm text-gray-600">
                  <span>Tax</span>
                  <span>GHS {formatGHS(taxAmount)}</span>
                </div>
              </>
            )}
            <div className="mt-2 flex justify-between border-t border-gray-200 pt-2">
              <span className="text-lg font-bold text-gray-900">TOTAL</span>
              <span className="text-lg font-bold text-gray-900">GHS {formatGHS(total)}</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setCurrentStep(0)}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-base font-medium text-gray-700 hover:bg-gray-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              disabled={!canProceedFromStep1}
              className="flex-1 rounded-lg bg-green-700 px-4 py-3 text-base font-semibold text-white hover:bg-green-800 active:bg-green-900 disabled:opacity-60"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Payment */}
      {currentStep === 2 && (
        <div className="space-y-4">
          {/* Order summary */}
          <div className="rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700">
            <p>
              {selectedCustomer ? selectedCustomer.name : 'Walk-in'} &middot; {lines.length} item
              {lines.length > 1 ? 's' : ''}
            </p>
            <p className="text-lg font-bold text-gray-900">GHS {formatGHS(total)}</p>
          </div>

          {/* Credit warning (owner/manager override) */}
          {creditWarning && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {creditWarning}
            </div>
          )}

          {/* Payment mode selector */}
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">Payment Arrangement</p>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { value: 'paid', label: 'Paid in Full' },
                  { value: 'unpaid', label: 'Credit — Invoice Later' },
                  { value: 'partial', label: 'Partial Payment' },
                ] as { value: 'paid' | 'unpaid' | 'partial'; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPaymentMode(opt.value)}
                  className={`rounded-xl border p-2.5 text-center text-xs font-medium transition-colors ${
                    paymentMode === opt.value
                      ? 'border-green-600 bg-green-50 ring-2 ring-green-100 text-green-800'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Credit mode: customer required warning */}
          {paymentMode === 'unpaid' && needsCustomerForCredit && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              Credit sales require a named customer. Go back to Step 1 to select a customer.
            </div>
          )}

          {/* Credit mode: customer info */}
          {paymentMode === 'unpaid' && !needsCustomerForCredit && selectedCustomer && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
              Invoice will be recorded to <strong>{selectedCustomer.name}</strong>. Payment expected
              later.
            </div>
          )}

          {/* Partial: amount paid now */}
          {paymentMode === 'partial' && (
            <div>
              <label className="text-sm font-medium text-gray-700">
                Amount paid now (GHS) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={amountPaidNow}
                onChange={(e) => setAmountPaidNow(e.target.value)}
                placeholder="0.00"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base text-gray-900 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
              />
              {amountPaidNowNum > 0 && total > 0 && (
                <p className="mt-1 text-xs text-gray-500">
                  GHS {formatGHS(Math.max(0, total - amountPaidNowNum))} remaining after this
                  payment
                </p>
              )}
              {fieldErrors.amountPaid && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.amountPaid}</p>
              )}
            </div>
          )}

          {/* Payment method cards (shown for 'paid' and 'partial') */}
          {paymentMode !== 'unpaid' && (
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
          )}

          {/* MoMo reference */}
          {paymentMode !== 'unpaid' && paymentMethod.startsWith('momo_') && (
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
          {paymentMode !== 'unpaid' && paymentMethod === 'bank' && (
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

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-base font-medium text-gray-700 hover:bg-gray-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isPending || !canSubmit}
              className="flex-1 rounded-lg bg-green-700 px-4 py-[13px] text-base font-semibold text-white hover:bg-green-800 active:bg-green-900 disabled:opacity-60"
              style={{ minHeight: 52 }}
            >
              {isPending ? 'Recording sale...' : 'Record Sale'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
