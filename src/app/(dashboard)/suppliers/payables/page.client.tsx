'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { PayablesAgingReport, SupplierAgingRow, AllocatedGrn } from '@/lib/suppliers/payablesAging'
import { recordSupplierPayment, type PaymentMethod } from '@/actions/supplierPayments'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatGHS(amount: number): string {
  return amount.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

const BUCKET_COLORS = {
  current: 'text-green-700',
  '31-60': 'text-amber-600',
  '61-90': 'text-orange-600',
  over90: 'text-red-600 font-semibold',
} as const

const BUCKET_BADGE_COLORS = {
  current: 'bg-green-100 text-green-700',
  '31-60': 'bg-amber-100 text-amber-700',
  '61-90': 'bg-orange-100 text-orange-700',
  over90: 'bg-red-100 text-red-700',
} as const

const BUCKET_BAR_COLORS = {
  current: 'bg-gray-800',
  '31-60': 'bg-amber-400',
  '61-90': 'bg-orange-500',
  over90: 'bg-red-500',
} as const

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  momo_mtn: 'MTN MoMo',
  momo_telecel: 'Telecel Cash',
  momo_airtel: 'AirtelTigo Money',
  bank: 'Bank Transfer',
}

// ─── Payment Modal ────────────────────────────────────────────────────────────

type PaymentModalProps = {
  supplier: SupplierAgingRow
  onClose: () => void
  onSuccess: () => void
}

function PaymentModal({ supplier, onClose, onSuccess }: PaymentModalProps) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [date, setDate] = useState(todayISO())
  const [momoRef, setMomoRef] = useState('')
  const [bankRef, setBankRef] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [awaitingConfirm, setAwaitingConfirm] = useState(false)

  const outstanding = supplier.totals.total
  const amountNum = parseFloat(amount)

  function handleSubmit() {
    setError(null)
    setWarning(null)

    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      setError('Enter a valid amount greater than 0')
      return
    }

    if (amountNum > outstanding && !awaitingConfirm) {
      setWarning(
        `This payment (GHS ${formatGHS(amountNum)}) exceeds the outstanding balance (GHS ${formatGHS(outstanding)}). This will create a supplier credit. Continue?`,
      )
      setAwaitingConfirm(true)
      return
    }

    startTransition(async () => {
      try {
        await recordSupplierPayment({
          supplierId: supplier.supplierId,
          amount: amountNum,
          paymentMethod: method,
          paymentDate: date,
          momoReference: momoRef || undefined,
          bankReference: bankRef || undefined,
          notes: notes || undefined,
        })
        onSuccess()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to record payment')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Record Payment</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="mb-4 text-sm text-gray-600">
          Supplier: <span className="font-medium text-gray-900">{supplier.supplierName}</span>
          <span className="ml-2 text-xs text-gray-500">Outstanding: GHS {formatGHS(outstanding)}</span>
        </p>

        {warning && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {warning}
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Amount (GHS)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setAwaitingConfirm(false); setWarning(null) }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              placeholder="0.00"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Payment Method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            >
              {Object.entries(PAYMENT_METHOD_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Payment Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>

          {(method === 'momo_mtn' || method === 'momo_telecel' || method === 'momo_airtel') && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">MoMo Reference</label>
              <input
                type="text"
                value={momoRef}
                onChange={(e) => setMomoRef(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                placeholder="Transaction ID"
              />
            </div>
          )}

          {method === 'bank' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Bank Reference</label>
              <input
                type="text"
                value={bankRef}
                onChange={(e) => setBankRef(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                placeholder="Bank transaction reference"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 resize-none"
              placeholder="Any additional notes..."
            />
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={onClose}
            disabled={isPending}
            className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="flex-1 rounded-xl bg-green-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
          >
            {isPending ? 'Saving…' : awaitingConfirm ? 'Confirm Payment' : 'Record Payment'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── GRN Row ──────────────────────────────────────────────────────────────────

function GrnRow({ grn }: { grn: AllocatedGrn }) {
  const badgeClass = BUCKET_BADGE_COLORS[grn.bucket]
  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="py-2.5 pl-10 pr-3 text-xs text-gray-600">{grn.grnNumber}</td>
      <td className="px-3 py-2.5 text-xs text-gray-500">{formatDate(grn.receivedDate)}</td>
      <td className="px-3 py-2.5 text-xs text-gray-500">{formatDate(grn.dueDate)}</td>
      <td className="px-3 py-2.5 text-xs text-right text-gray-700">
        GHS {formatGHS(grn.originalAmount)}
      </td>
      <td className="px-3 py-2.5 text-xs text-right text-gray-500">
        {grn.amountPaid > 0 ? `GHS ${formatGHS(grn.amountPaid)}` : '—'}
      </td>
      <td className="px-3 py-2.5 text-xs text-right font-medium text-gray-900">
        GHS {formatGHS(grn.outstanding)}
      </td>
      <td className="py-2.5 pl-3 pr-4 text-right">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${badgeClass}`}>
          {grn.ageInDays === 0 ? 'Current' : `${grn.ageInDays}d`}
        </span>
      </td>
    </tr>
  )
}

// ─── Supplier Row ─────────────────────────────────────────────────────────────

function SupplierRow({
  row,
  onRecordPayment,
}: {
  row: SupplierAgingRow
  onRecordPayment: (s: SupplierAgingRow) => void
}) {
  const [expanded, setExpanded] = useState(false)

  const isCritical = row.totals.over90 > 0
  const over90Class = row.totals.over90 > 0 ? 'text-red-600 font-semibold' : 'text-gray-900'
  const initials = row.supplierName
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <>
      <tr
        className="cursor-pointer border-b border-gray-100 hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        <td className="py-3 pl-4 pr-3">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                isCritical ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-800'
              }`}
            >
              {initials}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{row.supplierName}</p>
              {row.phone && <p className="text-xs text-gray-400">{row.phone}</p>}
            </div>
            <span className={`ml-1 h-2 w-2 rounded-full ${isCritical ? 'bg-red-500' : 'bg-green-500'}`} />
          </div>
        </td>
        <td className="px-3 py-3 text-sm font-medium text-right text-gray-900">
          GHS {formatGHS(row.totals.total)}
        </td>
        <td className="px-3 py-3 text-sm text-right text-gray-700">
          {row.totals.current > 0 ? `GHS ${formatGHS(row.totals.current)}` : '—'}
        </td>
        <td className="px-3 py-3 text-sm text-right text-amber-600">
          {row.totals.days31to60 > 0 ? `GHS ${formatGHS(row.totals.days31to60)}` : '—'}
        </td>
        <td className="px-3 py-3 text-sm text-right text-orange-600">
          {row.totals.days61to90 > 0 ? `GHS ${formatGHS(row.totals.days61to90)}` : '—'}
        </td>
        <td className={`px-3 py-3 text-sm text-right ${over90Class}`}>
          {row.totals.over90 > 0 ? (
            <span className="rounded-md bg-red-50 px-2 py-0.5">
              GHS {formatGHS(row.totals.over90)}
            </span>
          ) : '—'}
        </td>
        <td className="py-3 pl-3 pr-4">
          <div className="flex justify-end gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); onRecordPayment(row) }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-green-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-800"
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
              </svg>
              Pay
            </button>
            <a
              href={`/suppliers/${row.supplierId}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              Statement
            </a>
          </div>
        </td>
      </tr>
      {expanded && row.grns.map((grn) => (
        <GrnRow key={grn.grnId} grn={grn} />
      ))}
    </>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PayablesAgingClient({ report }: { report: PayablesAgingReport }) {
  const router = useRouter()
  const [paymentTarget, setPaymentTarget] = useState<SupplierAgingRow | null>(null)
  const gt = report.grandTotals
  const totalForPct = gt.total || 1

  // Find largest over-90 supplier for advisory
  const criticalSupplier = report.suppliers.reduce<SupplierAgingRow | null>(
    (max, s) => (!max || s.totals.over90 > max.totals.over90 ? s : max),
    null,
  )

  const asAt = report.generatedAt.toLocaleDateString('en-GH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  return (
    <div className="min-h-screen bg-gray-50">
      {paymentTarget && (
        <PaymentModal
          supplier={paymentTarget}
          onClose={() => setPaymentTarget(null)}
          onSuccess={() => {
            setPaymentTarget(null)
            router.refresh()
          }}
        />
      )}

      <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
        {/* ─── Header ─────────────────────────────────────────────── */}
        <nav className="mb-4 flex items-center gap-1.5 text-xs text-gray-500">
          <a href="/suppliers" className="hover:text-gray-700">Reports</a>
          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          <span className="font-medium text-gray-800">Payables Aging</span>
        </nav>

        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-green-800">Payables Aging Report</h1>
            <p className="mt-1 text-sm text-gray-500">
              Comprehensive breakdown of outstanding vendor obligations, categorized by duration to manage cash flow effectively.
            </p>
          </div>
          <div className="flex gap-2">
            <button className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
              </svg>
              Filter Dates
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Export PDF
            </button>
          </div>
        </div>

        {/* ─── Summary Cards ───────────────────────────────────────── */}
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
          {/* Total Owed */}
          <div className="col-span-2 md:col-span-1 rounded-xl bg-green-800 p-4 text-white shadow-sm">
            <p className="text-xs font-medium text-green-200">TOTAL OWED</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              GHS {formatGHS(gt.total)}
            </p>
            {gt.over90 > 0 && (
              <p className="mt-2 text-xs text-green-300">
                ▲ {((gt.over90 / totalForPct) * 100).toFixed(1)}% overdue 90+
              </p>
            )}
          </div>

          {/* 1-30 Days */}
          <SummaryBucket
            label="1-30 DAYS"
            amount={gt.current}
            total={totalForPct}
            barColor={BUCKET_BAR_COLORS.current}
            valueColor="text-gray-900"
          />

          {/* 31-60 Days */}
          <SummaryBucket
            label="31-60 DAYS"
            amount={gt.days31to60}
            total={totalForPct}
            barColor={BUCKET_BAR_COLORS['31-60']}
            valueColor="text-amber-600"
          />

          {/* 61-90 Days */}
          <SummaryBucket
            label="61-90 DAYS"
            amount={gt.days61to90}
            total={totalForPct}
            barColor={BUCKET_BAR_COLORS['61-90']}
            valueColor="text-orange-600"
          />

          {/* Over 90 Days */}
          <div className={`rounded-xl border p-4 shadow-sm ${gt.over90 > 0 ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}>
            <p className={`text-xs font-medium ${gt.over90 > 0 ? 'text-red-500' : 'text-gray-500'}`}>OVER 90 DAYS</p>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${gt.over90 > 0 ? 'text-red-600' : 'text-gray-900'}`}>
              GHS {formatGHS(gt.over90)}
            </p>
            <div className="mt-2 h-1 w-full rounded-full bg-gray-200">
              <div
                className="h-1 rounded-full bg-red-500"
                style={{ width: `${Math.min(100, (gt.over90 / totalForPct) * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {((gt.over90 / totalForPct) * 100).toFixed(0)}% of total
            </p>
          </div>
        </div>

        {/* ─── Supplier Breakdown Table ────────────────────────────── */}
        {report.suppliers.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
            <svg className="mx-auto mb-3 h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm font-medium text-gray-700">No outstanding payables</p>
            <p className="mt-1 text-xs text-gray-400">All supplier balances are settled.</p>
          </div>
        ) : (
          <div className="mb-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-800">Supplier Breakdown</h2>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  Current
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  Critical
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="py-2.5 pl-4 pr-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      Supplier Name
                    </th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      Total Balance
                    </th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      1-30 Days
                    </th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      31-60 Days
                    </th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      61-90 Days
                    </th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      Over 90 Days
                    </th>
                    <th className="py-2.5 pl-3 pr-4 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.suppliers.map((s) => (
                    <SupplierRow
                      key={s.supplierId}
                      row={s}
                      onRecordPayment={setPaymentTarget}
                    />
                  ))}

                  {/* Total Summary Row */}
                  <tr className="border-t-2 border-gray-200 bg-gray-50">
                    <td className="py-3 pl-4 pr-3 text-sm font-semibold text-gray-900">Total Summary</td>
                    <td className="px-3 py-3 text-right text-sm font-bold text-gray-900">
                      GHS {formatGHS(gt.total)}
                    </td>
                    <td className="px-3 py-3 text-right text-sm font-semibold text-gray-700">
                      GHS {formatGHS(gt.current)}
                    </td>
                    <td className="px-3 py-3 text-right text-sm font-semibold text-amber-600">
                      GHS {formatGHS(gt.days31to60)}
                    </td>
                    <td className="px-3 py-3 text-right text-sm font-semibold text-orange-600">
                      GHS {formatGHS(gt.days61to90)}
                    </td>
                    <td className="px-3 py-3 text-right text-sm font-bold text-red-600">
                      GHS {formatGHS(gt.over90)}
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── Bottom Row ──────────────────────────────────────────── */}
        <div className="grid gap-4 md:grid-cols-3">
          {/* Cash Flow Advisory */}
          <div className="md:col-span-2 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="mb-2 text-sm font-semibold text-gray-800">Cash Flow Advisory</h3>
            {criticalSupplier && criticalSupplier.totals.over90 > 0 ? (
              <>
                <p className="text-sm text-gray-600">
                  Your &ldquo;Over 90 Days&rdquo; payables have{' '}
                  {((criticalSupplier.totals.over90 / totalForPct) * 100).toFixed(0)}% concentration with{' '}
                  <span className="font-semibold text-gray-900">{criticalSupplier.supplierName}</span>. We recommend
                  prioritising settlement to maintain your service level agreement and avoid late penalties.
                </p>
                <div className="mt-4 flex gap-3">
                  <button
                    onClick={() => setPaymentTarget(criticalSupplier)}
                    className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
                  >
                    Review Payment Plan
                  </button>
                  <button className="text-sm font-medium text-gray-500 hover:text-gray-700">
                    Dismiss Advisory
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500">
                {gt.total === 0
                  ? 'All supplier payables are settled. Great work!'
                  : 'All outstanding payables are within acceptable aging limits. No urgent action required.'}
              </p>
            )}
          </div>

          {/* Upcoming Milestones placeholder */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Upcoming Milestones
            </p>
            <div className="space-y-3 text-sm text-gray-600">
              <div className="flex items-start gap-2">
                <svg width="16" height="16" className="mt-0.5 flex-shrink-0 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5m-9-6h.008v.008H12V10.5zm0 3h.008v.008H12v-.008zm0 3h.008v.008H12v-.008zM9 10.5h.008v.008H9V10.5zm0 3h.008v.008H9v-.008zm0 3h.008v.008H9v-.008zm3 0h.008v.008H12v-.008zm0 3h.008v.008H12V18zm3-6h.008v.008H15v-.008zm0 3h.008v.008H15v-.008z" />
                </svg>
                <div>
                  <p className="font-medium text-gray-800">VAT Filing Deadline</p>
                  <p className="text-xs text-gray-400">Check GRA calendar</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <svg width="16" height="16" className="mt-0.5 flex-shrink-0 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
                <div>
                  <p className="font-medium text-gray-800">Tax Compliance Cert</p>
                  <p className="text-xs text-gray-400">Renew before expiry</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">Report generated as at {asAt}</p>
      </div>
    </div>
  )
}

// ─── SummaryBucket ────────────────────────────────────────────────────────────

function SummaryBucket({
  label,
  amount,
  total,
  barColor,
  valueColor,
}: {
  label: string
  amount: number
  total: number
  barColor: string
  valueColor: string
}) {
  const pct = total > 0 ? (amount / total) * 100 : 0
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${valueColor}`}>
        GHS {formatGHS(amount)}
      </p>
      <div className="mt-2 h-1 w-full rounded-full bg-gray-100">
        <div
          className={`h-1 rounded-full ${barColor}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-gray-400">{pct.toFixed(0)}% of total</p>
    </div>
  )
}
