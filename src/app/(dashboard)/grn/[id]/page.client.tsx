'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { reverseGrn, type GrnWithLinesAndJournal } from '@/actions/grn'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatGHS(amount: string | number | null): string {
  if (amount == null) return 'GHS 0.00'
  const n = typeof amount === 'string' ? parseFloat(amount) : amount
  return `GHS ${n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' })
}

const STATUS_BADGE: Record<string, { label: string; classes: string }> = {
  draft: { label: 'Draft', classes: 'bg-gray-100 text-gray-700' },
  confirmed: { label: 'Confirmed', classes: 'bg-green-100 text-green-700' },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_BADGE[status] ?? { label: status, classes: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-sm font-medium ${cfg.classes}`}>
      {cfg.label}
    </span>
  )
}

// ─── Reversal modal ───────────────────────────────────────────────────────────

function ReversalModal({
  grn,
  onClose,
  onSuccess,
}: {
  grn: GrnWithLinesAndJournal
  onClose: () => void
  onSuccess: () => void
}) {
  const [reason, setReason] = useState('')
  const [quantities, setQuantities] = useState<number[]>(grn.lines.map(() => 0))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasAnyReturn = quantities.some((q) => q > 0)
  const totalReturning = quantities.reduce((s, q) => s + q, 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!reason.trim()) {
      setError('Reason is required.')
      return
    }
    if (!hasAnyReturn) {
      setError('Enter a return quantity for at least one line.')
      return
    }
    setSubmitting(true)
    setError(null)

    const result = await reverseGrn({
      grnId: grn.id,
      reason: reason.trim(),
      lines: grn.lines
        .map((l, i) => ({ grnLineId: l.id, quantityReturning: quantities[i] }))
        .filter((l) => l.quantityReturning > 0),
    })

    if (result.success) {
      onSuccess()
    } else {
      setError(result.error)
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-gray-900">Reverse GRN — Purchase Return</h2>
        <p className="mt-1 text-sm text-gray-500">
          Enter quantities to return. A reversal journal entry will be posted.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="space-y-2">
            {grn.lines.map((line, i) => (
              <div key={line.id} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-sm text-gray-700">
                  {line.productName}
                  <span className="ml-1 text-xs text-gray-400">
                    (max {Number(line.quantityReceived).toFixed(2)})
                  </span>
                </span>
                <input
                  type="number"
                  min={0}
                  max={Number(line.quantityReceived)}
                  step="0.01"
                  value={quantities[i] || ''}
                  onChange={(e) => {
                    const val = Math.min(
                      Math.max(0, Number(e.target.value)),
                      Number(line.quantityReceived),
                    )
                    setQuantities((prev) => prev.map((q, idx) => (idx === i ? val : q)))
                  }}
                  className="w-24 rounded-lg border border-gray-200 px-2 py-1.5 text-right text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="e.g. Damaged goods, wrong item delivered"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !hasAnyReturn}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {submitting
                ? 'Posting reversal…'
                : `Return${totalReturning > 0 ? ` ${totalReturning.toFixed(2)} units` : ''}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function GrnDetail({
  grn,
  role,
}: {
  grn: GrnWithLinesAndJournal
  role: string
}) {
  const router = useRouter()
  const [showReversal, setShowReversal] = useState(false)
  const [journalExpanded, setJournalExpanded] = useState(false)

  const canReverse = grn.status === 'confirmed' && (role === 'owner' || role === 'manager')
  const canSeeJournal = role === 'owner' || role === 'accountant' || role === 'manager'
  const isCashPayment = grn.journalSummary?.description?.includes('Cash payment') ?? false

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-2xl">
        {/* Back */}
        <Link href="/grn" className="text-sm text-gray-500 hover:text-gray-700">
          ← Goods Received
        </Link>

        {/* Header */}
        <div className="mt-4 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-mono text-xl font-semibold text-gray-900">{grn.grnNumber}</h1>
              <StatusBadge status={grn.status} />
            </div>
            <p className="mt-1 text-sm text-gray-500">{grn.supplierName}</p>
            {grn.poNumber && (
              <Link
                href={`/purchase-orders/${grn.poId}`}
                className="mt-0.5 block text-xs text-blue-600 hover:underline"
              >
                PO: {grn.poNumber}
              </Link>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Received</p>
            <p className="text-sm font-medium text-gray-700">{formatDate(grn.receivedDate)}</p>
          </div>
        </div>

        {/* Lines table */}
        <div className="mt-6 overflow-hidden rounded-xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Product</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Qty</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Unit Cost</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {grn.lines.map((line) => (
                <tr key={line.id}>
                  <td className="px-4 py-3 text-gray-900">{line.productName}</td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {Number(line.quantityReceived).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {formatGHS(line.unitCost)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    {formatGHS(line.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-gray-200 bg-gray-50">
              <tr>
                <td colSpan={3} className="px-4 py-3 text-right font-semibold text-gray-700">
                  Total
                </td>
                <td className="px-4 py-3 text-right font-bold text-gray-900">
                  {formatGHS(grn.totalCost)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Payment type */}
        {grn.status === 'confirmed' && (
          <div className="mt-4 rounded-xl bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-700">
              <span className="font-medium">Payment: </span>
              {isCashPayment
                ? `Cash payment — ${formatGHS(grn.totalCost)}`
                : `Credit — payable to ${grn.supplierName}`}
            </p>
          </div>
        )}

        {/* Notes */}
        {grn.notes && (
          <div className="mt-4 rounded-xl bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Notes</p>
            <p className="mt-1 text-sm text-gray-700">{grn.notes}</p>
          </div>
        )}

        {/* Journal entry summary (owner/manager/accountant) */}
        {canSeeJournal && grn.journalEntryId && grn.journalSummary && (
          <div className="mt-4 overflow-hidden rounded-xl bg-white shadow-sm">
            <button
              onClick={() => setJournalExpanded((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <span className="text-sm font-medium text-gray-700">Journal Entry</span>
              <span className="text-xs text-gray-400">{journalExpanded ? '▲' : '▼'}</span>
            </button>
            {journalExpanded && (
              <div className="border-t border-gray-100 px-4 pb-4 text-sm text-gray-600 space-y-1">
                <p>
                  <span className="font-medium">Date:</span>{' '}
                  {formatDate(grn.journalSummary.entryDate)}
                </p>
                <p>
                  <span className="font-medium">Reference:</span> {grn.journalSummary.reference}
                </p>
                <p>
                  <span className="font-medium">Description:</span>{' '}
                  {grn.journalSummary.description}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Reverse action */}
        {canReverse && (
          <div className="mt-6 flex justify-end">
            <button
              onClick={() => setShowReversal(true)}
              className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Reverse GRN (Purchase Return)
            </button>
          </div>
        )}
      </div>

      {showReversal && (
        <ReversalModal
          grn={grn}
          onClose={() => setShowReversal(false)}
          onSuccess={() => {
            setShowReversal(false)
            router.push('/grn')
          }}
        />
      )}
    </main>
  )
}
