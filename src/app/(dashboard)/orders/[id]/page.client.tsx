'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { OrderDetail } from '@/actions/orders'
import InvoiceButton from '@/components/InvoiceButton.client'

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  momo_mtn: 'MTN MoMo',
  momo_telecel: 'Telecel Cash',
  momo_airtel: 'AirtelTigo Money',
  bank: 'Bank Transfer',
}

function formatGHS(amount: string | null): string {
  if (!amount) return 'GHS 0.00'
  return `GHS ${Number(amount).toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GH', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function StatusBadge({ label, variant }: { label: string; variant: 'green' | 'gray' }) {
  const colors = variant === 'green' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${colors}`}>
      {label}
    </span>
  )
}

function PaymentStatusBadge({
  paymentStatus,
  totalAmount,
  amountPaid,
}: {
  paymentStatus: string
  totalAmount: string | null
  amountPaid: string
}) {
  const outstanding = Math.max(0, Number(totalAmount ?? 0) - Number(amountPaid))
  if (paymentStatus === 'paid') {
    return (
      <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium bg-green-100 text-green-700">
        Paid
      </span>
    )
  }
  if (paymentStatus === 'unpaid') {
    return (
      <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium bg-red-100 text-red-700">
        Unpaid · GHS {outstanding.toFixed(2)}
      </span>
    )
  }
  return (
    <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-700">
      Partial · GHS {outstanding.toFixed(2)} due
    </span>
  )
}

export default function OrderDetailView({ order }: { order: OrderDetail }) {
  const router = useRouter()
  const remaining = Math.max(0, Number(order.totalAmount ?? 0) - Number(order.amountPaid))
  const isUnpaidOrPartial = order.status === 'fulfilled' && order.paymentStatus !== 'paid'

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-lg">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <Link
            href="/orders"
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Back to orders"
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
            <h1 className="text-xl font-semibold text-gray-900">{order.orderNumber}</h1>
            <p className="text-sm text-gray-500">{formatDate(order.orderDate)}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <StatusBadge label={order.status} variant="gray" />
            <PaymentStatusBadge
              paymentStatus={order.paymentStatus}
              totalAmount={order.totalAmount}
              amountPaid={order.amountPaid}
            />
          </div>
        </div>

        {/* Customer */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Customer</p>
          {order.customer ? (
            <div className="mt-1">
              <p className="font-medium text-gray-900">{order.customer.name}</p>
              {order.customer.phone && (
                <p className="text-sm text-gray-500">{order.customer.phone}</p>
              )}
            </div>
          ) : (
            <p className="mt-1 text-gray-500">Walk-in</p>
          )}
        </div>

        {/* Line items */}
        <div className="mt-4 rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="text-xs font-medium text-gray-500">Items ({order.lines.length})</p>
          </div>
          <div className="divide-y divide-gray-100">
            {order.lines.map((line) => (
              <div key={line.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{line.description}</p>
                  <p className="text-xs text-gray-500">
                    {Number(line.quantity)} x {line.unitPriceCurrency === 'USD' ? 'USD' : 'GHS'}{' '}
                    {Number(line.unitPrice).toFixed(2)}
                  </p>
                </div>
                <p className="ml-4 text-sm font-medium text-gray-900">
                  {formatGHS(line.lineTotal)}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Totals */}
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="space-y-1">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal</span>
              <span>{formatGHS(order.subtotal)}</span>
            </div>
            {order.discountAmount && Number(order.discountAmount) > 0 && (
              <div className="flex justify-between text-sm text-gray-600">
                <span>
                  Discount
                  {order.discountType === 'percentage' && order.discountValue
                    ? ` (${Number(order.discountValue)}%)`
                    : ''}
                </span>
                <span className="text-red-600">-{formatGHS(order.discountAmount)}</span>
              </div>
            )}
            {order.taxAmount && Number(order.taxAmount) > 0 && (
              <div className="flex justify-between text-sm text-gray-600">
                <span>Tax</span>
                <span>{formatGHS(order.taxAmount)}</span>
              </div>
            )}
            {order.fxRate && (
              <div className="flex justify-between text-xs text-gray-400">
                <span>FX Rate</span>
                <span>1 USD = GHS {Number(order.fxRate).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-gray-200 pt-2">
              <span className="text-lg font-bold text-gray-900">TOTAL</span>
              <span className="text-lg font-bold text-gray-900">
                {formatGHS(order.totalAmount)}
              </span>
            </div>
          </div>
        </div>

        {/* Payment */}
        {order.payment && (
          <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500">Payment</p>
            <div className="mt-1 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Method</span>
                <span className="font-medium text-gray-900">
                  {PAYMENT_METHOD_LABELS[order.payment.paymentMethod] ??
                    order.payment.paymentMethod}
                </span>
              </div>
              {order.payment.momoReference && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">MoMo Ref</span>
                  <span className="font-mono text-gray-900">{order.payment.momoReference}</span>
                </div>
              )}
              {order.payment.bankReference && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Bank Ref</span>
                  <span className="font-mono text-gray-900">{order.payment.bankReference}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Amount Paid</span>
                <span className="font-medium text-green-700">{formatGHS(order.amountPaid)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Outstanding balance + Record Payment */}
        {isUnpaidOrPartial && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-amber-700">Outstanding Balance</p>
                <p className="text-2xl font-bold text-amber-800">GHS {remaining.toFixed(2)}</p>
                {order.paymentStatus === 'partial' && (
                  <p className="text-xs text-amber-600">
                    GHS {Number(order.amountPaid).toFixed(2)} already paid
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => router.push(`/orders/${order.id}/payment`)}
                className="rounded-lg bg-green-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-800 active:bg-green-900"
              >
                Record Payment
              </button>
            </div>
          </div>
        )}

        {/* Invoice Actions */}
        <InvoiceButton
          orderId={order.id}
          orderNumber={order.orderNumber}
          totalAmount={order.totalAmount}
          customerPhone={order.customer?.phone}
        />

        {/* Notes */}
        {order.notes && (
          <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500">Notes</p>
            <p className="mt-1 text-sm text-gray-700">{order.notes}</p>
          </div>
        )}
      </div>
    </main>
  )
}
