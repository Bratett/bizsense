'use client'

import { useState } from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { formatGhs } from '@/lib/format'
import { downloadCsv, generateReportPdf } from '@/lib/reports/export'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { ProfitAndLoss, PLLine } from '@/lib/reports/pl'

// ─── PDF document ─────────────────────────────────────────────────────────────

const pdfStyles = StyleSheet.create({
  page: { padding: 32, fontFamily: 'Helvetica', fontSize: 10 },
  title: { fontSize: 16, marginBottom: 4 },
  subtitle: { fontSize: 9, color: '#6B7280', marginBottom: 16 },
  sectionHead: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    marginTop: 10,
    marginBottom: 2,
    color: '#111827',
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  bold: { fontFamily: 'Helvetica-Bold' },
  separator: { borderBottom: '1pt solid #E5E7EB', marginVertical: 4 },
  total: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    marginTop: 2,
  },
})

function PLDocument({ data }: { data: ProfitAndLoss }) {
  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <Text style={pdfStyles.title}>Profit &amp; Loss</Text>
        <Text style={pdfStyles.subtitle}>
          {data.period.from} to {data.period.to}
        </Text>

        <Text style={pdfStyles.sectionHead}>REVENUE</Text>
        {data.revenue.lines.map((l) => (
          <View key={l.accountId} style={pdfStyles.row}>
            <Text>{l.accountName}</Text>
            <Text>{formatGhs(l.netBalance)}</Text>
          </View>
        ))}
        <View style={pdfStyles.separator} />
        <View style={pdfStyles.total}>
          <Text style={pdfStyles.bold}>Total Revenue</Text>
          <Text style={pdfStyles.bold}>{formatGhs(data.revenue.total)}</Text>
        </View>

        <Text style={pdfStyles.sectionHead}>COST OF GOODS SOLD</Text>
        {data.cogs.lines.map((l) => (
          <View key={l.accountId} style={pdfStyles.row}>
            <Text>{l.accountName}</Text>
            <Text>{formatGhs(l.netBalance)}</Text>
          </View>
        ))}
        <View style={pdfStyles.separator} />
        <View style={pdfStyles.total}>
          <Text style={pdfStyles.bold}>Gross Profit</Text>
          <Text style={pdfStyles.bold}>{formatGhs(data.grossProfit)}</Text>
        </View>

        <Text style={pdfStyles.sectionHead}>OPERATING EXPENSES</Text>
        {data.expenses.lines.map((l) => (
          <View key={l.accountId} style={pdfStyles.row}>
            <Text>{l.accountName}</Text>
            <Text>{formatGhs(l.netBalance)}</Text>
          </View>
        ))}
        <View style={pdfStyles.separator} />
        <View style={pdfStyles.total}>
          <Text style={pdfStyles.bold}>Net Profit / (Loss)</Text>
          <Text style={pdfStyles.bold}>{formatGhs(data.netProfit)}</Text>
        </View>
      </Page>
    </Document>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(n: number) {
  return `${n >= 0 ? '' : ''}${n.toFixed(1)}%`
}

function changePct(current: number, prior: number) {
  if (prior === 0) return null
  return ((current - prior) / prior) * 100
}

// ─── Shared line row ──────────────────────────────────────────────────────────

function LineRow({
  line,
  hasPrior,
  showZero,
}: {
  line: PLLine
  hasPrior: boolean
  showZero: boolean
}) {
  if (line.netBalance === 0 && !showZero) return null
  const isZero = line.netBalance === 0

  return (
    <TableRow className={isZero ? 'opacity-40' : ''}>
      <TableCell className="py-1.5 pl-4 text-sm text-muted-foreground w-16">
        {line.accountCode}
      </TableCell>
      <TableCell className="py-1.5 text-sm text-foreground/80">{line.accountName}</TableCell>
      <TableCell className="py-1.5 pr-4 text-right text-sm font-medium tabular-nums text-foreground">
        {formatGhs(line.netBalance)}
      </TableCell>
      {hasPrior && (
        <TableCell className="py-1.5 pr-4 text-right text-sm tabular-nums text-amber-600">
          {line.priorNetBalance !== undefined ? formatGhs(line.priorNetBalance) : '—'}
        </TableCell>
      )}
    </TableRow>
  )
}

// ─── Section ──────────────────────────────────────────────────────────────────

function Section({
  title,
  lines,
  total,
  priorTotal,
  hasPrior,
  showZero,
}: {
  title: string
  lines: PLLine[]
  total: number
  priorTotal?: number
  hasPrior: boolean
  showZero: boolean
}) {
  return (
    <>
      <TableRow className="bg-muted/50">
        <TableCell
          colSpan={hasPrior ? 4 : 3}
          className="py-2 pl-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          {title}
        </TableCell>
      </TableRow>
      {lines.map((line) => (
        <LineRow key={line.accountId} line={line} hasPrior={hasPrior} showZero={showZero} />
      ))}
      <TableRow className="border-t font-semibold">
        <TableCell className="py-2 pl-4 text-sm text-muted-foreground"></TableCell>
        <TableCell className="py-2 text-sm text-foreground/80">Total {title}</TableCell>
        <TableCell className="py-2 pr-4 text-right text-sm tabular-nums text-foreground">
          {formatGhs(total)}
        </TableCell>
        {hasPrior && (
          <TableCell className="py-2 pr-4 text-right text-sm tabular-nums text-amber-600">
            {priorTotal !== undefined ? formatGhs(priorTotal) : '—'}
          </TableCell>
        )}
      </TableRow>
    </>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PLReport({ data }: { data: ProfitAndLoss }) {
  const [showZero, setShowZero] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)

  const hasPrior = data.hasPrior

  // ── CSV export ───────────────────────────────────────────────────────────
  const handleCsv = () => {
    const rows: Record<string, string | number>[] = []

    const addSection = (title: string, lines: PLLine[]) => {
      rows.push({
        Section: title,
        'Account Code': '',
        Account: '',
        'This Period (GHS)': '',
        'Prior Period (GHS)': '',
      })
      for (const l of lines) {
        rows.push({
          Section: '',
          'Account Code': l.accountCode,
          Account: l.accountName,
          'This Period (GHS)': l.netBalance.toFixed(2),
          'Prior Period (GHS)': hasPrior ? (l.priorNetBalance ?? 0).toFixed(2) : '',
        })
      }
    }

    addSection('Revenue', data.revenue.lines)
    rows.push({
      Section: 'Total Revenue',
      'Account Code': '',
      Account: '',
      'This Period (GHS)': data.revenue.total.toFixed(2),
      'Prior Period (GHS)': hasPrior ? (data.revenue.priorTotal ?? 0).toFixed(2) : '',
    })
    addSection('Cost of Goods Sold', data.cogs.lines)
    rows.push({
      Section: 'Gross Profit',
      'Account Code': '',
      Account: '',
      'This Period (GHS)': data.grossProfit.toFixed(2),
      'Prior Period (GHS)': hasPrior ? (data.priorGrossProfit ?? 0).toFixed(2) : '',
    })
    addSection('Operating Expenses', data.expenses.lines)
    rows.push({
      Section: 'Net Profit / (Loss)',
      'Account Code': '',
      Account: '',
      'This Period (GHS)': data.netProfit.toFixed(2),
      'Prior Period (GHS)': hasPrior ? (data.priorNetProfit ?? 0).toFixed(2) : '',
    })

    downloadCsv(`pl-${data.period.from}-to-${data.period.to}.csv`, rows)
  }

  // ── PDF export ────────────────────────────────────────────────────────────
  const handlePdf = async () => {
    setPdfLoading(true)
    try {
      const blob = await generateReportPdf(PLDocument, data)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `pl-${data.period.from}-to-${data.period.to}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setPdfLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Net loss banner */}
      {data.netProfit < 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This period shows a net loss of {formatGhs(Math.abs(data.netProfit))}. Review your
          expenses and sales mix.
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showZero}
            onChange={(e) => setShowZero(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
          />
          Show zero-balance accounts
        </label>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleCsv}>
            Download CSV
          </Button>
          <Button variant="outline" onClick={handlePdf} disabled={pdfLoading}>
            {pdfLoading ? 'Generating…' : 'Download PDF'}
          </Button>
        </div>
      </div>

      {/* Report table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="py-3 pl-4 w-16">Code</TableHead>
                <TableHead className="py-3">Account</TableHead>
                <TableHead className="py-3 pr-4 text-right">
                  {hasPrior ? 'This Period' : 'Amount (GHS)'}
                </TableHead>
                {hasPrior && (
                  <TableHead className="py-3 pr-4 text-right text-amber-600">
                    Prior Period
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Revenue */}
              <Section
                title="Revenue"
                lines={data.revenue.lines}
                total={data.revenue.total}
                priorTotal={data.revenue.priorTotal}
                hasPrior={hasPrior}
                showZero={showZero}
              />

              {/* COGS */}
              <Section
                title="Cost of Goods Sold"
                lines={data.cogs.lines}
                total={data.cogs.total}
                priorTotal={data.cogs.priorTotal}
                hasPrior={hasPrior}
                showZero={showZero}
              />

              {/* Gross Profit */}
              <TableRow className="bg-green-50 font-semibold">
                <TableCell className="py-2.5 pl-4 text-sm"></TableCell>
                <TableCell className="py-2.5 text-sm text-foreground">Gross Profit</TableCell>
                <TableCell
                  className={`py-2.5 pr-4 text-right text-sm tabular-nums ${data.grossProfit < 0 ? 'text-red-600' : 'text-foreground'}`}
                >
                  {formatGhs(data.grossProfit)}
                </TableCell>
                {hasPrior && (
                  <TableCell className="py-2.5 pr-4 text-right text-sm tabular-nums text-amber-600">
                    {data.priorGrossProfit !== undefined ? formatGhs(data.priorGrossProfit) : '—'}
                  </TableCell>
                )}
              </TableRow>
              {/* Gross Margin % */}
              <TableRow className="bg-green-50">
                <TableCell className="pb-2 pl-4 text-xs text-muted-foreground/60"></TableCell>
                <TableCell className="pb-2 text-xs text-muted-foreground">Gross Margin</TableCell>
                <TableCell className="pb-2 pr-4 text-right text-xs tabular-nums text-muted-foreground">
                  {pct(data.grossMarginPct)}
                </TableCell>
                {hasPrior && (
                  <TableCell className="pb-2 pr-4 text-right text-xs tabular-nums text-amber-500">
                    {data.priorGrossProfit !== undefined && data.revenue.priorTotal
                      ? pct(
                          Math.round((data.priorGrossProfit / data.revenue.priorTotal) * 10_000) /
                            100,
                        )
                      : '—'}
                  </TableCell>
                )}
              </TableRow>

              {/* Expenses */}
              <Section
                title="Operating Expenses"
                lines={data.expenses.lines}
                total={data.expenses.total}
                priorTotal={data.expenses.priorTotal}
                hasPrior={hasPrior}
                showZero={showZero}
              />

              {/* Net Profit */}
              <TableRow className="border-t-2 border-gray-300 bg-muted/50">
                <TableCell className="py-3 pl-4 text-sm"></TableCell>
                <TableCell className="py-3 text-sm font-bold text-foreground">
                  Net {data.netProfit >= 0 ? 'Profit' : 'Loss'}
                </TableCell>
                <TableCell
                  className={`py-3 pr-4 text-right text-sm font-bold tabular-nums ${data.netProfit < 0 ? 'text-red-600' : 'text-foreground'}`}
                >
                  {formatGhs(data.netProfit)}
                </TableCell>
                {hasPrior && (
                  <TableCell
                    className={`py-3 pr-4 text-right text-sm font-bold tabular-nums ${
                      (data.priorNetProfit ?? 0) < 0 ? 'text-red-500' : 'text-amber-600'
                    }`}
                  >
                    {data.priorNetProfit !== undefined ? formatGhs(data.priorNetProfit) : '—'}
                  </TableCell>
                )}
              </TableRow>

              {/* Change % when comparing */}
              {hasPrior && data.priorNetProfit !== undefined && data.priorNetProfit !== 0 && (
                <TableRow className="bg-muted/50">
                  <TableCell></TableCell>
                  <TableCell className="pb-2 text-xs text-muted-foreground/60">
                    Change vs prior
                  </TableCell>
                  <TableCell
                    className="pb-2 pr-4 text-right text-xs tabular-nums text-muted-foreground"
                    colSpan={2}
                  >
                    {(() => {
                      const c = changePct(data.netProfit, data.priorNetProfit!)
                      if (c === null) return '—'
                      return `${c >= 0 ? '+' : ''}${c.toFixed(1)}%`
                    })()}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
