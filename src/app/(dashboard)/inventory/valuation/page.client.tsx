'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { ValuationReport } from '@/lib/inventory/valuation'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatGHS(amount: number): string {
  return amount.toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-GH', { dateStyle: 'medium' })
}

type SortKey = 'value' | 'name' | 'category' | 'quantity'
type SortDir = 'asc' | 'desc'

// ─── Component ──────────────────────────────────────────────────────────────

export default function ValuationReportView({
  report,
}: {
  report: ValuationReport
}) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('value')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [showLowStockOnly, setShowLowStockOnly] = useState(false)

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'name' || key === 'category' ? 'asc' : 'desc')
    }
  }

  const filtered = report.lines
    .filter((l) => {
      if (showLowStockOnly && !l.isLowStock) return false
      if (search) {
        const term = search.toLowerCase()
        return (
          l.productName.toLowerCase().includes(term) ||
          (l.sku?.toLowerCase().includes(term) ?? false)
        )
      }
      return true
    })
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      switch (sortKey) {
        case 'value':
          return (a.totalValue - b.totalValue) * dir
        case 'name':
          return a.productName.localeCompare(b.productName) * dir
        case 'category':
          return (a.category ?? '').localeCompare(b.category ?? '') * dir
        case 'quantity':
          return (a.currentQuantity - b.currentQuantity) * dir
        default:
          return 0
      }
    })

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return ''
    return sortDir === 'asc' ? ' \u25B2' : ' \u25BC'
  }

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Stock Valuation Report</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            As at {formatDate(report.generatedAt)}
          </p>
        </div>
        <Link
          href="/inventory"
          className="text-sm font-medium text-green-700 hover:text-green-800"
        >
          Back to Inventory
        </Link>
      </div>

      {/* Summary card */}
      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <p className="text-xs font-medium text-gray-500">Total Inventory Value</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">
              GHS {formatGHS(report.grandTotalValue)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500">Products</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">
              {report.lines.length}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500">Low Stock</p>
            <p
              className={`mt-1 text-2xl font-semibold tabular-nums ${
                report.lowStockCount > 0 ? 'text-amber-600' : 'text-green-700'
              }`}
            >
              {report.lowStockCount}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500">GL Balance (1200)</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">
              GHS {formatGHS(report.glAccountBalance)}
            </p>
          </div>
        </div>
      </div>

      {/* Reconciliation check */}
      <div className="mt-3">
        {report.isReconciled ? (
          <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5">
            <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            <span className="text-sm font-medium text-green-800">Reconciled</span>
            <span className="text-xs text-green-600">
              Valuation matches GL account 1200 (Inventory)
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5">
            <svg className="h-4 w-4 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <span className="text-sm font-medium text-red-800">
              Discrepancy: GHS {formatGHS(Math.abs(report.discrepancy))}
            </span>
            <Link
              href="/ledger"
              className="ml-auto text-xs font-medium text-red-700 underline hover:text-red-800"
            >
              Run integrity check
            </Link>
          </div>
        )}
      </div>

      {/* Search + filter bar */}
      <div className="mt-4 flex gap-2">
        <input
          type="search"
          placeholder="Search by name or SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
        />
        <button
          type="button"
          onClick={() => setShowLowStockOnly((v) => !v)}
          className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
            showLowStockOnly
              ? 'border-amber-300 bg-amber-50 text-amber-700'
              : 'border-gray-300 text-gray-600 hover:bg-gray-50'
          }`}
        >
          Low Stock
        </button>
      </div>

      {/* Table */}
      <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500">
              <th
                className="cursor-pointer px-4 py-3 hover:text-gray-900"
                onClick={() => toggleSort('name')}
              >
                Product{sortIndicator('name')}
              </th>
              <th className="hidden px-4 py-3 md:table-cell">SKU</th>
              <th
                className="hidden cursor-pointer px-4 py-3 hover:text-gray-900 md:table-cell"
                onClick={() => toggleSort('category')}
              >
                Category{sortIndicator('category')}
              </th>
              <th
                className="cursor-pointer px-4 py-3 text-right hover:text-gray-900"
                onClick={() => toggleSort('quantity')}
              >
                Qty{sortIndicator('quantity')}
              </th>
              <th className="hidden px-4 py-3 text-right md:table-cell">Unit</th>
              <th className="hidden px-4 py-3 text-right md:table-cell">FIFO Cost</th>
              <th
                className="cursor-pointer px-4 py-3 text-right hover:text-gray-900"
                onClick={() => toggleSort('value')}
              >
                Value{sortIndicator('value')}
              </th>
              <th className="px-4 py-3 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                  No products match your filters
                </td>
              </tr>
            ) : (
              filtered.map((line) => (
                <tr key={line.productId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <Link
                      href={`/inventory/${line.productId}`}
                      className="hover:text-green-700"
                    >
                      {line.productName}
                    </Link>
                  </td>
                  <td className="hidden px-4 py-3 text-gray-500 md:table-cell">
                    {line.sku ?? '-'}
                  </td>
                  <td className="hidden px-4 py-3 text-gray-500 md:table-cell">
                    {line.category ?? '-'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                    {line.currentQuantity}
                  </td>
                  <td className="hidden px-4 py-3 text-right text-gray-500 md:table-cell">
                    {line.unit ?? '-'}
                  </td>
                  <td className="hidden px-4 py-3 text-right tabular-nums text-gray-900 md:table-cell">
                    {line.fifoUnitCost > 0 ? formatGHS(line.fifoUnitCost) : '-'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900">
                    {line.totalValue > 0 ? `GHS ${formatGHS(line.totalValue)}` : '-'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {line.isLowStock ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        Low
                      </span>
                    ) : line.currentQuantity <= 0 ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        Out
                      </span>
                    ) : (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        OK
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer links */}
      <div className="mt-4 flex justify-between pb-4 text-sm">
        <Link
          href="/ledger"
          className="font-medium text-green-700 hover:text-green-800"
        >
          View Inventory account in General Ledger &rarr;
        </Link>
      </div>
    </div>
  )
}
