'use client'

import { useState, useTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createPurchaseOrder, markPoSent, type CreatePoInput } from '@/actions/purchaseOrders'
import { recordFxRate } from '@/actions/fx'
import type { SupplierListItem } from '@/actions/suppliers'
import { generatePoNumber } from '@/lib/poNumber'
import { formatGhs } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { PageHeader } from '@/components/ui/page-header'

// ─── Types ────────────���───────────────────────────────────────��──────────────

type LineItem = {
  key: number
  description: string
  quantity: string
  unitCost: string
}

const STEPS = ['Supplier', 'Items', 'Review'] as const

// ─── Helpers ─────��───────────────────────────────────────────────────────────

function parseNum(s: string): number {
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

// ─── Component ──────────���────────────────────────────────────────────────────

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

  // ─── Step state ─���───────────────────────────────────────────────────────────
  const [currentStep, setCurrentStep] = useState(0)

  // ─── Step 1: Supplier & Dates ───────────���────────────────────────────────────
  const [supplierId, setSupplierId] = useState('')
  const [supplierSearch, setSupplierSearch] = useState('')
  const [orderDate, setOrderDate] = useState(todayISO())
  const [expectedDate, setExpectedDate] = useState('')
  const [currency, setCurrency] = useState<'GHS' | 'USD'>('GHS')
  const [fxRate, setFxRate] = useState(latestUsdRate ? latestUsdRate.toFixed(4) : '')
  const [fxRateConfirmed, setFxRateConfirmed] = useState(false)
  const [notes, setNotes] = useState('')

  // ─��─ Step 2: Line items ──────────────────────────────────���───────────────────
  const [lineKeyCounter, setLineKeyCounter] = useState(1)
  const [lines, setLines] = useState<LineItem[]>([
    { key: 0, description: '', quantity: '1', unitCost: '' },
  ])

  // ─── Computed ────────���───────────────────────────────────────────────────────
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
    latestUsdRate && fxRateNum > 0 ? Math.abs(fxRateNum - latestUsdRate) / latestUsdRate : 0
  const showFxWarning = currency === 'USD' && fxDeviation > 0.2

  // ─── Line handlers ──────���────────────────────────────────────────────────────
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

  // ─── Step validation ─────────��───────────────────────────────────────────────
  function validateStep1(): boolean {
    const errs: Record<string, string> = {}
    if (!supplierId) errs['supplierId'] = 'Please select a supplier.'
    if (!orderDate) errs['orderDate'] = 'Order date is required.'
    if (currency === 'USD' && !fxRate) errs['fxRate'] = 'Exchange rate is required for USD orders.'
    if (currency === 'USD' && fxRateNum <= 0)
      errs['fxRate'] = 'Exchange rate must be greater than 0.'
    if (currency === 'USD' && showFxWarning && !fxRateConfirmed) {
      errs['fxRate'] =
        'Rate deviates >20% from last recorded rate. Tick the confirmation box to proceed.'
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

  // ─── Submit ────���────────────────────────────────────���────────────────────────
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
          const totalText =
            currency === 'USD'
              ? `USD ${lines.reduce((s, l) => s + parseNum(l.quantity) * parseNum(l.unitCost), 0).toFixed(2)} (GHS ${total.toFixed(2)} at rate ${fxRateNum})`
              : `GHS ${total.toFixed(2)}`
          const expectedText = expectedDate ? `\nExpected by: ${expectedDate}` : ''
          const msg = encodeURIComponent(
            `Hi ${selectedSupplier.name}, please find our Purchase Order ${poNumber} below:\n\n${lineText}\n\nTotal: ${totalText}${expectedText}`,
          )
          window.open(
            `https://wa.me/${selectedSupplier.phone.replace(/\D/g, '')}?text=${msg}`,
            '_blank',
          )
        }
      }

      router.push(`/purchase-orders/${result.poId}`)
    })
  }

  // ��── Supplier filter ─────���────────────────────────────���──────────────────────
  const filteredSuppliers = suppliers.filter(
    (s) => !supplierSearch || s.name.toLowerCase().includes(supplierSearch.toLowerCase()),
  )

  // ─── Render ──────────────────────────────────────────────��───────────────────
  return (
    <div>
      <PageHeader title="New Purchase Order" backHref="/purchase-orders" />

      {/* Step indicators */}
      <div className="mb-6 flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                i === currentStep
                  ? 'bg-primary text-primary-foreground'
                  : i < currentStep
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              {i + 1}
            </div>
            <span
              className={`text-sm ${
                i === currentStep ? 'font-medium text-foreground' : 'text-muted-foreground'
              }`}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && <span className="text-muted-foreground">/</span>}
          </div>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ─── Step 1: Supplier & Dates ─────���───────────────────────────────────── */}
      {currentStep === 0 && (
        <div className="space-y-4">
          {/* Supplier search */}
          <div>
            <Label className="mb-1">Supplier</Label>
            <Input
              type="search"
              placeholder="Search suppliers..."
              value={supplierSearch}
              onChange={(e) => setSupplierSearch(e.target.value)}
            />
            {fieldErrors['supplierId'] && (
              <p className="mt-1 text-xs text-destructive">{fieldErrors['supplierId']}</p>
            )}
            {filteredSuppliers.length > 0 && (
              <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-card shadow-sm">
                {filteredSuppliers.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setSupplierId(s.id)
                      setSupplierSearch(s.name)
                    }}
                    className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-muted ${
                      supplierId === s.id ? 'bg-primary/10 text-primary' : 'text-foreground'
                    }`}
                  >
                    <span>{s.name}</span>
                    {s.phone && <span className="text-xs text-muted-foreground">{s.phone}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Order date */}
          <div>
            <Label className="mb-1">Order Date</Label>
            <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
            {fieldErrors['orderDate'] && (
              <p className="mt-1 text-xs text-destructive">{fieldErrors['orderDate']}</p>
            )}
          </div>

          {/* Expected date */}
          <div>
            <Label className="mb-1">
              Expected Delivery Date{' '}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              type="date"
              value={expectedDate}
              onChange={(e) => setExpectedDate(e.target.value)}
            />
          </div>

          {/* Currency */}
          <div>
            <Label className="mb-1">Currency</Label>
            <div className="flex gap-2">
              {(['GHS', 'USD'] as const).map((c) => (
                <Button
                  key={c}
                  type="button"
                  variant={currency === c ? 'default' : 'outline'}
                  onClick={() => setCurrency(c)}
                  className="flex-1"
                  size="lg"
                >
                  {c}
                </Button>
              ))}
            </div>
          </div>

          {/* FX rate (USD only) */}
          {currency === 'USD' && (
            <div>
              <Label className="mb-1">Exchange Rate (USD → GHS)</Label>
              <Input
                type="text"
                min="0"
                step="0.0001"
                placeholder="e.g. 15.40"
                value={fxRate}
                onChange={(e) => {
                  setFxRate(e.target.value)
                  setFxRateConfirmed(false)
                }}
              />
              {fieldErrors['fxRate'] && (
                <p className="mt-1 text-xs text-destructive">{fieldErrors['fxRate']}</p>
              )}
              {showFxWarning && (
                <Alert className="mt-2">
                  <AlertDescription>
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
                  </AlertDescription>
                </Alert>
              )}
              {fxRateNum > 0 && !showFxWarning && (
                <p className="mt-1 text-xs text-muted-foreground">
                  USD 1 = GHS {fxRateNum.toFixed(4)}
                </p>
              )}
            </div>
          )}

          {/* Notes */}
          <div>
            <Label className="mb-1">
              Notes <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any special instructions..."
            />
          </div>

          <Button
            type="button"
            onClick={() => validateStep1() && setCurrentStep(1)}
            className="w-full"
            size="lg"
          >
            Next: Line Items
          </Button>
        </div>
      )}

      {/* ─── Step 2: Line Items ────��──────────────────────────────────��───────── */}
      {currentStep === 1 && (
        <div className="space-y-4">
          {lines.map((line, idx) => (
            <Card key={line.key}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Item {idx + 1}</CardTitle>
                  {lines.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => removeLine(line.key)}
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <Input
                    type="text"
                    placeholder="Description"
                    value={line.description}
                    onChange={(e) => updateLine(line.key, 'description', e.target.value)}
                  />
                  {fieldErrors[`line_${idx}_description`] && (
                    <p className="mt-0.5 text-xs text-destructive">
                      {fieldErrors[`line_${idx}_description`]}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Input
                      type="text"
                      min="0.01"
                      step="0.01"
                      placeholder="Qty"
                      value={line.quantity}
                      onChange={(e) => updateLine(line.key, 'quantity', e.target.value)}
                    />
                    {fieldErrors[`line_${idx}_quantity`] && (
                      <p className="mt-0.5 text-xs text-destructive">
                        {fieldErrors[`line_${idx}_quantity`]}
                      </p>
                    )}
                  </div>
                  <div className="flex-1">
                    <Input
                      type="text"
                      min="0"
                      step="0.01"
                      placeholder={`Unit Cost (${currency})`}
                      value={line.unitCost}
                      onChange={(e) => updateLine(line.key, 'unitCost', e.target.value)}
                    />
                  </div>
                </div>
                <div className="text-right text-sm text-muted-foreground">
                  Line total:{' '}
                  <span className="font-medium text-foreground">
                    {formatGhs(computedLines[idx]?.lineTotal ?? 0)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}

          <Button
            type="button"
            variant="outline"
            onClick={addLine}
            className="w-full border-dashed"
            size="lg"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Item
          </Button>

          {/* Running total */}
          <Card>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">Total</span>
                <span className="text-base font-semibold text-foreground">{formatGhs(total)}</span>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCurrentStep(0)}
              className="flex-1"
              size="lg"
            >
              Back
            </Button>
            <Button
              type="button"
              onClick={() => validateStep2() && setCurrentStep(2)}
              className="flex-1"
              size="lg"
            >
              Review
            </Button>
          </div>
        </div>
      )}

      {/* ─── Step 3: Review ────���─────────────────────────────────────���────────── */}
      {currentStep === 2 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Supplier</dt>
                  <dd className="font-medium text-foreground">{selectedSupplier?.name ?? '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Order Date</dt>
                  <dd className="text-foreground">{orderDate}</dd>
                </div>
                {expectedDate && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Expected</dt>
                    <dd className="text-foreground">{expectedDate}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Currency</dt>
                  <dd className="text-foreground">{currency}</dd>
                </div>
                {currency === 'USD' && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">FX Rate</dt>
                    <dd className="text-foreground">USD 1 = GHS {fxRateNum.toFixed(4)}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Items</dt>
                  <dd className="text-foreground">
                    {lines.length} line{lines.length !== 1 ? 's' : ''}
                  </dd>
                </div>
                <Separator className="my-2" />
                <div className="flex justify-between">
                  <dt className="font-medium text-foreground">Total</dt>
                  <dd className="font-semibold text-foreground">{formatGhs(total)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* Line summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Line Items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {lines.map((l, i) => (
                <div key={l.key} className="flex items-center justify-between text-sm">
                  <span className="truncate text-muted-foreground">
                    {l.description || `Item ${i + 1}`}
                  </span>
                  <span className="ml-2 flex-shrink-0 text-muted-foreground">
                    {l.quantity} × {currency} {l.unitCost || '0'} ={' '}
                    <span className="font-medium text-foreground">
                      {formatGhs(computedLines[i]?.lineTotal ?? 0)}
                    </span>
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCurrentStep(1)}
              className="flex-1"
              size="lg"
            >
              Back
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => handleSubmit(false)}
              className="flex-1"
              size="lg"
            >
              Save as Draft
            </Button>
            <Button
              type="button"
              disabled={isPending}
              onClick={() => handleSubmit(true)}
              className="flex-1"
              size="lg"
            >
              {selectedSupplier?.phone ? 'Send via WhatsApp' : 'Send'}
            </Button>
          </div>
          {isPending && <p className="text-center text-sm text-muted-foreground">Saving...</p>}
        </div>
      )}
    </div>
  )
}
