'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import type { OrderListItem } from '@/actions/orders'
import SwipeableRow from '@/components/SwipeableRow.client'

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  momo_mtn: 'MTN MoMo',
  momo_telecel: 'Telecel',
  momo_airtel: 'AirtelTigo',
  bank: 'Bank',
}

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'this_week', label: 'This Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'unpaid', label: 'Unpaid' },
] as const

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
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function PaymentBadge({
  paymentStatus,
  totalAmount,
  amountPaid,
}: {
  paymentStatus: string
  totalAmount: string | null
  amountPaid: string | null
}) {
  const outstanding = Math.max(0, Number(totalAmount ?? 0) - Number(amountPaid ?? 0))
  if (paymentStatus === 'paid') {
    return (
      <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
        Paid
      </span>
    )
  }
  if (paymentStatus === 'unpaid') {
    return (
      <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
        Unpaid &middot; GHS {outstanding.toFixed(2)}
      </span>
    )
  }
  return (
    <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
      Partial &middot; GHS {outstanding.toFixed(2)} due
    </span>
  )
}

export default function OrderList({
  initialOrders,
  activeTab,
}: {
  initialOrders: OrderListItem[]
  activeTab: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState(searchParams.get('search') ?? '')

  const filtered = initialOrders.filter((o) => {
    if (!search) return true
    const term = search.toLowerCase()
    return (
      o.orderNumber.toLowerCase().includes(term) ||
      (o.customerName && o.customerName.toLowerCase().includes(term))
    )
  })

  const handleTabClick = (key: string) => {
    const params = new URLSearchParams()
    if (key !== 'all') params.set('tab', key)
    router.push('/orders' + (params.toString() ? `?${params}` : ''))
  }

  // Outstanding summary for unpaid tab
  const showOutstandingSummary = activeTab === 'unpaid'
  const totalOutstanding = initialOrders.reduce((sum, o) => {
    return sum + Math.max(0, Number(o.totalAmount ?? 0) - Number(o.amountPaid ?? 0))
  }, 0)

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Orders</h1>
          <Link
            href="/orders/new"
            className="rounded-lg bg-green-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-800 active:bg-green-900"
          >
            New Sale
          </Link>
        </div>

        {/* Tab bar */}
        <div className="mt-4 flex gap-1 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => handleTabClick(tab.key)}
              className={`flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-green-700 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Outstanding summary */}
        {showOutstandingSummary && initialOrders.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
            GHS {totalOutstanding.toFixed(2)} outstanding across {initialOrders.length} invoice
            {initialOrders.length !== 1 ? 's' : ''}
          </div>
        )}

        {/* Search */}
        <div className="mt-4">
          <input
            type="search"
            placeholder="Search by order number or customer"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base text-gray-900 placeholder-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
          />
        </div>

        {/* List */}
        <div className="mt-4 space-y-3">
          {filtered.length === 0 && initialOrders.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
              <p className="text-gray-500">No orders yet.</p>
              <p className="mt-1 text-sm text-gray-400">Record your first sale to get started.</p>
              <Link
                href="/orders/new"
                className="mt-4 inline-block rounded-lg bg-green-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-800"
              >
                New Sale
              </Link>
            </div>
          )}

          {filtered.length === 0 && initialOrders.length > 0 && (
            <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
              <p className="text-gray-500">No orders match your search.</p>
            </div>
          )}

          {filtered.map((order) => (
            <SwipeableRow
              key={order.id}
              actions={[
                {
                  label: 'View',
                  color: 'bg-blue-500',
                  onClick: () => router.push(`/orders/${order.id}`),
                },
              ]}
            >
              <Link
                href={`/orders/${order.id}`}
                className="block rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50 active:bg-gray-100"
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900">{order.orderNumber}</p>
                      <PaymentBadge
                        paymentStatus={order.paymentStatus}
                        totalAmount={order.totalAmount}
                        amountPaid={order.amountPaid}
                      />
                    </div>
                    <p className="mt-0.5 text-sm text-gray-500">
                      {order.customerName || 'Walk-in'} &middot; {formatDate(order.orderDate)}
                    </p>
                    {order.paymentMethod && (
                      <p className="mt-0.5 text-xs text-gray-400">
                        {PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod}
                      </p>
                    )}
                  </div>
                  <div className="ml-4 flex items-center gap-2">
                    <p className="text-base font-semibold text-gray-900">
                      {formatGHS(order.totalAmount)}
                    </p>
                    <svg
                      className="h-5 w-5 flex-shrink-0 text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </Link>
            </SwipeableRow>
          ))}
        </div>
      </div>
    </main>
  )
}
