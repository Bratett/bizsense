'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createGrn, confirmGrn } from '@/actions/grn'
import { generateGrnNumber } from '@/lib/grnNumber'
import type { PoWithLinesAndGrns } from '@/actions/purchaseOrders'

// ─── Types ───────────────────────────────────────────────────────────────────

type ReceivingLine = {
  poLineId: string
  productId: string | null
  productDescription: string | null
  quantityOrdered: number
  quantityPreviouslyReceived: number
  quantityOutstanding: number
  quantityReceiving: string // editable
  unitCost: string // editable, pre-filled from PO
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

export default function ReceiveGoodsForm({ po }: { po: PoWithLinesAndGrns }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Pre-populate lines from PO outstanding quantities
  const [lines, setLines] = useState<ReceivingLine[]>(() =>
    po.lines
      .filter((l) => Number(l.quantityOutstanding) > 0.001)
      .map((l) => ({
        poLineId: l.id,
        productId: l.productId,
        productDescription: l.description,
        quantityOrdered: Number(l.quantity),
        quantityPreviouslyReceived: Number(l.quantityReceived),
        quantityOutstanding: Number(l.quantityOutstanding),
        quantityReceiving: Number(l.quantityOutstanding).toFixed(2), // default to full outstanding
        unitCost: l.unitCost, // pre-filled from PO
      })),
  )

  const [receivedDate, setReceivedDate] = useState(todayISO())
  const [notes, setNotes] = useState('')
  const [paymentType, setPaymentType] = useState<PaymentType>('credit')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [confirmMode, setConfirmMode] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totalCost = lines.reduce(
    (s, l) => s + parseNum(l.quantityReceiving) * parseNum(l.unitCost),
    0,
  )

  function updateLine(poLineId: string, field: 'quantityReceiving' | 'unitCost', value: string) {
    setLines((prev) =>
      prev.map((l) => (l.poLineId === poLineId ? { ...l, [field]: value } : l)),
    )
  }

  const hasAnyReceiving = lines.some((l) => parseNum(l.quantityReceiving) > 0)
  const canSubmit =
    hasAnyReceiving &&
    !!receivedDate &&
    lines
      .filter((l) => parseNum(l.quantityReceiving) > 0)
      .every((l) => parseNum(l.unitCost) >= 0 && l.productId)

  async function handleSubmit(shouldConfirm: boolean) {
    setError(null)

    const grnNumber = await generateGrnNumber()
    const activeLines = lines.filter((l) => parseNum(l.quantityReceiving) > 0)

    startTransition(async () => {
      const createResult = await createGrn({
        supplierId: po.supplierId,
        poId: po.id,
        receivedDate,
        notes: notes.trim() || undefined,
        grnNumber,
        lines: activeLines.map((l) => ({
          productId: l.productId!,
          poLineId: l.poLineId,
          quantityOrdered: l.quantityOrdered,
          quantityReceived: parseNum(l.quantityReceiving),
          unitCost: parseNum(l.unitCost),
        })),
      })

      if (!createResult.success) {
        setError(createResult.error)
        setConfirmMode(false)
        return
      }

      if (shouldConfirm) {
        const confirmResult = await confirmGrn({
          grnId: createResult.grnId,
          paymentMethod: paymentType === 'cash' ? paymentMethod : undefined,
        })

        if (!confirmResult.success) {
          setError(confirmResult.error)
          router.push(`/grn/${createResult.grnId}`)
          return
        }
      }

      router.push(`/grn/${createResult.grnId}`)
    })
  }

  if (po.lines.every((l) => Number(l.quantityOutstanding) <= 0.001)) {
    return (
      <main className="min-h-screen bg-gray-50 p-4 md:p-8">
        <div className="mx-auto max-w-2xl">
          <Link
            href={`/purchase-orders/${po.id}`}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← {po.poNumber}
          </Link>
          <div className="mt-8 rounded-xl bg-white p-8 text-center shadow-sm">
            <p className="text-lg font-medium text-gray-700">All lines fully received</p>
            <p className="mt-1 text-sm text-gray-400">
              There are no outstanding quantities on this purchase order.
            </p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <Link
          href={`/purchase-orders/${po.id}`}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← {po.poNumber}
        </Link>
        <h1 className="mt-4 text-xl font-semibold text-gray-900">
          Receive Goods — {po.poNumber}
        </h1>
        <p className="mt-1 text-sm text-gray-500">{po.supplierName}</p>

        <div className="mt-6 space-y-4">
          {/* Date */}
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <label className="block text-sm font-medium text-gray-700">Date Received</label>
            <input
              type="date"
              value={receivedDate}
              max={todayISO()}
              onChange={(e) => setReceivedDate(e.target.value)}
              className="mt-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Line items table */}
          <div className="overflow-hidden rounded-xl bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100 bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Product</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-500">Ordered</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-500">Received</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-500">Outstanding</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-500">
                      Receiving Now
                    </th>
                    <th className="px-3 py-3 text-right font-medium text-gray-500">Unit Cost</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-500">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lines.map((line) => {
                    const lineTotal =
                      parseNum(line.quantityReceiving) * parseNum(line.unitCost)
                    const receivingNum = parseNum(line.quantityReceiving)
                    const exceedsOutstanding = receivingNum > line.quantityOutstanding + 0.001

                    return (
                      <tr key={line.poLineId}>
                        <td className="px-4 py-3 text-gray-900">
                          {line.productDescription ?? '—'}
                        </td>
                        <td className="px-3 py-3 text-right text-gray-500">
                          {line.quantityOrdered.toFixed(2)}
                        </td>
                        <td className="px-3 py-3 text-right text-gray-500">
                          {line.quantityPreviouslyReceived.toFixed(2)}
                        </td>
                        <td className="px-3 py-3 text-right text-gray-500">
                          {line.quantityOutstanding.toFixed(2)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <input
                            type="number"
                            min="0"
                            max={line.quantityOutstanding}
                            step="0.01"
                            value={line.quantityReceiving}
                            onChange={(e) =>
                              updateLine(line.poLineId, 'quantityReceiving', e.target.value)
                            }
                            className={`w-20 rounded-lg border px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                              exceedsOutstanding ? 'border-red-300 bg-red-50' : 'border-gray-200'
                            }`}
                          />
                          {exceedsOutstanding && (
                            <p className="mt-0.5 text-xs text-red-600">Exceeds outstanding</p>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.unitCost}
                            onChange={(e) =>
                              updateLine(line.poLineId, 'unitCost', e.target.value)
                            }
                            className="w-24 rounded-lg border border-gray-200 px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-3 py-3 text-right font-medium text-gray-900">
                          {formatGHS(lineTotal)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="border-t border-gray-200 bg-gray-50">
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-3 text-right font-semibold text-gray-700"
                    >
                      Total
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-gray-900">
                      {formatGHS(totalCost)}
                    </td>
                  </tr>
                </tfoot>
              </table>
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
                Confirming will add{' '}
                {lines
                  .filter((l) => parseNum(l.quantityReceiving) > 0)
                  .reduce((s, l) => s + parseNum(l.quantityReceiving), 0)
                  .toFixed(2)}{' '}
                units to inventory and{' '}
                {paymentType === 'credit'
                  ? `create a payable of ${formatGHS(totalCost)} to ${po.supplierName}`
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
