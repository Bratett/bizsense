'use client'

import { useState } from 'react'
import { formatGhs, formatDate } from '@/lib/format'
import { downloadCsv, generateReportPdf } from '@/lib/reports/export'
import { ArAgingDocument } from '@/lib/pdf/arAging'
import type { ArAgingReport, ArAgingCustomer, ArAgingLine } from '@/lib/reports/arAging'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  report: ArAgingReport
  arLedgerBalance: number
  isReconciled: boolean
  reconciliationDiff: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BUCKET_LABELS = {
  current: 'Current (0–30 days)',
  '31-60': '31–60 days',
  '61-90': '61–90 days',
  over90:  '90+ days',
} as const

const BUCKET_COLORS = {
  current: { card: 'border-t-4 border-t-green-400',  text: 'text-green-700',  badge: 'bg-green-100 text-green-700' },
  '31-60': { card: 'border-t-4 border-t-amber-400',  text: 'text-amber-700',  badge: 'bg-amber-100 text-amber-700' },
  '61-90': { card: 'border-t-4 border-t-orange-400', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-700' },
  over90:  { card: 'border-t-4 border-t-red-500',    text: 'text-red-700',    badge: 'bg-red-100 text-red-700' },
} as const

function AgeBadge({ bucket }: { bucket: ArAgingLine['bucket'] }) {
  const color = BUCKET_COLORS[bucket]
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${color.badge}`}>
      {bucket === 'current' ? 'Current' : bucket}
    </span>
  )
}

function buildWhatsAppLink(phone: string | null, name: string, orderNumber: string, outstanding: number, dueDate: string): string {
  if (!phone) return '#'
  const text = encodeURIComponent(
    `Hello ${name}, your invoice ${orderNumber} for GHS ${outstanding.toFixed(2)} was due on ${dueDate}. Please arrange payment. Thank you.`
  )
  const digits = phone.replace(/\D/g, '')
  return `https://wa.me/${digits.startsWith('0') ? '233' + digits.slice(1) : digits}?text=${text}`
}

// ─── Customer section ─────────────────────────────────────────────────────────

function CustomerRow({ customer }: { customer: ArAgingCustomer }) {
  const [expanded, setExpanded] = useState(false)
  const t = customer.totals
  const totalWidth = t.total || 1
  const hasPhone = !!customer.customerPhone

  return (
    <div className="border-b border-gray-100 last:border-0">
      {/* Customer header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-800 truncate">
                {customer.customerName}
              </span>
              {customer.customerPhone && (
                <span className="text-xs text-gray-400">{customer.customerPhone}</span>
              )}
            </div>
            {/* Aging bar */}
            <div className="mt-1.5 flex h-1.5 w-full max-w-xs rounded overflow-hidden gap-px">
              {t.current > 0 && (
                <div className="bg-green-400 rounded-l" style={{ width: `${(t.current / totalWidth) * 100}%` }} />
              )}
              {t.days31to60 > 0 && (
                <div className="bg-amber-400" style={{ width: `${(t.days31to60 / totalWidth) * 100}%` }} />
              )}
              {t.days61to90 > 0 && (
                <div className="bg-orange-400" style={{ width: `${(t.days61to90 / totalWidth) * 100}%` }} />
              )}
              {t.over90 > 0 && (
                <div className="bg-red-500 rounded-r" style={{ width: `${(t.over90 / totalWidth) * 100}%` }} />
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-sm font-semibold text-gray-900 tabular-nums">
              {formatGhs(t.total)}
            </div>
            <div className="text-xs text-gray-400">
              {customer.invoices.length} invoice{customer.invoices.length !== 1 ? 's' : ''}
            </div>
          </div>
          <span className="text-gray-400 text-sm">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Expanded invoices */}
      {expanded && (
        <div className="bg-gray-50 border-t border-gray-100">
          {/* Actions for this customer */}
          {hasPhone && (
            <div className="px-4 py-2 flex gap-2">
              {customer.invoices.slice(0, 1).map((inv) => (
                <a
                  key={`wa-${inv.orderId}`}
                  href={buildWhatsAppLink(
                    customer.customerPhone,
                    customer.customerName,
                    inv.orderNumber,
                    inv.outstanding,
                    inv.dueDate,
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border border-green-300 bg-white px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50"
                >
                  Send Reminder (WhatsApp)
                </a>
              ))}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="py-2 pl-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Order #</th>
                  <th className="py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Date</th>
                  <th className="py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Due</th>
                  <th className="py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-400">Original</th>
                  <th className="py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-400">Paid</th>
                  <th className="py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-400">Outstanding</th>
                  <th className="py-2 pr-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-400">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {customer.invoices.map((inv) => (
                  <tr key={inv.orderId} className="hover:bg-white">
                    <td className="py-2 pl-4 font-mono text-xs text-gray-600">{inv.orderNumber}</td>
                    <td className="py-2 text-xs text-gray-500">{formatDate(inv.orderDate)}</td>
                    <td className="py-2 text-xs text-gray-500">{formatDate(inv.dueDate)}</td>
                    <td className="py-2 text-right text-xs tabular-nums text-gray-700">{formatGhs(inv.originalAmount)}</td>
                    <td className="py-2 text-right text-xs tabular-nums text-gray-500">{formatGhs(inv.amountPaid)}</td>
                    <td className="py-2 text-right text-xs tabular-nums font-semibold text-gray-900">{formatGhs(inv.outstanding)}</td>
                    <td className="py-2 pr-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <AgeBadge bucket={inv.bucket} />
                        <a
                          href={`/orders/${inv.orderId}/payment`}
                          className="text-xs text-green-700 hover:underline"
                        >
                          Pay
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-white">
                  <td colSpan={5} className="py-2 pl-4 text-xs font-semibold text-gray-500">Subtotal</td>
                  <td className="py-2 text-right text-xs tabular-nums font-bold text-gray-900">
                    {formatGhs(t.total)}
                  </td>
                  <td className="py-2 pr-4"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ArAgingClient({
  report,
  arLedgerBalance,
  isReconciled,
  reconciliationDiff,
}: Props) {
  const [pdfLoading, setPdfLoading] = useState(false)
  const gt = report.grandTotals

  const handleCsv = () => {
    const rows: Record<string, string | number>[] = []
    for (const c of report.customers) {
      for (const inv of c.invoices) {
        rows.push({
          'Customer':       c.customerName,
          'Phone':          c.customerPhone ?? '',
          'Order #':        inv.orderNumber,
          'Order Date':     inv.orderDate,
          'Due Date':       inv.dueDate,
          'Original (GHS)': inv.originalAmount.toFixed(2),
          'Paid (GHS)':     inv.amountPaid.toFixed(2),
          'Outstanding (GHS)': inv.outstanding.toFixed(2),
          'Age (Days)':     inv.ageDays,
          'Bucket':         inv.bucket,
        })
      }
    }
    downloadCsv(`ar-aging-${report.asOfDate}.csv`, rows)
  }

  const handlePdf = async () => {
    setPdfLoading(true)
    try {
      const blob = await generateReportPdf(ArAgingDocument, report)
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `ar-aging-${report.asOfDate}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setPdfLoading(false)
    }
  }

  const buckets: Array<{ key: keyof typeof gt; label: string; amount: number }> = [
    { key: 'current',    label: BUCKET_LABELS['current'], amount: gt.current },
    { key: 'days31to60', label: BUCKET_LABELS['31-60'],   amount: gt.days31to60 },
    { key: 'days61to90', label: BUCKET_LABELS['61-90'],   amount: gt.days61to90 },
    { key: 'over90',     label: BUCKET_LABELS['over90'],  amount: gt.over90 },
  ]
  const bucketColorKeys = ['current', '31-60', '61-90', 'over90'] as const

  return (
    <div className="space-y-4">
      {/* Reconciliation banner */}
      {isReconciled ? (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
          ✓ Reconciled — AR Ledger {formatGhs(arLedgerBalance)} matches aging total {formatGhs(gt.total)}
        </div>
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠ {formatGhs(reconciliationDiff)} discrepancy — AR Ledger {formatGhs(arLedgerBalance)} | Aging {formatGhs(gt.total)}
        </div>
      )}

      {/* Summary bucket cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {buckets.map((b, i) => {
          const colorKey = bucketColorKeys[i]
          const color = BUCKET_COLORS[colorKey]
          return (
            <div key={b.key} className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm ${color.card}`}>
              <p className="text-xs font-medium text-gray-500">{b.label}</p>
              <p className={`mt-2 text-lg font-semibold tabular-nums ${color.text}`}>
                {formatGhs(b.amount)}
              </p>
            </div>
          )
        })}
      </div>

      {/* Grand total bar + actions */}
      <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
        <div>
          <span className="text-sm text-gray-500">Grand Total</span>
          <span className="ml-3 text-xl font-bold tabular-nums text-gray-900">{formatGhs(gt.total)}</span>
          <span className="ml-2 text-sm text-gray-400">
            across {report.totalCustomersWithBalance} customer{report.totalCustomersWithBalance !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCsv}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Download CSV
          </button>
          <button
            onClick={handlePdf}
            disabled={pdfLoading}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {pdfLoading ? 'Generating…' : 'Download PDF'}
          </button>
        </div>
      </div>

      {/* Customer list */}
      {report.customers.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center shadow-sm">
          <p className="text-sm text-gray-500">No outstanding receivables as at {report.asOfDate}.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {report.customers.map((c) => (
            <CustomerRow key={c.customerId ?? 'walk-in'} customer={c} />
          ))}
        </div>
      )}
    </div>
  )
}
