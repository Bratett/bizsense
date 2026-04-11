'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createGrn, confirmGrn } from '@/actions/grn'
import { generateGrnNumber } from '@/lib/grnNumber'
import type { SupplierListItem } from '@/actions/suppliers'
import type { ProductListItem } from '@/actions/products'

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
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <Link href="/grn" className="text-sm text-gray-500 hover:text-gray-700">
          ← Goods Received
        </Link>
        <h1 className="mt-4 text-xl font-semibold text-gray-900">Record Delivery (Walk-in)</h1>
        <p className="mt-1 text-sm text-gray-500">
          No purchase order needed — add the products you received directly.
        </p>

        <div className="mt-6 space-y-4">
          {/* Supplier */}
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="text-sm font-medium text-gray-700">Supplier</h2>
            <input
              type="text"
              placeholder="Search supplier…"
              value={supplierSearch}
              onChange={(e) => setSupplierSearch(e.target.value)}
              className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {supplierSearch && (
              <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-sm">
                {filteredSuppliers.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-gray-400">No suppliers found.</p>
                ) : (
                  filteredSuppliers.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setSupplierId(s.id)
                        setSupplierSearch(s.name)
                      }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                    >
                      {s.name}
                    </button>
                  ))
                )}
              </div>
            )}
            {selectedSupplier && !supplierSearch.includes(selectedSupplier.name) ? null : (
              <p className="mt-1 text-xs text-gray-400">
                {selectedSupplier ? `Selected: ${selectedSupplier.name}` : ''}
              </p>
            )}
          </div>

          {/* Date */}
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <label className="block text-sm font-medium text-gray-700">
              Date Received
            </label>
            <input
              type="date"
              value={receivedDate}
              max={todayISO()}
              onChange={(e) => setReceivedDate(e.target.value)}
              className="mt-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Line items */}
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="text-sm font-medium text-gray-700">Items Received</h2>
            <div className="mt-3 space-y-3">
              {lines.map((line) => (
                <div key={line.key} className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <select
                      value={line.productId}
                      onChange={(e) => updateLine(line.key, 'productId', e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select product…</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}{p.sku ? ` (${p.sku})` : ''}
                        </option>
                      ))}
                    </select>
                    {fieldErrors[`line_${lines.indexOf(line)}_productId`] && (
                      <p className="mt-0.5 text-xs text-red-600">
                        {fieldErrors[`line_${lines.indexOf(line)}_productId`]}
                      </p>
                    )}
                  </div>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="Qty"
                    value={line.quantityReceived}
                    onChange={(e) => updateLine(line.key, 'quantityReceived', e.target.value)}
                    className="w-20 rounded-lg border border-gray-200 px-2 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Cost"
                    value={line.unitCost}
                    onChange={(e) => updateLine(line.key, 'unitCost', e.target.value)}
                    className="w-28 rounded-lg border border-gray-200 px-2 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLine(line.key)}
                      className="mt-1 text-gray-400 hover:text-red-500"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addLine}
              className="mt-3 text-sm text-blue-600 hover:text-blue-700"
            >
              + Add item
            </button>

            {/* Total */}
            <div className="mt-4 border-t border-gray-100 pt-3 text-right">
              <span className="text-sm font-semibold text-gray-900">
                Total: {formatGHS(totalCost)}
              </span>
            </div>
          </div>

          {/* Payment type */}
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="text-sm font-medium text-gray-700">Payment</h2>
            <div className="mt-2 flex gap-3">
              <button
                type="button"
                onClick={() => setPaymentType('credit')}
                className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                  paymentType === 'credit'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                On Credit — create payable
              </button>
              <button
                type="button"
                onClick={() => setPaymentType('cash')}
                className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                  paymentType === 'cash'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                Paid now
              </button>
            </div>
            {paymentType === 'cash' && (
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Notes */}
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <label className="block text-sm font-medium text-gray-700">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
          )}

          {/* Confirm dialog */}
          {confirmMode && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-medium text-amber-800">Confirm Receipt</p>
              <p className="mt-1 text-sm text-amber-700">
                Confirming will add inventory and{' '}
                {paymentType === 'credit'
                  ? `create a payable of ${formatGHS(totalCost)} to ${selectedSupplier?.name ?? 'supplier'}`
                  : `record a payment of ${formatGHS(totalCost)}`}
                .
              </p>
              <div className="mt-3 flex gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmMode(false)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleSubmit(true)}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {isPending ? 'Confirming…' : 'Yes, Confirm Receipt'}
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          {!confirmMode && (
            <div className="flex gap-3">
              <button
                type="button"
                disabled={!canSubmit || isPending}
                onClick={() => handleSubmit(false)}
                className="flex-1 rounded-lg border border-gray-200 bg-white py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {isPending ? 'Saving…' : 'Save as Draft'}
              </button>
              <button
                type="button"
                disabled={!canSubmit || isPending}
                onClick={() => setConfirmMode(true)}
                className="flex-1 rounded-lg bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Confirm Receipt
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
