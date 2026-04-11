'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { GrnWithSupplier } from '@/actions/grn'

type GrnStatus = 'all' | 'draft' | 'confirmed'

const STATUS_TABS: { key: GrnStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'confirmed', label: 'Confirmed' },
]

const STATUS_BADGE: Record<string, { label: string; classes: string }> = {
  draft: { label: 'Draft', classes: 'bg-gray-100 text-gray-600' },
  confirmed: { label: 'Confirmed', classes: 'bg-green-100 text-green-700' },
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

export default function GrnList({ initialGrns }: { initialGrns: GrnWithSupplier[] }) {
  const [activeTab, setActiveTab] = useState<GrnStatus>('all')
  const [search, setSearch] = useState('')

  const filtered = initialGrns.filter((g) => {
    if (activeTab !== 'all' && g.status !== activeTab) return false
    if (search) {
      const term = search.toLowerCase()
      return g.grnNumber.toLowerCase().includes(term) || g.supplierName.toLowerCase().includes(term)
    }
    return true
  })

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Goods Received</h1>
          <Link
            href="/grn/new"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + New GRN
          </Link>
        </div>

        {/* Search */}
        <div className="mt-4">
          <input
            type="text"
            placeholder="Search by GRN number or supplier…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Status tabs */}
        <div className="mt-4 flex gap-2 overflow-x-auto">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="mt-4 space-y-2">
          {filtered.length === 0 ? (
            <div className="rounded-xl bg-white p-8 text-center text-gray-400">
              {search ? 'No GRNs match your search.' : 'No goods received notes yet.'}
              {!search && (
                <div className="mt-3">
                  <Link href="/grn/new" className="text-sm text-blue-600 hover:underline">
                    Record a walk-in delivery
                  </Link>
                  {' or '}
                  <Link href="/purchase-orders" className="text-sm text-blue-600 hover:underline">
                    receive goods against a PO
                  </Link>
                  .
                </div>
              )}
            </div>
          ) : (
            filtered.map((grn) => (
              <Link
                key={grn.id}
                href={`/grn/${grn.id}`}
                className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium text-gray-900">
                      {grn.grnNumber}
                    </span>
                    <StatusBadge status={grn.status} />
                  </div>
                  <p className="mt-0.5 truncate text-sm text-gray-500">{grn.supplierName}</p>
                  <p className="text-xs text-gray-400">{formatDate(grn.receivedDate)}</p>
                </div>
                <div className="ml-4 shrink-0 text-right">
                  <p className="text-sm font-semibold text-gray-900">{formatGHS(grn.totalCost)}</p>
                  {grn.poId && <p className="text-xs text-gray-400">From PO</p>}
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </main>
  )
}
