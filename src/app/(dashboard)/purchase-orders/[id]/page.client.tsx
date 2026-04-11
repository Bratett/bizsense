'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { markPoSent, cancelPurchaseOrder } from '@/actions/purchaseOrders'
import type { PoWithLinesAndGrns } from '@/actions/purchaseOrders'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatGHS(amount: string | null | undefined): string {
  if (!amount) return 'GHS 0.00'
  return `GHS ${Number(amount).toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; classes: string }> = {
  draft: { label: 'Draft', classes: 'bg-gray-100 text-gray-600' },
  sent: { label: 'Sent', classes: 'bg-blue-100 text-blue-700' },
  partially_received: { label: 'Partially Received', classes: 'bg-amber-100 text-amber-700' },
  received: { label: 'Received', classes: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Cancelled', classes: 'bg-red-100 text-red-600' },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? { label: status, classes: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.classes}`}>
      {cfg.label}
    </span>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PurchaseOrderDetail({ po }: { po: PoWithLinesAndGrns }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [toast, setToast] = useState<string | null>(null)

  function showError(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  function handleSend() {
    startTransition(async () => {
      const result = await markPoSent(po.id)
      if (!result.success) {
        showError(result.error)
        return
      }

      if (po.supplierPhone) {
        const lineText = po.lines
          .map((l, i) => `${i + 1}. ${l.description ?? ''} x${l.quantity} @ GHS ${l.unitCost}`)
          .join('\n')
        const msg = encodeURIComponent(
          `Hi ${po.supplierName}, please find our Purchase Order ${po.poNumber} below:\n\n${lineText}\n\nTotal: ${formatGHS(po.totalAmount)}${po.expectedDate ? `\nExpected by: ${po.expectedDate}` : ''}`,
        )
        window.open(`https://wa.me/${po.supplierPhone.replace(/\D/g, '')}?text=${msg}`, '_blank')
      }

      router.refresh()
    })
  }

  function handleCancel() {
    if (!confirm('Cancel this purchase order?')) return
    startTransition(async () => {
      try {
        await cancelPurchaseOrder(po.id)
        router.refresh()
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Could not cancel PO.')
      }
    })
  }

  const canEdit = po.status === 'draft'
  const canSend = po.status === 'draft'
  const canReceive = po.status === 'sent' || po.status === 'partially_received'
  const canCancel = po.status === 'draft' || po.status === 'sent'

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-2xl">
        {/* Toast */}
        {toast && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{toast}</div>
        )}

        {/* Header */}
        <div className="mb-6 flex items-start gap-3">
          <Link
            href="/purchase-orders"
            className="mt-0.5 rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
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
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-gray-900">{po.poNumber}</h1>
              <StatusBadge status={po.status} />
            </div>
            <p className="mt-0.5 text-sm text-gray-500">
              {po.supplierName} &middot; {formatDate(po.orderDate)}
            </p>
            {po.expectedDate && (
              <p className="mt-0.5 text-xs text-gray-400">
                Expected: {formatDate(po.expectedDate)}
              </p>
            )}
            {po.currency === 'USD' && po.fxRate && (
              <p className="mt-0.5 text-xs text-gray-400">
                USD order at rate GHS {Number(po.fxRate).toFixed(4)}
              </p>
            )}
          </div>
        </div>

        {/* Line items table */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Line Items</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Description</th>
                  <th className="px-3 py-2 text-right font-medium">Ordered</th>
                  <th className="px-3 py-2 text-right font-medium">Received</th>
                  <th className="px-3 py-2 text-right font-medium">Outstanding</th>
                  <th className="px-3 py-2 text-right font-medium">Unit Cost</th>
                  <th className="px-4 py-2 text-right font-medium">Line Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {po.lines.map((line) => (
                  <tr key={line.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-900">{line.description ?? '—'}</td>
                    <td className="px-3 py-2.5 text-right text-gray-700">
                      {Number(line.quantity).toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-700">
                      {Number(line.quantityReceived).toFixed(2)}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right font-medium ${
                        Number(line.quantityOutstanding) > 0 ? 'text-amber-600' : 'text-green-600'
                      }`}
                    >
                      {Number(line.quantityOutstanding).toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-700">
                      {formatGHS(line.unitCost)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-gray-900">
                      {formatGHS(line.lineTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="border-t border-gray-100 px-4 py-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Subtotal</span>
              <span className="font-medium text-gray-900">{formatGHS(po.subtotal)}</span>
            </div>
            <div className="mt-1 flex justify-between text-base">
              <span className="font-semibold text-gray-900">Total</span>
              <span className="font-bold text-gray-900">{formatGHS(po.totalAmount)}</span>
            </div>
          </div>
        </div>

        {/* GRNs section */}
        {po.grns.length > 0 && (
          <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Goods Received Notes</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {po.grns.map((grn) => (
                <div key={grn.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{grn.grnNumber}</p>
                    <p className="text-xs text-gray-500">
                      {formatDate(grn.receivedDate)} &middot;{' '}
                      <span
                        className={grn.status === 'confirmed' ? 'text-green-600' : 'text-gray-400'}
                      >
                        {grn.status}
                      </span>
                    </p>
                  </div>
                  <span className="text-sm font-medium text-gray-900">
                    {formatGHS(grn.totalCost)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {po.notes && (
          <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Notes</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{po.notes}</p>
          </div>
        )}

        {/* Actions */}
        {(canEdit || canSend || canReceive || canCancel) && (
          <div className="mt-6 space-y-3">
            {canReceive && (
              <Link
                href={`/purchase-orders/${po.id}/grn/new`}
                className="flex w-full items-center justify-center rounded-lg bg-green-700 py-3 text-sm font-semibold text-white hover:bg-green-800"
              >
                {po.status === 'partially_received'
                  ? 'Receive Remaining Goods'
                  : 'Receive Goods (Create GRN)'}
              </Link>
            )}

            <div className="flex gap-3">
              {canEdit && (
                <Link
                  href={`/purchase-orders/${po.id}/edit`}
                  className="flex-1 rounded-lg border border-gray-300 py-2.5 text-center text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Edit PO
                </Link>
              )}
              {canSend && (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleSend}
                  className="flex-1 rounded-lg border border-blue-600 py-2.5 text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                >
                  Send to Supplier
                </button>
              )}
              {canCancel && (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleCancel}
                  className="flex-1 rounded-lg border border-red-300 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Cancel PO
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
