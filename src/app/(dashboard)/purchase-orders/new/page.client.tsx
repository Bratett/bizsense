'use client'

import { useState, useTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  createPurchaseOrder,
  markPoSent,
  type CreatePoInput,
} from '@/actions/purchaseOrders'
import { recordFxRate } from '@/actions/fx'
import type { SupplierListItem } from '@/actions/suppliers'
import { generatePoNumber } from '@/lib/poNumber'

// ─── Types ───────────────────────────────────────────────────────────────────

type LineItem = {
  key: number
  description: string
  quantity: string
  unitCost: string
}

const STEPS = ['Supplier', 'Items', 'Review'] as const

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseNum(s: string): number {
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

function formatGHS(amount: number): string {
  return `GHS ${amount.toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function NewPurchaseOrderForm({
  suppliers,
  latestUsdRate,
}: {
  suppliers: SupplierListItem[]
  latestUsdRate: number | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // ─── Step state ─────────────────────────────────────────────────────────────
  const [currentStep, setCurrentStep] = useState(0)

  // ─── Step 1: Supplier & Dates ────────────────────────────────────────────────
  const [supplierId, setSupplierId] = useState('')
  const [supplierSearch, setSupplierSearch] = useState('')
  const [orderDate, setOrderDate] = useState(todayISO())
  const [expectedDate, setExpectedDate] = useState('')
  const [currency, setCurrency] = useState<'GHS' | 'USD'>('GHS')
  const [fxRate, setFxRate] = useState(latestUsdRate ? latestUsdRate.toFixed(4) : '')
  const [fxRateConfirmed, setFxRateConfirmed] = useState(false)
  const [notes, setNotes] = useState('')

  // ─── Step 2: Line items ──────────────────────────────────────────────────────
  const [lineKeyCounter, setLineKeyCounter] = useState(1)
  const [lines, setLines] = useState<LineItem[]>([
    { key: 0, description: '', quantity: '1', unitCost: '' },
  ])

  // ─── Computed ────────────────────────────────────────────────────────────────
  const fxRateNum = parseNum(fxRate)
  const selectedSupplier = suppliers.find((s) => s.id === supplierId)

  const computedLines = lines.map((l) => {
    const qty = parseNum(l.quantity)
    const cost = parseNum(l.unitCost)
    const costGHS = currency === 'USD' ? cost * (fxRateNum || 1) : cost
    return { ...l, lineTotal: Math.round(qty * costGHS * 100) / 100 }
  })

  const total = computedLines.reduce((s, l) => s + l.lineTotal, 0)

  const fxDeviation =
    latestUsdRate && fxRateNum > 0
      ? Math.abs(fxRateNum - latestUsdRate) / latestUsdRate
      : 0
  const showFxWarning = currency === 'USD' && fxDeviation > 0.2

  // ─── Line handlers ───────────────────────────────────────────────────────────
  const addLine = useCallback(() => {
    setLines((prev) => [
      ...prev,
      { key: lineKeyCounter, description: '', quantity: '1', unitCost: '' },
    ])
    setLineKeyCounter((c) => c + 1)
  }, [lineKeyCounter])

  const removeLine = useCallback((key: number) => {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev))
  }, [])

  const updateLine = useCallback((key: number, field: keyof LineItem, value: string) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, [field]: value } : l)))
  }, [])

  // ─── Step validation ─────────────────────────────────────────────────────────
  function validateStep1(): boolean {
    const errs: Record<string, string> = {}
    if (!supplierId) errs['supplierId'] = 'Please select a supplier.'
    if (!orderDate) errs['orderDate'] = 'Order date is required.'
    if (currency === 'USD' && !fxRate) errs['fxRate'] = 'Exchange rate is required for USD orders.'
    if (currency === 'USD' && fxRateNum <= 0) errs['fxRate'] = 'Exchange rate must be greater than 0.'
    if (currency === 'USD' && showFxWarning && !fxRateConfirmed) {
      errs['fxRate'] = 'Rate deviates >20% from last recorded rate. Tick the confirmation box to proceed.'
    }
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  function validateStep2(): boolean {
    const errs: Record<string, string> = {}
    lines.forEach((l, i) => {
      if (!l.description.trim()) errs[`line_${i}_description`] = 'Required.'
      if (parseNum(l.quantity) <= 0) errs[`line_${i}_quantity`] = 'Must be > 0.'
    })
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  // ─── Submit ──────────────────────────────────────────────────────────────────
  async function handleSubmit(sendToSupplier: boolean) {
    setError(null)
    setFieldErrors({})

    const poNumber = await generatePoNumber()

    const input: CreatePoInput = {
      supplierId,
      orderDate,
      expectedDate: expectedDate || undefined,
      currency,
      fxRate: currency === 'USD' ? fxRateNum : undefined,
      poNumber,
      notes: notes || undefined,
      lines: lines.map((l) => ({
        description: l.description,
        quantity: parseNum(l.quantity),
        unitCost: parseNum(l.unitCost),
      })),
    }

    startTransition(async () => {
      const result = await createPurchaseOrder(input)

      if (!result.success) {
        setError(result.error)
        setFieldErrors(result.fieldErrors ?? {})
        return
      }

      // Record FX rate for future reference
      if (currency === 'USD' && fxRateNum > 0) {
        recordFxRate({ fromCurrency: 'USD', rate: fxRateNum, rateDate: orderDate }).catch(() => {})
      }

      if (sendToSupplier) {
        await markPoSent(result.poId)

        if (selectedSupplier?.phone) {
          const lineText = lines
            .map((l, i) => `${i + 1}. ${l.description} x${l.quantity} @ ${currency} ${l.unitCost}`)
            .join('\n')
          const totalText = currency === 'USD'
            ? `USD ${lines.reduce((s, l) => s + parseNum(l.quantity) * parseNum(l.unitCost), 0).toFixed(2)} (GHS ${total.toFixed(2)} at rate ${fxRateNum})`
            : `GHS ${total.toFixed(2)}`
          const expectedText = expectedDate ? `\nExpected by: ${expectedDate}` : ''
          const msg = encodeURIComponent(
            `Hi ${selectedSupplier.name}, please find our Purchase Order ${poNumber} below:\n\n${lineText}\n\nTotal: ${totalText}${expectedText}`,
          )
          window.open(`https://wa.me/${selectedSupplier.phone.replace(/\D/g, '')}?text=${msg}`, '_blank')
        }
      }

      router.push(`/purchase-orders/${result.poId}`)
    })
  }

  // ─── Supplier filter ─────────────────────────────────────────────────────────
  const filteredSuppliers = suppliers.filter((s) =>
    !supplierSearch || s.name.toLowerCase().includes(supplierSearch.toLowerCase()),
  )

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Back link */}
      <div className="mb-4 flex items-center gap-2">
        <Link
          href="/purchase-orders"
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-xl font-semibold text-gray-900">New Purchase Order</h1>
      </div>

      {/* Step indicators */}
      <div className="mb-6 flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                i === currentStep
                  ? 'bg-green-700 text-white'
                  : i < currentStep
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-400'
              }`}
            >
              {i + 1}
            </div>
            <span
              className={`text-sm ${
                i === currentStep ? 'font-medium text-gray-900' : 'text-gray-400'
              }`}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && <span className="text-gray-300">/</span>}
          </div>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* ─── Step 1: Supplier & Dates ─────────────────────────────────────────── */}
      {currentStep === 0 && (
        <div className="space-y-4">
          {/* Supplier search */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Supplier</label>
            <input
              type="search"
              placeholder="Search suppliers..."
              value={supplierSearch}
              onChange={(e) => setSupplierSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base text-gray-900 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
            />
            {fieldErrors['supplierId'] && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors['supplierId']}</p>
            )}
            {filteredSuppliers.length > 0 && (
              <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-sm">
                {filteredSuppliers.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setSupplierId(s.id)
                      setSupplierSearch(s.name)
                    }}
                    className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-gray-50 ${
                      supplierId === s.id ? 'bg-green-50 text-green-700' : 'text-gray-900'
                    }`}
                  >
                    <span>{s.name}</span>
                    {s.phone && <span className="text-xs text-gray-400">{s.phone}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Order date */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Order Date</label>
            <input
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base text-gray-900 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
            />
            {fieldErrors['orderDate'] && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors['orderDate']}</p>
            )}
          </div>

          {/* Expected date */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Expected Delivery Date <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input
              type="date"
              value={expectedDate}
              onChange={(e) => setExpectedDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base text-gray-900 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
            />
          </div>

          {/* Currency */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Currency</label>
            <div className="flex gap-2">
              {(['GHS', 'USD'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCurrency(c)}
                  className={`flex-1 rounded-lg border py-3 text-sm font-medium transition-colors ${
                    currency === c
                      ? 'border-green-600 bg-green-50 text-green-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* FX rate (USD only) */}
          {currency === 'USD' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Exchange Rate (USD → GHS)
              </label>
              <input
                type="number"
                min="0"
                step="0.0001"
                placeholder="e.g. 15.40"
                value={fxRate}
                onChange={(e) => {
                  setFxRate(e.target.value)
                  setFxRateConfirmed(false)
                }}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base text-gray-900 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
              />
              {fieldErrors['fxRate'] && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors['fxRate']}</p>
              )}
              {showFxWarning && (
                <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  <p>
                    This rate deviates {(fxDeviation * 100).toFixed(1)}% from the last recorded
                    rate ({latestUsdRate?.toFixed(4)}).
                  </p>
                  <label className="mt-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={fxRateConfirmed}
                      onChange={(e) => setFxRateConfirmed(e.target.checked)}
                      className="rounded"
                    />
                    <span>I confirm this rate is correct</span>
                  </label>
                </div>
              )}
              {fxRateNum > 0 && !showFxWarning && (
                <p className="mt-1 text-xs text-gray-500">
                  USD 1 = GHS {fxRateNum.toFixed(4)}
                </p>
              )}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Notes <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any special instructions..."
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base text-gray-900 placeholder-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
            />
          </div>

          <button
            type="button"
            onClick={() => validateStep1() && setCurrentStep(1)}
            className="w-full rounded-lg bg-green-700 py-3 text-sm font-semibold text-white hover:bg-green-800"
          >
            Next: Line Items
          </button>
        </div>
      )}

      {/* ─── Step 2: Line Items ───────────────────────────────────────────────── */}
      {currentStep === 1 && (
        <div className="space-y-4">
          {lines.map((line, idx) => (
            <div
              key={line.key}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Item {idx + 1}</span>
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLine(line.key)}
                    className="rounded p-1 text-gray-400 hover:text-red-500"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              <div className="space-y-2">
                <div>
                  <input
                    type="text"
                    placeholder="Description"
                    value={line.description}
                    onChange={(e) => updateLine(line.key, 'description', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-100"
                  />
                  {fieldErrors[`line_${idx}_description`] && (
                    <p className="mt-0.5 text-xs text-red-600">{fieldErrors[`line_${idx}_description`]}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="Qty"
                      value={line.quantity}
                      onChange={(e) => updateLine(line.key, 'quantity', e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-100"
                    />
                    {fieldErrors[`line_${idx}_quantity`] && (
                      <p className="mt-0.5 text-xs text-red-600">{fieldErrors[`line_${idx}_quantity`]}</p>
                    )}
                  </div>
                  <div className="flex-1">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder={`Unit Cost (${currency})`}
                      value={line.unitCost}
                      onChange={(e) => updateLine(line.key, 'unitCost', e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-100"
                    />
                  </div>
                </div>
                <div className="text-right text-sm text-gray-500">
                  Line total:{' '}
                  <span className="font-medium text-gray-900">
                    {formatGHS(computedLines[idx]?.lineTotal ?? 0)}
                  </span>
                </div>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addLine}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 py-3 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Item
          </button>

          {/* Running total */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Total</span>
              <span className="text-base font-semibold text-gray-900">{formatGHS(total)}</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setCurrentStep(0)}
              className="flex-1 rounded-lg border border-gray-300 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => validateStep2() && setCurrentStep(2)}
              className="flex-1 rounded-lg bg-green-700 py-3 text-sm font-semibold text-white hover:bg-green-800"
            >
              Review
            </button>
          </div>
        </div>
      )}

      {/* ─── Step 3: Review ───────────────────────────────────────────────────── */}
      {currentStep === 2 && (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Summary</h2>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Supplier</dt>
                <dd className="font-medium text-gray-900">{selectedSupplier?.name ?? '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Order Date</dt>
                <dd className="text-gray-900">{orderDate}</dd>
              </div>
              {expectedDate && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Expected</dt>
                  <dd className="text-gray-900">{expectedDate}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-gray-500">Currency</dt>
                <dd className="text-gray-900">{currency}</dd>
              </div>
              {currency === 'USD' && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">FX Rate</dt>
                  <dd className="text-gray-900">USD 1 = GHS {fxRateNum.toFixed(4)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-gray-500">Items</dt>
                <dd className="text-gray-900">{lines.length} line{lines.length !== 1 ? 's' : ''}</dd>
              </div>
              <div className="flex justify-between border-t border-gray-100 pt-2">
                <dt className="font-medium text-gray-900">Total</dt>
                <dd className="font-semibold text-gray-900">{formatGHS(total)}</dd>
              </div>
            </dl>
          </div>

          {/* Line summary */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold text-gray-900">Line Items</h2>
            <div className="space-y-1">
              {lines.map((l, i) => (
                <div key={l.key} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 truncate">{l.description || `Item ${i + 1}`}</span>
                  <span className="ml-2 flex-shrink-0 text-gray-500">
                    {l.quantity} × {currency} {l.unitCost || '0'} ={' '}
                    <span className="font-medium text-gray-900">
                      {formatGHS(computedLines[i]?.lineTotal ?? 0)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="flex-1 rounded-lg border border-gray-300 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Back
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleSubmit(false)}
              className="flex-1 rounded-lg border border-green-700 py-3 text-sm font-medium text-green-700 hover:bg-green-50 disabled:opacity-50"
            >
              Save as Draft
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleSubmit(true)}
              className="flex-1 rounded-lg bg-green-700 py-3 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50"
            >
              {selectedSupplier?.phone ? 'Send via WhatsApp' : 'Send'}
            </button>
          </div>
          {isPending && (
            <p className="text-center text-sm text-gray-500">Saving...</p>
          )}
        </div>
      )}
    </div>
  )
}
