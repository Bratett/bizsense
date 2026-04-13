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
import type { BalanceSheet } from '@/lib/reports/balanceSheet'
import type { AccountBalance } from '@/lib/reports/engine'

// ─── PDF document ─────────────────────────────────────────────────────────────

const pdfStyles = StyleSheet.create({
  page: { padding: 32, fontFamily: 'Helvetica', fontSize: 10 },
  title: { fontSize: 16, marginBottom: 4 },
  subtitle: { fontSize: 9, color: '#6B7280', marginBottom: 16 },
  sectionHead: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    marginTop: 12,
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
  grandTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    marginTop: 6,
    borderTop: '2pt solid #111827',
  },
  note: { fontSize: 8, color: '#9CA3AF', marginTop: 4, fontStyle: 'italic' },
})

function BSDocument({ data }: { data: BalanceSheet }) {
  const { assets, liabilities, equity } = data
  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <Text style={pdfStyles.title}>Balance Sheet</Text>
        <Text style={pdfStyles.subtitle}>As at {data.asOfDate}</Text>

        {/* Assets */}
        <Text style={pdfStyles.sectionHead}>ASSETS</Text>
        <Text style={{ ...pdfStyles.sectionHead, fontSize: 9, marginTop: 4 }}>Current Assets</Text>
        {assets.currentAssets
          .filter((a) => a.netBalance !== 0)
          .map((a) => (
            <View key={a.accountId} style={pdfStyles.row}>
              <Text>{a.accountName}</Text>
              <Text>{formatGhs(a.netBalance)}</Text>
            </View>
          ))}
        <View style={pdfStyles.separator} />
        <View style={pdfStyles.total}>
          <Text style={pdfStyles.bold}>Total Current Assets</Text>
          <Text style={pdfStyles.bold}>
            {formatGhs(assets.currentAssets.reduce((s, a) => s + a.netBalance, 0))}
          </Text>
        </View>

        <Text style={{ ...pdfStyles.sectionHead, fontSize: 9, marginTop: 8 }}>Fixed Assets</Text>
        <View style={pdfStyles.row}>
          <Text>Fixed Assets — Cost</Text>
          <Text>{formatGhs(assets.fixedAssets.cost)}</Text>
        </View>
        <View style={pdfStyles.row}>
          <Text>Less: Accumulated Depreciation</Text>
          <Text>{formatGhs(-assets.fixedAssets.accumulatedDepreciation)}</Text>
        </View>
        <View style={pdfStyles.separator} />
        <View style={pdfStyles.total}>
          <Text style={pdfStyles.bold}>Net Book Value</Text>
          <Text style={pdfStyles.bold}>{formatGhs(assets.fixedAssets.netBookValue)}</Text>
        </View>
        {assets.fixedAssets.accumulatedDepreciation === 0 && (
          <Text style={pdfStyles.note}>
            Accumulated depreciation tracking will be available after monthly depreciation is
            processed.
          </Text>
        )}

        <View style={pdfStyles.grandTotal}>
          <Text style={pdfStyles.bold}>TOTAL ASSETS</Text>
          <Text style={pdfStyles.bold}>{formatGhs(assets.totalAssets)}</Text>
        </View>

        {/* Liabilities */}
        <Text style={pdfStyles.sectionHead}>LIABILITIES</Text>
        <Text style={{ ...pdfStyles.sectionHead, fontSize: 9, marginTop: 4 }}>
          Current Liabilities
        </Text>
        {liabilities.currentLiabilities
          .filter((a) => a.netBalance !== 0)
          .map((a) => (
            <View key={a.accountId} style={pdfStyles.row}>
              <Text>{a.accountName}</Text>
              <Text>{formatGhs(a.netBalance)}</Text>
            </View>
          ))}
        <View style={pdfStyles.separator} />
        <View style={pdfStyles.total}>
          <Text style={pdfStyles.bold}>Total Current Liabilities</Text>
          <Text style={pdfStyles.bold}>
            {formatGhs(liabilities.currentLiabilities.reduce((s, a) => s + a.netBalance, 0))}
          </Text>
        </View>

        <Text style={{ ...pdfStyles.sectionHead, fontSize: 9, marginTop: 8 }}>
          Long-term Liabilities
        </Text>
        {liabilities.longTermLiabilities
          .filter((a) => a.netBalance !== 0)
          .map((a) => (
            <View key={a.accountId} style={pdfStyles.row}>
              <Text>{a.accountName}</Text>
              <Text>{formatGhs(a.netBalance)}</Text>
            </View>
          ))}
        <View style={pdfStyles.separator} />
        <View style={pdfStyles.total}>
          <Text style={pdfStyles.bold}>Total Long-term Liabilities</Text>
          <Text style={pdfStyles.bold}>
            {formatGhs(liabilities.longTermLiabilities.reduce((s, a) => s + a.netBalance, 0))}
          </Text>
        </View>

        <View style={pdfStyles.total}>
          <Text style={pdfStyles.bold}>TOTAL LIABILITIES</Text>
          <Text style={pdfStyles.bold}>{formatGhs(liabilities.totalLiabilities)}</Text>
        </View>

        {/* Equity */}
        <Text style={pdfStyles.sectionHead}>EQUITY</Text>
        {equity.lines.map((a) => (
          <View key={a.accountId} style={pdfStyles.row}>
            <Text>{a.accountName}</Text>
            <Text>{formatGhs(a.netBalance)}</Text>
          </View>
        ))}
        <View style={pdfStyles.row}>
          <Text>Financial Year to Date Profit/(Loss)</Text>
          <Text>{formatGhs(equity.currentPeriodProfit)}</Text>
        </View>
        <View style={pdfStyles.separator} />
        <View style={pdfStyles.total}>
          <Text style={pdfStyles.bold}>TOTAL EQUITY</Text>
          <Text style={pdfStyles.bold}>{formatGhs(equity.totalEquity)}</Text>
        </View>

        <View style={pdfStyles.grandTotal}>
          <Text style={pdfStyles.bold}>TOTAL LIABILITIES + EQUITY</Text>
          <Text style={pdfStyles.bold}>{formatGhs(data.totalLiabilitiesAndEquity)}</Text>
        </View>
      </Page>
    </Document>
  )
}

// ─── Section components ───────────────────────────────────────────────────────

function AccountRow({ account }: { account: AccountBalance }) {
  if (account.netBalance === 0) return null
  return (
    <TableRow>
      <TableCell className="py-1.5 pl-4 text-sm text-muted-foreground w-16">
        {account.accountCode}
      </TableCell>
      <TableCell className="py-1.5 text-sm text-foreground/80">{account.accountName}</TableCell>
      <TableCell className="py-1.5 pr-4 text-right text-sm font-medium tabular-nums text-foreground">
        {formatGhs(account.netBalance)}
      </TableCell>
    </TableRow>
  )
}

function SectionHeader({ label }: { label: string }) {
  return (
    <TableRow className="bg-muted/50">
      <TableCell
        colSpan={3}
        className="py-2 pl-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        {label}
      </TableCell>
    </TableRow>
  )
}

function SubtotalRow({
  label,
  amount,
  bold = false,
}: {
  label: string
  amount: number
  bold?: boolean
}) {
  return (
    <TableRow className={`border-t ${bold ? 'font-bold bg-muted/50' : 'font-semibold'}`}>
      <TableCell className="py-2 pl-4 text-sm text-muted-foreground"></TableCell>
      <TableCell className="py-2 text-sm text-foreground/90">{label}</TableCell>
      <TableCell
        className={`py-2 pr-4 text-right text-sm tabular-nums ${amount < 0 ? 'text-red-600' : 'text-foreground'}`}
      >
        {formatGhs(amount)}
      </TableCell>
    </TableRow>
  )
}

function GrandTotalRow({ label, amount }: { label: string; amount: number }) {
  return (
    <TableRow className="border-t-2 border-foreground/80 bg-muted">
      <TableCell className="py-3 pl-4 text-sm"></TableCell>
      <TableCell className="py-3 text-sm font-bold text-foreground">{label}</TableCell>
      <TableCell
        className={`py-3 pr-4 text-right text-sm font-bold tabular-nums ${amount < 0 ? 'text-red-600' : 'text-foreground'}`}
      >
        {formatGhs(amount)}
      </TableCell>
    </TableRow>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BalanceSheetReport({ data }: { data: BalanceSheet }) {
  const [pdfLoading, setPdfLoading] = useState(false)

  const { assets, liabilities, equity } = data

  const totalCurrentAssets = assets.currentAssets.reduce((s, a) => s + a.netBalance, 0)
  const totalCurrentL = liabilities.currentLiabilities.reduce((s, a) => s + a.netBalance, 0)
  const totalLongTermL = liabilities.longTermLiabilities.reduce((s, a) => s + a.netBalance, 0)

  // ── CSV export ────────────────────────────────────────────────────────────
  const handleCsv = () => {
    const rows: Record<string, string | number>[] = []

    const section = (label: string) =>
      rows.push({ Section: label, 'Account Code': '', Account: '', 'Amount (GHS)': '' })
    const line = (code: string, name: string, amount: number) =>
      rows.push({
        Section: '',
        'Account Code': code,
        Account: name,
        'Amount (GHS)': amount.toFixed(2),
      })
    const subtotal = (label: string, amount: number) =>
      rows.push({
        Section: label,
        'Account Code': '',
        Account: '',
        'Amount (GHS)': amount.toFixed(2),
      })

    section('ASSETS')
    section('Current Assets')
    for (const a of assets.currentAssets.filter((a) => a.netBalance !== 0)) {
      line(a.accountCode, a.accountName, a.netBalance)
    }
    subtotal('Total Current Assets', totalCurrentAssets)
    section('Fixed Assets')
    line('1500', 'Fixed Assets — Cost', assets.fixedAssets.cost)
    line('1510', 'Less: Accumulated Depreciation', -assets.fixedAssets.accumulatedDepreciation)
    subtotal('Net Book Value', assets.fixedAssets.netBookValue)
    subtotal('TOTAL ASSETS', assets.totalAssets)

    section('LIABILITIES')
    section('Current Liabilities')
    for (const a of liabilities.currentLiabilities.filter((a) => a.netBalance !== 0)) {
      line(a.accountCode, a.accountName, a.netBalance)
    }
    subtotal('Total Current Liabilities', totalCurrentL)
    section('Long-term Liabilities')
    for (const a of liabilities.longTermLiabilities.filter((a) => a.netBalance !== 0)) {
      line(a.accountCode, a.accountName, a.netBalance)
    }
    subtotal('Total Long-term Liabilities', totalLongTermL)
    subtotal('TOTAL LIABILITIES', liabilities.totalLiabilities)

    section('EQUITY')
    for (const a of equity.lines) {
      line(a.accountCode, a.accountName, a.netBalance)
    }
    line('', 'Financial Year to Date Profit/(Loss)', equity.currentPeriodProfit)
    subtotal('TOTAL EQUITY', equity.totalEquity)

    subtotal('TOTAL LIABILITIES + EQUITY', data.totalLiabilitiesAndEquity)

    downloadCsv(`balance-sheet-${data.asOfDate}.csv`, rows)
  }

  // ── PDF export ────────────────────────────────────────────────────────────
  const handlePdf = async () => {
    setPdfLoading(true)
    try {
      const blob = await generateReportPdf(BSDocument, data)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `balance-sheet-${data.asOfDate}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setPdfLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Balance equation status */}
      {data.isBalanced ? (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          ✓ Assets = Liabilities + Equity — {formatGhs(assets.totalAssets)}
        </div>
      ) : (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          ⚠ Balance Sheet does not balance — {formatGhs(data.imbalanceAmount)} discrepancy. This
          indicates a data integrity issue. Run integrity check.
        </div>
      )}

      {/* Export controls */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={handleCsv}>
          Download CSV
        </Button>
        <Button variant="outline" onClick={handlePdf} disabled={pdfLoading}>
          {pdfLoading ? 'Generating…' : 'Download PDF'}
        </Button>
      </div>

      {/* Report table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="py-3 pl-4 w-16">Code</TableHead>
                <TableHead className="py-3">Account</TableHead>
                <TableHead className="py-3 pr-4 text-right">Amount (GHS)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* ── ASSETS ─────────────────────────────────────────────────── */}
              <TableRow className="bg-green-50">
                <TableCell
                  colSpan={3}
                  className="py-2.5 pl-4 text-sm font-bold uppercase tracking-wider text-green-900"
                >
                  Assets
                </TableCell>
              </TableRow>

              {/* Current Assets */}
              <SectionHeader label="Current Assets" />
              {assets.currentAssets.map((a) => (
                <AccountRow key={a.accountId} account={a} />
              ))}
              <SubtotalRow label="Total Current Assets" amount={totalCurrentAssets} />

              {/* Fixed Assets */}
              <SectionHeader label="Fixed Assets" />
              <TableRow>
                <TableCell className="py-1.5 pl-4 text-sm text-muted-foreground">1500</TableCell>
                <TableCell className="py-1.5 text-sm text-foreground/80">
                  Fixed Assets — Cost
                </TableCell>
                <TableCell className="py-1.5 pr-4 text-right text-sm font-medium tabular-nums text-foreground">
                  {formatGhs(assets.fixedAssets.cost)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="py-1.5 pl-4 text-sm text-muted-foreground">1510</TableCell>
                <TableCell className="py-1.5 text-sm text-muted-foreground italic">
                  Less: Accumulated Depreciation
                </TableCell>
                <TableCell className="py-1.5 pr-4 text-right text-sm tabular-nums text-muted-foreground">
                  ({formatGhs(assets.fixedAssets.accumulatedDepreciation)})
                </TableCell>
              </TableRow>
              <SubtotalRow label="Net Book Value" amount={assets.fixedAssets.netBookValue} />
              {assets.fixedAssets.accumulatedDepreciation === 0 && (
                <TableRow>
                  <TableCell></TableCell>
                  <TableCell colSpan={2} className="py-1 text-xs text-muted-foreground/60 italic">
                    Accumulated depreciation tracking will be available after monthly depreciation
                    is processed.
                  </TableCell>
                </TableRow>
              )}

              {/* Total Assets */}
              <GrandTotalRow label="TOTAL ASSETS" amount={assets.totalAssets} />

              {/* ── LIABILITIES ────────────────────────────────────────────── */}
              <TableRow className="bg-amber-50">
                <TableCell
                  colSpan={3}
                  className="py-2.5 pl-4 text-sm font-bold uppercase tracking-wider text-amber-900"
                >
                  Liabilities
                </TableCell>
              </TableRow>

              {/* Current Liabilities */}
              <SectionHeader label="Current Liabilities" />
              {liabilities.currentLiabilities.length > 0 ? (
                liabilities.currentLiabilities.map((a) => (
                  <AccountRow key={a.accountId} account={a} />
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="py-2 pl-4 text-sm text-muted-foreground/60 italic"
                  >
                    None
                  </TableCell>
                </TableRow>
              )}
              <SubtotalRow label="Total Current Liabilities" amount={totalCurrentL} />

              {/* Long-term Liabilities */}
              <SectionHeader label="Long-term Liabilities" />
              {liabilities.longTermLiabilities.length > 0 ? (
                liabilities.longTermLiabilities.map((a) => (
                  <AccountRow key={a.accountId} account={a} />
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="py-2 pl-4 text-sm text-muted-foreground/60 italic"
                  >
                    None
                  </TableCell>
                </TableRow>
              )}
              <SubtotalRow label="Total Long-term Liabilities" amount={totalLongTermL} />

              {/* Total Liabilities */}
              <GrandTotalRow label="TOTAL LIABILITIES" amount={liabilities.totalLiabilities} />

              {/* ── EQUITY ─────────────────────────────────────────────────── */}
              <TableRow className="bg-blue-50">
                <TableCell
                  colSpan={3}
                  className="py-2.5 pl-4 text-sm font-bold uppercase tracking-wider text-blue-900"
                >
                  Equity
                </TableCell>
              </TableRow>

              <SectionHeader label="Owner's Equity" />
              {equity.lines.map((a) => (
                <AccountRow key={a.accountId} account={a} />
              ))}
              <TableRow>
                <TableCell className="py-1.5 pl-4 text-sm text-muted-foreground"></TableCell>
                <TableCell className="py-1.5 text-sm text-foreground/80">
                  Financial Year to Date Profit/(Loss)
                </TableCell>
                <TableCell
                  className={`py-1.5 pr-4 text-right text-sm font-medium tabular-nums ${
                    equity.currentPeriodProfit < 0 ? 'text-red-600' : 'text-foreground'
                  }`}
                >
                  {equity.currentPeriodProfit < 0
                    ? `(${formatGhs(Math.abs(equity.currentPeriodProfit))})`
                    : formatGhs(equity.currentPeriodProfit)}
                </TableCell>
              </TableRow>
              <GrandTotalRow label="TOTAL EQUITY" amount={equity.totalEquity} />

              {/* ── TOTAL L + E ─────────────────────────────────────────────── */}
              <TableRow className="border-t-4 border-foreground bg-muted">
                <TableCell className="py-4 pl-4 text-sm"></TableCell>
                <TableCell className="py-4 text-sm font-bold text-foreground uppercase tracking-wide">
                  Total Liabilities + Equity
                </TableCell>
                <TableCell
                  className={`py-4 pr-4 text-right text-sm font-bold tabular-nums ${
                    data.totalLiabilitiesAndEquity < 0 ? 'text-red-600' : 'text-foreground'
                  }`}
                >
                  {formatGhs(data.totalLiabilitiesAndEquity)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
