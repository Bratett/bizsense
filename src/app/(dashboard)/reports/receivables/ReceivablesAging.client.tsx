'use client'

import { useState, useTransition } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { getReceivablesAging, type ReceivablesAgingData } from '@/actions/sales'

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatGHS(amount: number): string {
  if (amount >= 1000) {
    return `${(amount / 1000).toFixed(1)}k`
  }
  return amount.toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatGHSFull(amount: number): string {
  return amount.toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

const AVATAR_COLORS = [
  'bg-green-100 text-green-700',
  'bg-amber-100 text-amber-700',
  'bg-blue-100 text-blue-700',
  'bg-purple-100 text-purple-700',
  'bg-pink-100 text-pink-700',
  'bg-teal-100 text-teal-700',
]

function avatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

// ─── Constants ──────────────────────────────────────────────────────────────

const BUCKET_LABELS = [
  { key: 'current' as const, label: 'Current', color: '#16A34A' },
  { key: 'days1_30' as const, label: '1-30 Days', color: '#65A30D' },
  { key: 'days31_60' as const, label: '31-60 Days', color: '#F59E0B' },
  { key: 'days61_90' as const, label: '61-90 Days', color: '#EA580C' },
  { key: 'days90Plus' as const, label: '90+ Days', color: '#DC2626' },
]

const BUCKET_BORDER_COLORS: Record<string, string> = {
  current: 'border-t-green-500',
  days1_30: 'border-t-lime-500',
  days31_60: 'border-t-amber-500',
  days61_90: 'border-t-orange-500',
  days90Plus: 'border-t-red-500',
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ReceivablesAging({ initialData }: { initialData: ReceivablesAgingData }) {
  const [data, setData] = useState(initialData)
  const [search, setSearch] = useState('')
  const [isPending, startTransition] = useTransition()

  const handleRefresh = () => {
    startTransition(async () => {
      const result = await getReceivablesAging()
      setData(result)
    })
  }

  const handleExportCSV = () => {
    const headers = [
      'Customer',
      'Total Balance',
      'Current',
      '1-30 Days',
      '31-60 Days',
      '61-90 Days',
      '90+ Days',
    ]
    const csvRows = data.customerLedger.map((c) => [
      c.customerName,
      c.totalBalance.toFixed(2),
      c.current.toFixed(2),
      c.days1_30.toFixed(2),
      c.days31_60.toFixed(2),
      c.days61_90.toFixed(2),
      c.days90Plus.toFixed(2),
    ])
    const csv = [headers, ...csvRows].map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'receivables-aging.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // Prepare stacked bar chart data
  const total = data.totalReceivables || 1
  const stackedData = [
    {
      name: 'Aging',
      current: data.agingDistribution.current,
      days1_30: data.agingDistribution.days1_30,
      days31_60: data.agingDistribution.days31_60,
      days61_90: data.agingDistribution.days61_90,
      days90Plus: data.agingDistribution.days90Plus,
    },
  ]

  const percentages = {
    current: Math.round((data.agingDistribution.current / total) * 100),
    days1_30: Math.round((data.agingDistribution.days1_30 / total) * 100),
    days31_60: Math.round((data.agingDistribution.days31_60 / total) * 100),
    days61_90: Math.round((data.agingDistribution.days61_90 / total) * 100),
    days90Plus: Math.round((data.agingDistribution.days90Plus / total) * 100),
  }

  // Client-side search filter
  const filteredLedger = data.customerLedger.filter((c) =>
    search ? c.customerName.toLowerCase().includes(search.toLowerCase()) : true,
  )

  const getActionButton = (customer: (typeof data.customerLedger)[0]) => {
    if (customer.days90Plus > 0) {
      return (
        <button
          onClick={() => {
            if (customer.customerPhone) {
              const msg = `URGENT: Dear ${customer.customerName}, your account has an overdue balance of GHS ${formatGHSFull(customer.totalBalance)}. Please arrange payment immediately to avoid service interruption.`
              window.open(
                `https://wa.me/${customer.customerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`,
                '_blank',
              )
            }
          }}
          className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-200 transition-colors"
        >
          ▸ CRITICAL
        </button>
      )
    }
    if (customer.days31_60 > 0 || customer.days61_90 > 0) {
      return (
        <button
          onClick={() => {
            if (customer.customerPhone) {
              const msg = `Hi ${customer.customerName}, this is a friendly reminder that you have an outstanding balance of GHS ${formatGHSFull(customer.totalBalance)}. Kindly arrange payment at your earliest convenience. Thank you!`
              window.open(
                `https://wa.me/${customer.customerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`,
                '_blank',
              )
            }
          }}
          className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-3 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-200 transition-colors"
        >
          ▸ REMINDER
        </button>
      )
    }
    return null
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.history.back()}
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
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
            </button>
            <h1 className="text-2xl font-semibold text-gray-900">Receivables Aging</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {isPending ? 'Refreshing...' : 'This Month'}
            </button>
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                />
              </svg>
              PDF
            </button>
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 0v1.5c0 .621-.504 1.125-1.125 1.125"
                />
              </svg>
              CSV
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Total Receivables */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
              Total Receivables
            </p>
            <p
              className="mt-2 text-2xl font-semibold text-gray-900"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              GHS {formatGHSFull(data.totalReceivables)}
            </p>
          </div>

          {/* Avg Collection Period */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
              Avg. Collection Period
            </p>
            <p
              className="mt-2 text-2xl font-semibold text-gray-900"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {data.avgCollectionPeriodDays} Days
            </p>
            {data.avgCollectionPeriodDays > 30 && (
              <p className="mt-1 text-xs font-medium text-red-600">
                ▲ {data.avgCollectionPeriodDays - 30} days above target
              </p>
            )}
          </div>

          {/* Total Overdue */}
          <div className="rounded-xl border-2 border-red-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
              Total Overdue
            </p>
            <p
              className="mt-2 text-2xl font-semibold text-red-600"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              GHS {formatGHSFull(data.totalOverdue)}
            </p>
            <p className="mt-1 text-xs text-gray-500">{data.overduePercentage}% of total balance</p>
          </div>
        </div>

        {/* Aging Distribution */}
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Aging Distribution</h2>
          <p className="mb-4 text-sm text-gray-500">
            Analysis of outstanding balances by time period
          </p>

          {/* Legend */}
          <div className="mb-4 flex flex-wrap items-center gap-4">
            {BUCKET_LABELS.map((b) => (
              <div key={b.key} className="flex items-center gap-1.5 text-xs text-gray-600">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: b.color }}
                />
                {b.label}
              </div>
            ))}
          </div>

          {/* Stacked bar */}
          {data.totalReceivables > 0 ? (
            <>
              <div className="h-12 overflow-hidden rounded-full">
                <div className="flex h-full">
                  {BUCKET_LABELS.map((b) => {
                    const pct = percentages[b.key]
                    if (pct === 0) return null
                    return (
                      <div
                        key={b.key}
                        className="flex items-center justify-center text-xs font-semibold text-white"
                        style={{
                          backgroundColor: b.color,
                          width: `${Math.max(pct, 3)}%`,
                        }}
                      >
                        {pct >= 5 ? `${pct}%` : ''}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Bucket detail cards */}
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                {BUCKET_LABELS.map((b) => (
                  <div
                    key={b.key}
                    className={`rounded-lg border border-gray-200 border-t-4 bg-white p-3 ${BUCKET_BORDER_COLORS[b.key]}`}
                  >
                    <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
                      {b.label}
                    </p>
                    <p
                      className="mt-1 text-base font-semibold text-gray-900"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      GHS {formatGHS(data.agingDistribution[b.key])}
                    </p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="py-8 text-center text-sm text-gray-400">No outstanding receivables</div>
          )}
        </div>

        {/* Detailed Ledger */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-gray-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Detailed Ledger</h2>
            <div className="relative sm:w-64">
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
                placeholder="Search customer..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Customer Name
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Total Balance
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Current
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                    1-30
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                    31-60
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                    61-90
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                    90+
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredLedger.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">
                      {search ? 'No customers match your search' : 'No outstanding receivables'}
                    </td>
                  </tr>
                ) : (
                  filteredLedger.map((customer) => (
                    <tr key={customer.customerId} className="hover:bg-gray-50">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium ${avatarColor(customer.customerName)}`}
                          >
                            {getInitials(customer.customerName)}
                          </span>
                          <span className="text-sm font-medium text-gray-900">
                            {customer.customerName}
                          </span>
                        </div>
                      </td>
                      <td
                        className="whitespace-nowrap px-4 py-3.5 text-right text-sm font-semibold text-gray-900"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        GHS {formatGHSFull(customer.totalBalance)}
                      </td>
                      <td
                        className="whitespace-nowrap px-4 py-3.5 text-right text-sm text-gray-600"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {customer.current > 0 ? formatGHSFull(customer.current) : '—'}
                      </td>
                      <td
                        className="whitespace-nowrap px-4 py-3.5 text-right text-sm text-gray-600"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {customer.days1_30 > 0 ? formatGHSFull(customer.days1_30) : '—'}
                      </td>
                      <td
                        className="whitespace-nowrap px-4 py-3.5 text-right text-sm text-gray-600"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {customer.days31_60 > 0 ? formatGHSFull(customer.days31_60) : '—'}
                      </td>
                      <td
                        className="whitespace-nowrap px-4 py-3.5 text-right text-sm text-gray-600"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {customer.days61_90 > 0 ? formatGHSFull(customer.days61_90) : '—'}
                      </td>
                      <td
                        className="whitespace-nowrap px-4 py-3.5 text-right text-sm"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {customer.days90Plus > 0 ? (
                          <span className="font-semibold text-red-600">
                            {formatGHSFull(customer.days90Plus)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-center">
                        {getActionButton(customer)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  )
}
