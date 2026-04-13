'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createGrn, confirmGrn } from '@/actions/grn'
import { generateGrnNumber } from '@/lib/grnNumber'
import type { SupplierListItem } from '@/actions/suppliers'
import type { ProductListItem } from '@/actions/products'
import { formatGhs } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { PageHeader } from '@/components/ui/page-header'

// ─── Types ───────────────────────────────────────────────────────────────────

type LineItem = {
  key: number
  productId: string
  quantityReceived: string
  unitCost: string
}

type PaymentType = 'credit' | 'cash'
type PaymentMethod = 'cash' | 'momo_mtn' | 'momo_telecel' | 'momo_airtel' | 'bank'

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  momo_mtn: 'MoMo MTN',
  momo_telecel: 'MoMo Telecel',
  momo_airtel: 'MoMo AirtelTigo',
  bank: 'Bank Transfer',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseNum(s: string): number {
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function WalkInGrnForm({
  suppliers,
  products,
}: {
  suppliers: SupplierListItem[]
  products: ProductListItem[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Form state
  const [supplierId, setSupplierId] = useState('')
  const [supplierSearch, setSupplierSearch] = useState('')
  const [receivedDate, setReceivedDate] = useState(todayISO())
  const [notes, setNotes] = useState('')
  const [paymentType, setPaymentType] = useState<PaymentType>('credit')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [lineKeyCounter, setLineKeyCounter] = useState(1)
  const [lines, setLines] = useState<LineItem[]>([
    { key: 0, productId: '', quantityReceived: '1', unitCost: '' },
  ])
  const [confirmMode, setConfirmMode] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // Filtered suppliers
  const filteredSuppliers = supplierSearch
    ? suppliers.filter((s) => s.name.toLowerCase().includes(supplierSearch.toLowerCase()))
    : suppliers

  const selectedSupplier = suppliers.find((s) => s.id === supplierId)

  // Product lookup
  const productMap = Object.fromEntries(products.map((p) => [p.id, p]))

  // Total cost
  const totalCost = lines.reduce(
    (s, l) => s + parseNum(l.quantityReceived) * parseNum(l.unitCost),
    0,
  )

  function addLine() {
    setLines((prev) => [
      ...prev,
      { key: lineKeyCounter, productId: '', quantityReceived: '1', unitCost: '' },
    ])
    setLineKeyCounter((k) => k + 1)
  }

  function removeLine(key: number) {
    setLines((prev) => prev.filter((l) => l.key !== key))
  }

  function updateLine(key: number, field: keyof Omit<LineItem, 'key'>, value: string) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l
        const updated = { ...l, [field]: value }
        // Auto-fill unit cost from product's costPrice when product selected
        if (field === 'productId' && value) {
          const product = productMap[value]
          if (product?.costPrice && !l.unitCost) {
            updated.unitCost = product.costPrice
          }
        }
        return updated
      }),
    )
  }

  async function handleSubmit(shouldConfirm: boolean) {
    setError(null)
    setFieldErrors({})

    const grnNumber = await generateGrnNumber()

    startTransition(async () => {
      const createResult = await createGrn({
        supplierId,
        receivedDate,
        notes: notes.trim() || undefined,
        grnNumber,
        lines: lines.map((l) => ({
          productId: l.productId,
          quantityReceived: parseNum(l.quantityReceived),
          unitCost: parseNum(l.unitCost),
        })),
      })

      if (!createResult.success) {
        setError(createResult.error)
        if ('fieldErrors' in createResult) setFieldErrors(createResult.fieldErrors ?? {})
        return
      }

      if (shouldConfirm) {
        setConfirmMode(false)
        const confirmResult = await confirmGrn({
          grnId: createResult.grnId,
          paymentMethod: paymentType === 'cash' ? paymentMethod : undefined,
        })

        if (!confirmResult.success) {
          setError(confirmResult.error)
          // Draft was created — redirect so user can confirm manually
          router.push(`/grn/${createResult.grnId}`)
          return
        }
      }

      router.push(`/grn/${createResult.grnId}`)
    })
  }

  const canSubmit =
    !!supplierId &&
    !!receivedDate &&
    lines.length > 0 &&
    lines.every((l) => l.productId && parseNum(l.quantityReceived) > 0 && parseNum(l.unitCost) >= 0)

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Record Delivery (Walk-in)"
        subtitle="No purchase order needed -- add the products you received directly."
        backHref="/grn"
      />

      <div className="space-y-4">
        {/* Supplier */}
        <Card>
          <CardHeader>
            <CardTitle>Supplier</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              type="text"
              placeholder="Search supplier..."
              value={supplierSearch}
              onChange={(e) => setSupplierSearch(e.target.value)}
            />
            {supplierSearch && (
              <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-border bg-background shadow-sm">
                {filteredSuppliers.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-muted-foreground">No suppliers found.</p>
                ) : (
                  filteredSuppliers.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setSupplierId(s.id)
                        setSupplierSearch(s.name)
                      }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                    >
                      {s.name}
                    </button>
                  ))
                )}
              </div>
            )}
            {selectedSupplier && !supplierSearch.includes(selectedSupplier.name) ? null : (
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedSupplier ? `Selected: ${selectedSupplier.name}` : ''}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Date */}
        <Card>
          <CardContent>
            <Label>Date Received</Label>
            <Input
              type="date"
              value={receivedDate}
              max={todayISO()}
              onChange={(e) => setReceivedDate(e.target.value)}
              className="mt-1 w-auto"
            />
          </CardContent>
        </Card>

        {/* Line items */}
        <Card>
          <CardHeader>
            <CardTitle>Items Received</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {lines.map((line) => (
                <div key={line.key} className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <select
                      value={line.productId}
                      onChange={(e) => updateLine(line.key, 'productId', e.target.value)}
                      className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <option value="">Select product...</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {p.sku ? ` (${p.sku})` : ''}
                        </option>
                      ))}
                    </select>
                    {fieldErrors[`line_${lines.indexOf(line)}_productId`] && (
                      <p className="mt-0.5 text-xs text-destructive">
                        {fieldErrors[`line_${lines.indexOf(line)}_productId`]}
                      </p>
                    )}
                  </div>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="Qty"
                    value={line.quantityReceived}
                    onChange={(e) => updateLine(line.key, 'quantityReceived', e.target.value)}
                    className="w-20 text-right"
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Cost"
                    value={line.unitCost}
                    onChange={(e) => updateLine(line.key, 'unitCost', e.target.value)}
                    className="w-28 text-right"
                  />
                  {lines.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeLine(line.key)}
                      className="mt-0.5 text-muted-foreground hover:text-destructive"
                    >
                      &times;
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <Button variant="link" onClick={addLine} className="mt-3 px-0">
              + Add item
            </Button>

            {/* Total */}
            <Separator className="mt-4" />
            <div className="pt-3 text-right">
              <span className="text-sm font-semibold text-foreground">
                Total: {formatGhs(totalCost)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Payment type */}
        <Card>
          <CardHeader>
            <CardTitle>Payment</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Button
                variant={paymentType === 'credit' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setPaymentType('credit')}
              >
                On Credit -- create payable
              </Button>
              <Button
                variant={paymentType === 'cash' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setPaymentType('cash')}
              >
                Paid now
              </Button>
            </div>
            {paymentType === 'cash' && (
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="mt-3 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            )}
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardContent>
            <Label>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1"
            />
          </CardContent>
        </Card>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Confirm dialog */}
        {confirmMode && (
          <Alert>
            <AlertDescription>
              <p className="font-medium">Confirm Receipt</p>
              <p className="mt-1 text-sm">
                Confirming will add inventory and{' '}
                {paymentType === 'credit'
                  ? `create a payable of ${formatGhs(totalCost)} to ${selectedSupplier?.name ?? 'supplier'}`
                  : `record a payment of ${formatGhs(totalCost)}`}
                .
              </p>
              <div className="mt-3 flex gap-3">
                <Button variant="outline" onClick={() => setConfirmMode(false)}>
                  Cancel
                </Button>
                <Button disabled={isPending} onClick={() => handleSubmit(true)}>
                  {isPending ? 'Confirming...' : 'Yes, Confirm Receipt'}
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Actions */}
        {!confirmMode && (
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 py-3"
              disabled={!canSubmit || isPending}
              onClick={() => handleSubmit(false)}
            >
              {isPending ? 'Saving...' : 'Save as Draft'}
            </Button>
            <Button
              className="flex-1 py-3"
              disabled={!canSubmit || isPending}
              onClick={() => setConfirmMode(true)}
            >
              Confirm Receipt
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
