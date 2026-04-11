'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  listSales,
  type SalesSummary,
  type SalesListResult,
  type SalesListFilters,
} from '@/actions/sales'

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
    month: 'short',
    year: 'numeric',
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

function getTrendPercent(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null
  return Math.round(((current - previous) / previous) * 100)
}

// ─── Constants ──────────────────────────────────────────────────────────────

const TABS = [
  { key: 'all', label: 'All Sales' },
  { key: 'paid', label: 'Paid' },
  { key: 'unpaid', label: 'Pending' },
  { key: 'overdue', label: 'Overdue' },
] as const

const STATUS_STYLES: Record<string, string> = {
  paid: 'bg-green-100 text-green-700',
  partial: 'bg-amber-100 text-amber-700',
  unpaid: 'bg-amber-100 text-amber-700',
  overdue: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
}

const STATUS_LABELS: Record<string, string> = {
  paid: 'PAID',
  partial: 'PARTIAL',
  unpaid: 'PENDING',
  overdue: 'OVERDUE',
  cancelled: 'CANCELLED',
}

const AVATAR_COLORS = [
  'bg-green-100 text-green-700',
  'bg-amber-100 text-amber-700',
  'bg-blue-100 text-blue-700',
  'bg-purple-100 text-purple-700',
  'bg-pink-100 text-pink-700',
  'bg-teal-100 text-teal-700',
]

function avatarColor(name: string | null): string {
  if (!name) return AVATAR_COLORS[0]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function SalesList({
  initialSales,
  summary,
}: {
  initialSales: SalesListResult
  summary: SalesSummary
}) {
  const [sales, setSales] = useState(initialSales)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<string>('all')
  const [isPending, startTransition] = useTransition()

  const customerTrend = getTrendPercent(summary.totalCustomers, summary.customerCountLastMonth)

  const fetchSales = (overrides: Partial<SalesListFilters> = {}) => {
    const filters: SalesListFilters = {
      search: overrides.search ?? search,
      paymentStatus:
        (overrides.paymentStatus ?? activeTab) === 'all'
          ? undefined
          : ((overrides.paymentStatus ?? activeTab) as SalesListFilters['paymentStatus']),
      page: overrides.page ?? 1,
      pageSize: 20,
    }
    startTransition(async () => {
      const result = await listSales(filters)
      setSales(result)
    })
  }

  const handleTabChange = (tab: string) => {
    setActiveTab(tab)
    fetchSales({ paymentStatus: tab === 'all' ? undefined : (tab as SalesListFilters['paymentStatus']), page: 1 })
  }

  const handleSearch = (value: string) => {
    setSearch(value)
    fetchSales({ search: value, page: 1 })
  }

  const handlePageChange = (newPage: number) => {
    fetchSales({ page: newPage })
  }

  const handleExportCSV = () => {
    const headers = ['Date', 'Order #', 'Customer', 'Items', 'Total (GHS)', 'Status']
    const csvRows = sales.items.map((s) => [
      s.orderDate,
      s.orderNumber,
      s.customerName ?? 'Walk-in',
      s.itemCount,
      s.totalAmount ?? '0',
      s.paymentStatus,
    ])
    const csv = [headers, ...csvRows].map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'sales-export.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalPages = Math.ceil(sales.totalCount / sales.pageSize)
  const showFrom = (sales.page - 1) * sales.pageSize + 1
  const showTo = Math.min(sales.page * sales.pageSize, sales.totalCount)

  // Determine if row is overdue
  const isOverdue = (item: (typeof sales.items)[0]) => {
    if (item.paymentStatus === 'paid' || item.status === 'cancelled') return false
    const orderDate = new Date(item.orderDate + 'T00:00:00')
    const daysSince = Math.floor((Date.now() - orderDate.getTime()) / 86400000)
    return daysSince > 30
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Sales</h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage and track all business transactions
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 md:w-72 md:flex-none">
              <svg
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                />
              </svg>
              <input
                type="text"
                placeholder="Search orders, customers..."
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
              />
            </div>
            <Link
              href="/orders/new"
              className="inline-flex items-center gap-2 rounded-lg bg-green-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-800 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              New Sale
            </Link>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Total Sales This Month */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
              Total Sales This Month
            </p>
            <p className="mt-2 text-2xl font-semibold text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
              GHS {formatGHS(summary.totalSalesThisMonth)}
            </p>
          </div>

          {/* Pending Payments */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
              Pending Payments
            </p>
            <p className="mt-2 text-2xl font-semibold text-red-600" style={{ fontVariantNumeric: 'tabular-nums' }}>
              GHS {formatGHS(summary.pendingPayments)}
            </p>
          </div>

          {/* Total Customers */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
                  Total Customers
                </p>
                <p className="mt-2 text-2xl font-semibold text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {summary.totalCustomers.toLocaleString()}
                </p>
              </div>
              {customerTrend !== null && (
                <span
                  className={`mt-1 inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                    customerTrend >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}
                >
                  {customerTrend >= 0 ? '↗' : '↘'} {Math.abs(customerTrend)}%
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Tabs + Actions */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Export CSV
            </button>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {isPending && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-green-700 border-t-transparent" />
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Order #
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Customer
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Items
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Total (GHS)
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sales.items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <svg
                          className="h-12 w-12 text-gray-300"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1}
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0c1.1.128 1.907 1.077 1.907 2.185zM9.75 9h.008v.008H9.75V9zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 4.5h.008v.008h-.008V13.5zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
                          />
                        </svg>
                        <p className="text-sm font-medium text-gray-900">No sales yet</p>
                        <p className="text-sm text-gray-500">
                          Record your first sale to get started
                        </p>
                        <Link
                          href="/orders/new"
                          className="mt-2 rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800"
                        >
                          Record your first sale
                        </Link>
                      </div>
                    </td>
                  </tr>
                ) : (
                  sales.items.map((item) => {
                    const overdue = isOverdue(item)
                    const displayStatus = overdue ? 'overdue' : item.paymentStatus
                    return (
                      <tr
                        key={item.id}
                        className="group transition-colors hover:bg-gray-50"
                      >
                        <td className="whitespace-nowrap px-4 py-3.5 text-sm text-gray-500">
                          {formatDate(item.orderDate)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-sm font-medium text-gray-700">
                          {item.orderNumber}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <span
                              className={`inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium ${avatarColor(item.customerName)}`}
                            >
                              {getInitials(item.customerName)}
                            </span>
                            <span className="text-sm font-medium text-gray-900 truncate max-w-[140px]">
                              {item.customerName ?? 'Walk-in'}
                            </span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-sm text-gray-500">
                          {item.itemCount} item{item.itemCount !== 1 ? 's' : ''}
                        </td>
                        <td
                          className="whitespace-nowrap px-4 py-3.5 text-right text-sm font-medium text-gray-900"
                          style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          {formatGHS(item.totalAmount)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              STATUS_STYLES[displayStatus] ?? 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {STATUS_LABELS[displayStatus] ?? displayStatus.toUpperCase()}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Link
                              href={`/sales/${item.id}`}
                              className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                              title="View"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                            </Link>
                            <Link
                              href={`/sales/${item.id}`}
                              className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                              title="Edit"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
                              </svg>
                            </Link>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {sales.totalCount > 0 && (
            <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
              <p className="text-sm text-gray-500">
                Showing {showFrom} to {showTo} of {sales.totalCount} results
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => handlePageChange(sales.page - 1)}
                  disabled={sales.page <= 1}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => handlePageChange(sales.page + 1)}
                  disabled={sales.page >= totalPages}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
