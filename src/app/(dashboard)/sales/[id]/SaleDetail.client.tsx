'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { OrderDetail } from '@/actions/orders'
import { reverseOrder } from '@/actions/orders'
import type { PaymentListItem } from '@/actions/payments'
import InvoiceButton from '@/components/InvoiceButton.client'

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatGHS(amount: string | number | null): string {
  if (amount == null) return '0.00'
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  return num.toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatTimestamp(date: Date): string {
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getInitials(name: string | null): string {
  if (!name) return '?'
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  momo_mtn: 'MTN Mobile Money',
  momo_telecel: 'Telecel Cash',
  momo_airtel: 'AirtelTigo Money',
  bank: 'Bank Transfer',
}

const PAYMENT_METHOD_ICONS: Record<string, string> = {
  cash: '💵',
  momo_mtn: '📱',
  momo_telecel: '📱',
  momo_airtel: '📱',
  bank: '🏦',
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function SaleDetail({
  order,
  payments,
}: {
  order: OrderDetail
  payments: PaymentListItem[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showVoidModal, setShowVoidModal] = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [restockInventory, setRestockInventory] = useState(true)
  const [voidError, setVoidError] = useState<string | null>(null)

  const remaining = Math.max(0, Number(order.totalAmount ?? 0) - Number(order.amountPaid))
  const isPaid = order.paymentStatus === 'paid'
  const isCancelled = order.status === 'cancelled'
  const discountAmount = Number(order.discountAmount ?? 0)

  const handleVoidSale = () => {
    if (!voidReason.trim()) {
      setVoidError('Please provide a reason')
      return
    }
    startTransition(async () => {
      const result = await reverseOrder({
        orderId: order.id,
        reason: voidReason,
        restockInventory,
      })
      if (result.success) {
        router.push('/sales')
      } else {
        setVoidError(result.error)
      }
    })
  }

  // Build activity timeline from order + payments
  const timeline: Array<{ label: string; date: Date; icon: string }> = []
  timeline.push({
    label: 'Order created',
    date: order.createdAt,
    icon: 'create',
  })
  for (const p of payments) {
    timeline.push({
      label: `Payment received via ${PAYMENT_METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod}`,
      date: p.createdAt,
      icon: 'payment',
    })
  }
  timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
        {/* Breadcrumb */}
        <nav className="mb-4 flex items-center gap-2 text-sm text-gray-500">
          <Link href="/sales" className="hover:text-green-700">
            Sales
          </Link>
          <span>›</span>
          <span className="text-gray-900">{order.orderNumber}</span>
        </nav>

        {/* Header */}
        <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-gray-900">
                Sale #{order.orderNumber}
              </h1>
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                  isCancelled
                    ? 'bg-gray-100 text-gray-500'
                    : isPaid
                      ? 'bg-green-100 text-green-700'
                      : 'bg-amber-100 text-amber-700'
                }`}
              >
                {isCancelled ? 'VOIDED' : isPaid ? 'PAID' : 'PENDING'}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Issued on {formatDate(order.orderDate)}
            </p>
          </div>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left column — 2/3 */}
          <div className="space-y-6 lg:col-span-2">
            {/* Customer Details */}
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
                  Customer Details
                </h2>
                {order.customer && (
                  <Link
                    href={`/customers`}
                    className="text-sm font-medium text-gray-500 hover:text-green-700"
                  >
                    ✏ Edit
                  </Link>
                )}
              </div>
              {order.customer ? (
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 text-lg font-semibold text-amber-700">
                    {getInitials(order.customer.name)}
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-gray-900">
                      {order.customer.name}
                    </p>
                    {order.customer.phone && (
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                        </svg>
                        {order.customer.phone}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500">Walk-in customer</p>
              )}
            </div>

            {/* Products & Services */}
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
                Products & Services
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
                        Product / SKU
                      </th>
                      <th className="pb-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-400">
                        Qty
                      </th>
                      <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-400">
                        Unit Price
                      </th>
                      <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-400">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {order.lines.map((line) => (
                      <tr key={line.id}>
                        <td className="py-3.5">
                          <p className="text-sm font-medium text-gray-900">
                            {line.description ?? 'Item'}
                          </p>
                        </td>
                        <td className="py-3.5 text-center text-sm text-gray-600" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {Number(line.quantity)}
                        </td>
                        <td className="py-3.5 text-right text-sm text-gray-600" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          GHS {formatGHS(line.unitPrice)}
                        </td>
                        <td className="py-3.5 text-right text-sm font-semibold text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          GHS {formatGHS(line.lineTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Payment History & Activity Timeline */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* Payment History */}
              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
                  Payment History
                </h2>
                {payments.length === 0 ? (
                  <p className="text-sm text-gray-400">No payments recorded</p>
                ) : (
                  <div className="space-y-3">
                    {payments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green-50 text-lg">
                            {PAYMENT_METHOD_ICONS[p.paymentMethod] ?? '💰'}
                          </span>
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {PAYMENT_METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod}
                            </p>
                            <p className="text-xs text-gray-400">
                              {formatShortDate(p.paymentDate)}
                            </p>
                          </div>
                        </div>
                        <p className="text-sm font-semibold text-green-700" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          GHS {formatGHS(p.amount)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Activity Timeline */}
              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
                  Activity Timeline
                </h2>
                <div className="relative space-y-4">
                  {timeline.map((event, idx) => (
                    <div key={idx} className="flex items-start gap-3">
                      <div className="relative flex flex-col items-center">
                        <div
                          className={`h-3 w-3 rounded-full ${
                            event.icon === 'create'
                              ? 'bg-gray-400'
                              : 'bg-green-500'
                          }`}
                        />
                        {idx < timeline.length - 1 && (
                          <div className="mt-1 h-8 w-px bg-gray-200" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {event.label}
                        </p>
                        <p className="text-xs text-gray-400">
                          {formatTimestamp(event.date)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right column — 1/3 */}
          <div className="space-y-4">
            {/* Summary */}
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
                Summary
              </h2>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-medium text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    GHS {formatGHS(order.subtotal)}
                  </span>
                </div>
                {Number(order.taxAmount ?? 0) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Tax (VAT 15%)</span>
                    <span className="font-medium text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      GHS {formatGHS(order.taxAmount)}
                    </span>
                  </div>
                )}
                {discountAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-red-500">Discount (GHS)</span>
                    <span className="font-medium text-red-500" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      -GHS {formatGHS(discountAmount)}
                    </span>
                  </div>
                )}
                <div className="my-3 border-t border-gray-100" />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-900">
                    Grand Total
                  </span>
                  <span className="text-2xl font-bold text-green-700" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    GHS {formatGHS(order.totalAmount)}
                  </span>
                </div>
              </div>
            </div>

            {/* Payment Status */}
            <div
              className={`rounded-xl border p-4 shadow-sm ${
                isCancelled
                  ? 'border-gray-200 bg-gray-50'
                  : isPaid
                    ? 'border-green-200 bg-green-50'
                    : 'border-amber-200 bg-amber-50'
              }`}
            >
              <div className="flex items-center gap-3">
                {isCancelled ? (
                  <>
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200">
                      <svg className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-700">VOIDED</p>
                      <p className="text-xs text-gray-500">This sale has been reversed</p>
                    </div>
                  </>
                ) : isPaid ? (
                  <>
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-200">
                      <svg className="h-5 w-5 text-green-700" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-green-700">FULLY PAID</p>
                      <p className="text-xs text-green-600">
                        Cleared on {formatShortDate(order.orderDate)}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-200">
                      <svg className="h-5 w-5 text-amber-700" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-amber-700">OUTSTANDING</p>
                      <p className="text-xs text-amber-600" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        GHS {formatGHS(remaining)} remaining
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            {!isCancelled && (
              <div className="space-y-2">
                <InvoiceButton
                  orderId={order.id}
                  orderNumber={order.orderNumber}
                  totalAmount={order.totalAmount}
                  customerPhone={order.customer?.phone}
                />
                <button
                  onClick={() => {
                    if (order.customer?.phone) {
                      const msg = `Hi ${order.customer.name}, here is your invoice ${order.orderNumber} for GHS ${formatGHS(order.totalAmount)}. Thank you for your business!`
                      window.open(
                        `https://wa.me/${order.customer.phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`,
                        '_blank',
                      )
                    }
                  }}
                  disabled={!order.customer?.phone}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="#25D366">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                  </svg>
                  Share via WhatsApp
                </button>
                <button className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                  Send Invoice Email
                </button>
                <button
                  onClick={() => setShowVoidModal(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                  Void Sale
                </button>
              </div>
            )}

            {/* Growth Insight */}
            {order.customer && !isCancelled && (
              <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-amber-50 to-white p-5 shadow-sm">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-amber-500">✨</span>
                  <h3 className="text-sm font-semibold text-gray-900">
                    Growth Insight
                  </h3>
                </div>
                <p className="text-sm text-gray-600">
                  Track this customer&apos;s purchase patterns over time to identify upsell
                  opportunities and build long-term business relationships.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Void Sale Modal */}
      {showVoidModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Void Sale</h3>
            <p className="mt-1 text-sm text-gray-500">
              This will reverse all journal entries and mark the sale as
              cancelled. This action cannot be undone.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Reason for voiding
                </label>
                <textarea
                  value={voidReason}
                  onChange={(e) => {
                    setVoidReason(e.target.value)
                    setVoidError(null)
                  }}
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-100"
                  placeholder="e.g., Customer requested cancellation"
                />
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={restockInventory}
                  onChange={(e) => setRestockInventory(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-green-700 focus:ring-green-600"
                />
                <span className="text-sm text-gray-700">Restock inventory</span>
              </label>
              {voidError && (
                <p className="text-sm text-red-600">{voidError}</p>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setShowVoidModal(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleVoidSale}
                disabled={isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isPending ? 'Voiding...' : 'Void Sale'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
