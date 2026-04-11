'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { formatGhs } from '@/lib/format'
import { downloadCsv, generateReportPdf } from '@/lib/reports/export'
import type { SalesReport, SalesReportLine, SalesGroupBy } from '@/lib/reports/sales'

// ─── PDF document ─────────────────────────────────────────────────────────────

const pdfStyles = StyleSheet.create({
  page:     { padding: 32, fontFamily: 'Helvetica', fontSize: 9 },
  title:    { fontSize: 16, marginBottom: 4 },
  subtitle: { fontSize: 9, color: '#6B7280', marginBottom: 16 },
  row:      { flexDirection: 'row', paddingVertical: 2, borderBottom: '0.5pt solid #F3F4F6' },
  header:   { flexDirection: 'row', borderBottom: '1pt solid #E5E7EB', paddingBottom: 4, marginBottom: 4 },
  bold:     { fontFamily: 'Helvetica-Bold' },
  col1:     { width: '30%' },
  col2:     { width: '10%', textAlign: 'right' },
  col3:     { width: '10%', textAlign: 'right' },
  col4:     { width: '15%', textAlign: 'right' },
  col5:     { width: '15%', textAlign: 'right' },
  col6:     { width: '10%', textAlign: 'right' },
  col7:     { width: '10%', textAlign: 'right' },
})

function SalesDocument({ data }: { data: SalesReport }) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={pdfStyles.page}>
        <Text style={pdfStyles.title}>Sales Report — {data.groupBy}</Text>
        <Text style={pdfStyles.subtitle}>
          {data.period.from} to {data.period.to}
        </Text>
        <View style={pdfStyles.header}>
          <Text style={[pdfStyles.col1, pdfStyles.bold]}>Group</Text>
          <Text style={[pdfStyles.col2, pdfStyles.bold]}>Orders</Text>
          <Text style={[pdfStyles.col3, pdfStyles.bold]}>Qty</Text>
          <Text style={[pdfStyles.col4, pdfStyles.bold]}>Revenue</Text>
          <Text style={[pdfStyles.col5, pdfStyles.bold]}>COGS</Text>
          <Text style={[pdfStyles.col6, pdfStyles.bold]}>Gross Profit</Text>
          <Text style={[pdfStyles.col7, pdfStyles.bold]}>Margin</Text>
        </View>
        {data.lines.map(l => (
          <View key={l.groupKey} style={pdfStyles.row}>
            <Text style={pdfStyles.col1}>{l.label}</Text>
            <Text style={pdfStyles.col2}>{l.orderCount}</Text>
            <Text style={pdfStyles.col3}>{l.quantitySold}</Text>
            <Text style={pdfStyles.col4}>{l.revenue.toFixed(2)}</Text>
            <Text style={pdfStyles.col5}>{l.cogsTotal.toFixed(2)}</Text>
            <Text style={pdfStyles.col6}>{l.grossProfit.toFixed(2)}</Text>
            <Text style={pdfStyles.col7}>{(l.grossMargin * 100).toFixed(1)}%</Text>
          </View>
        ))}
      </Page>
    </Document>
  )
}

// ─── Group By tabs ────────────────────────────────────────────────────────────

const GROUP_TABS: { key: SalesGroupBy; label: string }[] = [
  { key: 'product',  label: 'Product'  },
  { key: 'customer', label: 'Customer' },
  { key: 'day',      label: 'Day'      },
  { key: 'week',     label: 'Week'     },
  { key: 'month',    label: 'Month'    },
]

function GroupByTabs({ current }: { current: SalesGroupBy }) {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const navigate = (groupBy: SalesGroupBy) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('groupBy', groupBy)
    router.push(`?${params.toString()}`)
  }

  return (
    <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1 w-fit">
      {GROUP_TABS.map(tab => (
        <button
          key={tab.key}
          onClick={() => navigate(tab.key)}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            current === tab.key
              ? 'bg-gray-900 text-white'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

// ─── Table columns by groupBy ─────────────────────────────────────────────────

function TableHeader({ groupBy }: { groupBy: SalesGroupBy }) {
  const isProduct  = groupBy === 'product'
  const isCustomer = groupBy === 'customer'

  return (
    <thead>
      <tr className="border-b border-gray-200 bg-gray-50">
        <th className="py-3 pl-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
          {isProduct ? 'Product' : isCustomer ? 'Customer' : 'Period'}
        </th>
        {isProduct && (
          <th className="py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">SKU</th>
        )}
        <th className="py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 pr-4">Orders</th>
        {(isProduct || !isCustomer) && (
          <th className="py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 pr-4">Qty Sold</th>
        )}
        <th className="py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 pr-4">Revenue (GHS)</th>
        <th className="py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 pr-4">COGS (GHS)</th>
        <th className="py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 pr-4">Gross Profit</th>
        <th className="py-3 pr-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Margin</th>
      </tr>
    </thead>
  )
}

function TableRow({
  line,
  groupBy,
  productSkuMap,
}: {
  line:          SalesReportLine
  groupBy:       SalesGroupBy
  productSkuMap: Map<string, string | null>
}) {
  const isProduct  = groupBy === 'product'
  const isCustomer = groupBy === 'customer'
  const isTimeGroup = !isProduct && !isCustomer

  const canNavigate = line.entityId && line.entityId !== 'walk-in'
  const href =
    isProduct  ? `/inventory/${line.entityId}` :
    isCustomer ? `/customers/${line.entityId}` : null

  const labelCell = href && canNavigate ? (
    <Link href={href} className="font-medium text-green-700 hover:underline">
      {line.label}
    </Link>
  ) : (
    <span className="text-gray-700">{line.label}</span>
  )

  return (
    <tr className="hover:bg-gray-50">
      <td className="py-2.5 pl-4 text-sm">{labelCell}</td>
      {isProduct && (
        <td className="py-2.5 text-sm text-gray-400 font-mono">
          {line.entityId ? (productSkuMap.get(line.entityId) ?? '—') : '—'}
        </td>
      )}
      <td className="py-2.5 pr-4 text-right text-sm text-gray-600 tabular-nums">{line.orderCount}</td>
      {(isProduct || isTimeGroup) && (
        <td className="py-2.5 pr-4 text-right text-sm text-gray-600 tabular-nums">
          {line.quantitySold % 1 === 0 ? line.quantitySold : line.quantitySold.toFixed(2)}
        </td>
      )}
      <td className="py-2.5 pr-4 text-right text-sm tabular-nums text-gray-900">{formatGhs(line.revenue)}</td>
      <td className="py-2.5 pr-4 text-right text-sm tabular-nums text-gray-600">{formatGhs(line.cogsTotal)}</td>
      <td className={`py-2.5 pr-4 text-right text-sm tabular-nums ${line.grossProfit < 0 ? 'text-red-600' : 'text-gray-900'}`}>
        {formatGhs(line.grossProfit)}
      </td>
      <td className="py-2.5 pr-4 text-right text-sm tabular-nums text-gray-600">
        {(line.grossMargin * 100).toFixed(1)}%
      </td>
    </tr>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SalesReportTable({ data }: { data: SalesReport }) {
  const [pdfLoading, setPdfLoading] = useState(false)

  // Build a quick SKU lookup from the lines if groupBy=product
  const productSkuMap = new Map<string, string | null>()

  const handleCsv = () => {
    const rows = data.lines.map(l => ({
      Group:               l.groupKey,
      Label:               l.label,
      Orders:              l.orderCount,
      'Qty Sold':          l.quantitySold,
      'Revenue (GHS)':     l.revenue.toFixed(2),
      'COGS (GHS)':        l.cogsTotal.toFixed(2),
      'Gross Profit (GHS)':l.grossProfit.toFixed(2),
      'Margin %':          (l.grossMargin * 100).toFixed(1),
    }))
    downloadCsv(`sales-${data.groupBy}-${data.period.from}-to-${data.period.to}.csv`, rows)
  }

  const handlePdf = async () => {
    setPdfLoading(true)
    try {
      const blob = await generateReportPdf(SalesDocument, data)
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `sales-${data.groupBy}-${data.period.from}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setPdfLoading(false)
    }
  }

  const { totals } = data

  return (
    <div className="space-y-4">
      {/* Group By selector */}
      <GroupByTabs current={data.groupBy} />

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total Orders',  value: String(totals.orderCount)                       },
          { label: 'Revenue',       value: formatGhs(totals.revenue)                        },
          { label: 'Gross Profit',  value: formatGhs(totals.grossProfit)                    },
          { label: 'Gross Margin',  value: `${(totals.grossMargin * 100).toFixed(1)}%`      },
        ].map(card => (
          <div key={card.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{card.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-gray-900">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Download buttons */}
      <div className="flex justify-end gap-2">
        <button onClick={handleCsv} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          Download CSV
        </button>
        <button onClick={handlePdf} disabled={pdfLoading} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          {pdfLoading ? 'Generating…' : 'Download PDF'}
        </button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {data.lines.length === 0 ? (
          <p className="py-16 text-center text-sm text-gray-400">
            No fulfilled orders in this period.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <TableHeader groupBy={data.groupBy} />
              <tbody className="divide-y divide-gray-100">
                {data.lines.map(line => (
                  <TableRow
                    key={line.groupKey}
                    line={line}
                    groupBy={data.groupBy}
                    productSkuMap={productSkuMap}
                  />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                  <td className="py-3 pl-4 text-sm text-gray-700">
                    {data.groupBy === 'product' ? 'TOTAL' : 'TOTAL'}
                  </td>
                  {data.groupBy === 'product' && <td></td>}
                  <td className="py-3 pr-4 text-right text-sm tabular-nums text-gray-700">{totals.orderCount}</td>
                  {(data.groupBy === 'product' || data.groupBy === 'day' || data.groupBy === 'week' || data.groupBy === 'month') && (
                    <td className="py-3 pr-4 text-right text-sm tabular-nums text-gray-700">
                      {totals.quantitySold % 1 === 0 ? totals.quantitySold : totals.quantitySold.toFixed(2)}
                    </td>
                  )}
                  <td className="py-3 pr-4 text-right text-sm tabular-nums text-gray-900">{formatGhs(totals.revenue)}</td>
                  <td className="py-3 pr-4 text-right text-sm tabular-nums text-gray-600">{formatGhs(totals.cogsTotal)}</td>
                  <td className="py-3 pr-4 text-right text-sm tabular-nums text-gray-900">{formatGhs(totals.grossProfit)}</td>
                  <td className="py-3 pr-4 text-right text-sm tabular-nums text-gray-600">
                    {(totals.grossMargin * 100).toFixed(1)}%
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
