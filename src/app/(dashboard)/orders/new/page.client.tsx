'use client'

import { useState, useTransition, useCallback, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { X } from 'lucide-react'
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
import { formatGhs } from '@/lib/format'
import { cn } from '@/lib/utils'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { PageHeader } from '@/components/ui/page-header'
import { SearchInput } from '@/components/ui/search-input'
import { MoneyInput } from '@/components/ui/money-input'

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
      <PageHeader backHref="/orders" title="New Sale" />

      {/* Step indicator */}
      <div className="mb-6 flex gap-1">
        {STEPS.map((step, i) => (
          <button
            key={step}
            type="button"
            onClick={() => setCurrentStep(i)}
            className={cn(
              'flex-1 rounded-full py-1.5 text-center text-xs font-medium transition-colors',
              i === currentStep
                ? 'bg-primary text-primary-foreground'
                : i < currentStep
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted text-muted-foreground',
            )}
          >
            {step}
          </button>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
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
            className={cn(
              'w-full rounded-xl border p-4 text-left transition-colors',
              !customerId
                ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                : 'border-border bg-card hover:border-border/80',
            )}
          >
            <p className="font-medium">Walk-in / No customer</p>
            <p className="mt-0.5 text-sm text-muted-foreground">Quick sale without customer record</p>
          </button>

          {/* Customer search */}
          <SearchInput
            value={customerSearch}
            onChange={setCustomerSearch}
            placeholder="Search customer by name or phone"
            className="w-full"
          />

          {/* Customer list */}
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {filteredCustomers.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCustomerId(c.id)}
                className={cn(
                  'w-full rounded-xl border p-3 text-left transition-colors',
                  customerId === c.id
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                    : 'border-border bg-card hover:border-border/80',
                )}
              >
                <p className="font-medium">{c.name}</p>
                {c.phone && <p className="text-sm text-muted-foreground">{c.phone}</p>}
              </button>
            ))}
          </div>

          <Button
            size="lg"
            className="mt-4 w-full"
            onClick={() => setCurrentStep(1)}
          >
            Next
          </Button>
        </div>
      )}

      {/* Step 1: Line Items */}
      {currentStep === 1 && (
        <div className="space-y-4">
          {selectedCustomer && (
            <div className="rounded-lg bg-muted px-3 py-2 text-sm">
              Customer: <span className="font-medium">{selectedCustomer.name}</span>
            </div>
          )}

          {/* Line items */}
          {lines.map((line, idx) => (
            <Card key={line.key}>
              <CardContent>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">Item {idx + 1}</p>
                  {lines.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => removeLine(line.key)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                <div className="mt-2">
                  <Input
                    type="text"
                    placeholder="Description"
                    value={line.description}
                    onChange={(e) => updateLine(line.key, 'description', e.target.value)}
                    className="h-10"
                  />
                </div>
                {fieldErrors[`line_${idx}_description`] && (
                  <p className="mt-1 text-xs text-destructive">
                    {fieldErrors[`line_${idx}_description`]}
                  </p>
                )}

                <div className="mt-2 flex gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs text-muted-foreground">Qty</Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min="0.01"
                      step="any"
                      value={line.quantity}
                      onChange={(e) => updateLine(line.key, 'quantity', e.target.value)}
                      className="h-10"
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs text-muted-foreground">Price</Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={line.unitPrice}
                      onChange={(e) => updateLine(line.key, 'unitPrice', e.target.value)}
                      className="h-10"
                    />
                  </div>
                  <div className="w-20 space-y-1">
                    <Label className="text-xs text-muted-foreground">Currency</Label>
                    <select
                      value={line.unitPriceCurrency}
                      onChange={(e) => updateLine(line.key, 'unitPriceCurrency', e.target.value)}
                      className="h-10 w-full rounded-lg border border-input bg-transparent px-2 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <option value="GHS">GHS</option>
                      <option value="USD">USD</option>
                    </select>
                  </div>
                </div>

                <div className="mt-1 text-right text-sm text-muted-foreground">
                  Line total: {formatGhs(computedLines[idx]?.lineTotal ?? 0)}
                </div>
              </CardContent>
            </Card>
          ))}

          <Button
            variant="outline"
            className="w-full border-dashed"
            onClick={addLine}
          >
            + Add Item
          </Button>

          {/* FX Rate (shown when any USD line exists) */}
          {hasUsdLine && (
            <Alert className="border-yellow-200 bg-yellow-50">
              <AlertDescription>
                <Label className="text-sm font-medium text-yellow-800">
                  Exchange Rate &mdash; 1 USD = GHS
                </Label>
                <Input
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
                  className="mt-1 h-10 border-yellow-300"
                />
                <p className="mt-1 text-xs text-yellow-700">
                  This rate will be locked permanently to this sale.
                </p>
                {fieldErrors.fxRate && (
                  <p className="mt-1 text-xs text-destructive">{fieldErrors.fxRate}</p>
                )}

                {/* 20% deviation warning */}
                {fxDeviationWarning && !fxRateConfirmed && (
                  <Alert className="mt-2 border-amber-300 bg-amber-50">
                    <AlertDescription>
                      <p className="text-sm text-amber-800">
                        This rate looks unusual. Last recorded rate: GHS {lastStoredRate!.toFixed(4)}.
                        Continue?
                      </p>
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => setFxRateConfirmed(true)}
                          className="bg-amber-600 hover:bg-amber-700"
                        >
                          Confirm
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setFxRate(lastStoredRate!.toFixed(4))}
                          className="border-amber-300 text-amber-800 hover:bg-amber-100"
                        >
                          Use Last Rate
                        </Button>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
                {fxDeviationWarning && fxRateConfirmed && (
                  <p className="mt-1 text-xs text-amber-600">Rate deviation confirmed.</p>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Order date */}
          <div className="space-y-1.5">
            <Label>Order Date</Label>
            <Input
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              className="h-10"
            />
          </div>

          {/* Order discount */}
          <Card>
            <CardContent>
              <Label>Discount (optional)</Label>
              <div className="mt-2 flex gap-2">
                <div className="flex rounded-lg border border-input">
                  <button
                    type="button"
                    onClick={() => setDiscountType('percentage')}
                    className={cn(
                      'px-3 py-1.5 text-sm rounded-l-lg',
                      discountType === 'percentage'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground',
                    )}
                  >
                    %
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscountType('fixed')}
                    className={cn(
                      'px-3 py-1.5 text-sm rounded-r-lg',
                      discountType === 'fixed'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground',
                    )}
                  >
                    GHS
                  </button>
                </div>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  placeholder="0"
                  className="h-8 flex-1"
                />
              </div>
            </CardContent>
          </Card>

          {/* VAT toggle */}
          <Card>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Apply VAT</p>
                  <p className="text-xs text-muted-foreground">Ghana GRA taxes</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={applyVat}
                  onClick={() => setApplyVat(!applyVat)}
                  className={cn(
                    'relative h-6 w-11 rounded-full transition-colors',
                    applyVat ? 'bg-primary' : 'bg-muted-foreground/30',
                  )}
                >
                  <span
                    className={cn(
                      'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                      applyVat ? 'translate-x-5' : 'translate-x-0',
                    )}
                  />
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-input bg-transparent px-3 py-2.5 text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="Any notes about this sale"
            />
          </div>

          {/* Totals summary */}
          <Card>
            <CardContent>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatGhs(subtotal)}</span>
              </div>
              {orderDiscountAmount > 0 && (
                <div className="mt-1 flex justify-between text-sm">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="text-destructive">-{formatGhs(orderDiscountAmount)}</span>
                </div>
              )}
              {taxPreview && taxPreview.totalTaxAmount > 0 && (
                <>
                  {taxPreview.breakdown.map((b) => (
                    <div
                      key={b.componentCode}
                      className="mt-1 flex justify-between text-xs text-muted-foreground"
                    >
                      <span>
                        {b.componentName} ({(b.rate * 100).toFixed(1)}%)
                      </span>
                      <span>{formatGhs(b.taxAmount)}</span>
                    </div>
                  ))}
                  <div className="mt-1 flex justify-between text-sm">
                    <span className="text-muted-foreground">Tax</span>
                    <span>{formatGhs(taxAmount)}</span>
                  </div>
                </>
              )}
              <Separator className="my-2" />
              <div className="flex justify-between">
                <span className="text-lg font-bold">TOTAL</span>
                <span className="text-lg font-bold">{formatGhs(total)}</span>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button
              variant="outline"
              size="lg"
              className="flex-1"
              onClick={() => setCurrentStep(0)}
            >
              Back
            </Button>
            <Button
              size="lg"
              className="flex-1"
              onClick={() => setCurrentStep(2)}
              disabled={!canProceedFromStep1}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Payment */}
      {currentStep === 2 && (
        <div className="space-y-4">
          {/* Order summary */}
          <div className="rounded-lg bg-muted px-3 py-2 text-sm">
            <p>
              {selectedCustomer ? selectedCustomer.name : 'Walk-in'} &middot; {lines.length} item
              {lines.length > 1 ? 's' : ''}
            </p>
            <p className="text-lg font-bold">{formatGhs(total)}</p>
          </div>

          {/* Credit warning (owner/manager override) */}
          {creditWarning && (
            <Alert className="border-amber-200 bg-amber-50 text-amber-800">
              <AlertDescription>{creditWarning}</AlertDescription>
            </Alert>
          )}

          {/* Payment mode selector */}
          <div>
            <Label className="mb-2">Payment Arrangement</Label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { value: 'paid', label: 'Paid in Full' },
                  { value: 'unpaid', label: 'Credit \u2014 Invoice Later' },
                  { value: 'partial', label: 'Partial Payment' },
                ] as { value: 'paid' | 'unpaid' | 'partial'; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPaymentMode(opt.value)}
                  className={cn(
                    'rounded-xl border p-2.5 text-center text-xs font-medium transition-colors',
                    paymentMode === opt.value
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20 text-primary'
                      : 'border-border bg-card hover:border-border/80',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Credit mode: customer required warning */}
          {paymentMode === 'unpaid' && needsCustomerForCredit && (
            <Alert variant="destructive">
              <AlertDescription>
                Credit sales require a named customer. Go back to Step 1 to select a customer.
              </AlertDescription>
            </Alert>
          )}

          {/* Credit mode: customer info */}
          {paymentMode === 'unpaid' && !needsCustomerForCredit && selectedCustomer && (
            <Alert className="border-blue-200 bg-blue-50 text-blue-800">
              <AlertDescription>
                Invoice will be recorded to <strong>{selectedCustomer.name}</strong>. Payment expected
                later.
              </AlertDescription>
            </Alert>
          )}

          {/* Partial: amount paid now */}
          {paymentMode === 'partial' && (
            <MoneyInput
              label="Amount paid now"
              value={amountPaidNow}
              onChange={setAmountPaidNow}
              error={fieldErrors.amountPaid}
              placeholder="0.00"
            />
          )}
          {paymentMode === 'partial' && amountPaidNowNum > 0 && total > 0 && (
            <p className="text-xs text-muted-foreground">
              {formatGhs(Math.max(0, total - amountPaidNowNum))} remaining after this payment
            </p>
          )}

          {/* Payment method cards (shown for 'paid' and 'partial') */}
          {paymentMode !== 'unpaid' && (
            <div>
              <Label className="mb-2">Payment Method</Label>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPaymentMethod(opt.value)}
                    className={cn(
                      'rounded-xl border p-3 text-center transition-colors',
                      paymentMethod === opt.value
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                        : 'border-border bg-card hover:border-border/80',
                    )}
                  >
                    <span className="text-xl">{opt.icon}</span>
                    <p className="mt-1 text-sm font-medium">{opt.label}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* MoMo reference */}
          {paymentMode !== 'unpaid' && paymentMethod.startsWith('momo_') && (
            <div className="space-y-1.5">
              <Label>
                MoMo Reference <span className="text-destructive">*</span>
              </Label>
              <Input
                type="text"
                value={momoReference}
                onChange={(e) => setMomoReference(e.target.value)}
                placeholder="Transaction reference"
                className="h-10"
                aria-invalid={!!fieldErrors.momoReference}
              />
              {fieldErrors.momoReference && (
                <p className="text-xs text-destructive">{fieldErrors.momoReference}</p>
              )}
            </div>
          )}

          {/* Bank reference */}
          {paymentMode !== 'unpaid' && paymentMethod === 'bank' && (
            <div className="space-y-1.5">
              <Label>
                Bank Reference <span className="text-destructive">*</span>
              </Label>
              <Input
                type="text"
                value={bankReference}
                onChange={(e) => setBankReference(e.target.value)}
                placeholder="Transfer reference"
                className="h-10"
                aria-invalid={!!fieldErrors.bankReference}
              />
              {fieldErrors.bankReference && (
                <p className="text-xs text-destructive">{fieldErrors.bankReference}</p>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <Button
              variant="outline"
              size="lg"
              className="flex-1"
              onClick={() => setCurrentStep(1)}
            >
              Back
            </Button>
            <Button
              size="lg"
              className="flex-1"
              onClick={handleSubmit}
              disabled={isPending || !canSubmit}
            >
              {isPending ? 'Recording sale...' : 'Record Sale'}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
