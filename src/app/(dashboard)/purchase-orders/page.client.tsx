'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { PurchaseOrderWithSupplier } from '@/actions/purchaseOrders'

type PoStatus = 'all' | 'draft' | 'sent' | 'partially_received' | 'received' | 'cancelled'

const STATUS_TABS: { key: PoStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'sent', label: 'Sent' },
  { key: 'partially_received', label: 'Partial' },
  { key: 'received', label: 'Received' },
  { key: 'cancelled', label: 'Cancelled' },
]

const STATUS_BADGE: Record<string, { label: string; classes: string }> = {
  draft: { label: 'Draft', classes: 'bg-gray-100 text-gray-600' },
  sent: { label: 'Sent', classes: 'bg-blue-100 text-blue-700' },
  partially_received: { label: 'Partially Received', classes: 'bg-amber-100 text-amber-700' },
  received: { label: 'Received', classes: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Cancelled', classes: 'bg-red-100 text-red-600 line-through' },
}

function formatGHS(amount: string | null): string {
  if (!amount) return 'GHS 0.00'
  return `GHS ${Number(amount).toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_BADGE[status] ?? { label: status, classes: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cfg.classes}`}>
      {cfg.label}
    </span>
  )
}

export default function PurchaseOrderList({
  initialPos,
}: {
  initialPos: PurchaseOrderWithSupplier[]
}) {
  const [activeTab, setActiveTab] = useState<PoStatus>('all')
  const [search, setSearch] = useState('')

  const filtered = initialPos.filter((po) => {
    if (activeTab !== 'all' && po.status !== activeTab) return false
    if (search) {
      const term = search.toLowerCase()
      return (
        po.poNumber.toLowerCase().includes(term) ||
        po.supplierName.toLowerCase().includes(term)
      )
    }
    return true
  })

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Purchase Orders</h1>
          <Link
            href="/purchase-orders/new"
            className="rounded-lg bg-green-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-800 active:bg-green-900"
          >
            New PO
          </Link>
        </div>

        {/* Status tabs */}
        <div className="mt-4 flex gap-1 overflow-x-auto pb-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-green-700 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="mt-3">
          <input
            type="search"
            placeholder="Search by PO number or supplier"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base text-gray-900 placeholder-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
          />
        </div>

        {/* List */}
        <div className="mt-4 space-y-3">
          {filtered.length === 0 && initialPos.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
              <p className="text-gray-500">No purchase orders yet.</p>
              <p className="mt-1 text-sm text-gray-400">
                Create your first PO to order from a supplier.
              </p>
              <Link
                href="/purchase-orders/new"
                className="mt-4 inline-block rounded-lg bg-green-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-800"
              >
                New PO
              </Link>
            </div>
          )}

          {filtered.length === 0 && initialPos.length > 0 && (
            <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
              <p className="text-gray-500">No purchase orders match.</p>
            </div>
          )}

          {filtered.map((po) => (
            <Link
              key={po.id}
              href={`/purchase-orders/${po.id}`}
              className="block rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50 active:bg-gray-100"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900">{po.poNumber}</p>
                    <StatusBadge status={po.status} />
                  </div>
                  <p className="mt-0.5 text-sm text-gray-600">{po.supplierName}</p>
                  <div className="mt-0.5 flex gap-2 text-xs text-gray-400">
                    <span>Ordered: {formatDate(po.orderDate)}</span>
                    {po.expectedDate && (
                      <span>&middot; Expected: {formatDate(po.expectedDate)}</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <p className="text-base font-semibold text-gray-900">
                    {formatGHS(po.totalAmount)}
                  </p>
                  <svg
                    className="h-5 w-5 text-gray-400"
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
          ))}
        </div>
      </div>
    </main>
  )
}
