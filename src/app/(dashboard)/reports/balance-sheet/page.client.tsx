'use client'

import { useState } from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { formatGhs } from '@/lib/format'
import { downloadCsv, generateReportPdf } from '@/lib/reports/export'
import type { BalanceSheet } from '@/lib/reports/balanceSheet'
import type { AccountBalance } from '@/lib/reports/engine'

// ─── PDF document ─────────────────────────────────────────────────────────────

const pdfStyles = StyleSheet.create({
  page:        { padding: 32, fontFamily: 'Helvetica', fontSize: 10 },
  title:       { fontSize: 16, marginBottom: 4 },
  subtitle:    { fontSize: 9, color: '#6B7280', marginBottom: 16 },
  sectionHead: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginTop: 12, marginBottom: 2, color: '#111827' },
  row:         { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  bold:        { fontFamily: 'Helvetica-Bold' },
  separator:   { borderBottom: '1pt solid #E5E7EB', marginVertical: 4 },
  total:       { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, marginTop: 2 },
  grandTotal:  { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, marginTop: 6, borderTop: '2pt solid #111827' },
  note:        { fontSize: 8, color: '#9CA3AF', marginTop: 4, fontStyle: 'italic' },
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
        {assets.currentAssets.filter(a => a.netBalance !== 0).map(a => (
          <View key={a.accountId} style={pdfStyles.row}>
            <Text>{a.accountName}</Text>
            <Text>{formatGhs(a.netBalance)}</Text>
          </View>
        ))}
        <View style={pdfStyles.separator} />
        <View style={pdfStyles.total}>
          <Text style={pdfStyles.bold}>Total Current Assets</Text>
          <Text style={pdfStyles.bold}>{formatGhs(assets.currentAssets.reduce((s,a)=>s+a.netBalance,0))}</Text>
        </View>

        <Text style={{ ...pdfStyles.sectionHead, fontSize: 9, marginTop: 8 }}>Fixed Assets</Text>
        <View style={pdfStyles.row}><Text>Fixed Assets — Cost</Text><Text>{formatGhs(assets.fixedAssets.cost)}</Text></View>
        <View style={pdfStyles.row}><Text>Less: Accumulated Depreciation</Text><Text>{formatGhs(-assets.fixedAssets.accumulatedDepreciation)}</Text></View>
        <View style={pdfStyles.separator} />
        <View style={pdfStyles.total}>
          <Text style={pdfStyles.bold}>Net Book Value</Text>
          <Text style={pdfStyles.bold}>{formatGhs(assets.fixedAssets.netBookValue)}</Text>
        </View>
        {assets.fixedAssets.accumulatedDepreciation === 0 && (
          <Text style={pdfStyles.note}>
            Accumulated depreciation tracking will be available after monthly depreciation is processed.
          </Text>
        )}

        <View style={pdfStyles.grandTotal}>
          <Text style={pdfStyles.bold}>TOTAL ASSETS</Text>
          <Text style={pdfStyles.bold}>{formatGhs(assets.totalAssets)}</Text>
        </View>

        {/* Liabilities */}
        <Text style={pdfStyles.sectionHead}>LIABILITIES</Text>
        <Text style={{ ...pdfStyles.sectionHead, fontSize: 9, marginTop: 4 }}>Current Liabilities</Text>
        {liabilities.currentLiabilities.filter(a => a.netBalance !== 0).map(a => (
          <View key={a.accountId} style={pdfStyles.row}>
            <Text>{a.accountName}</Text>
            <Text>{formatGhs(a.netBalance)}</Text>
          </View>
        ))}
        <View style={pdfStyles.separator} />
        <View style={pdfStyles.total}>
          <Text style={pdfStyles.bold}>Total Current Liabilities</Text>
          <Text style={pdfStyles.bold}>{formatGhs(liabilities.currentLiabilities.reduce((s,a)=>s+a.netBalance,0))}</Text>
        </View>

        <Text style={{ ...pdfStyles.sectionHead, fontSize: 9, marginTop: 8 }}>Long-term Liabilities</Text>
        {liabilities.longTermLiabilities.filter(a => a.netBalance !== 0).map(a => (
          <View key={a.accountId} style={pdfStyles.row}>
            <Text>{a.accountName}</Text>
            <Text>{formatGhs(a.netBalance)}</Text>
          </View>
        ))}
        <View style={pdfStyles.separator} />
        <View style={pdfStyles.total}>
          <Text style={pdfStyles.bold}>Total Long-term Liabilities</Text>
          <Text style={pdfStyles.bold}>{formatGhs(liabilities.longTermLiabilities.reduce((s,a)=>s+a.netBalance,0))}</Text>
        </View>

        <View style={pdfStyles.total}>
          <Text style={pdfStyles.bold}>TOTAL LIABILITIES</Text>
          <Text style={pdfStyles.bold}>{formatGhs(liabilities.totalLiabilities)}</Text>
        </View>

        {/* Equity */}
        <Text style={pdfStyles.sectionHead}>EQUITY</Text>
        {equity.lines.map(a => (
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
    <tr>
      <td className="py-1.5 pl-4 text-sm text-gray-500 w-16">{account.accountCode}</td>
      <td className="py-1.5 text-sm text-gray-700">{account.accountName}</td>
      <td className="py-1.5 pr-4 text-right text-sm font-medium tabular-nums text-gray-900">
        {formatGhs(account.netBalance)}
      </td>
    </tr>
  )
}

function SectionHeader({ label }: { label: string }) {
  return (
    <tr className="bg-gray-50">
      <td colSpan={3} className="py-2 pl-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </td>
    </tr>
  )
}

function SubtotalRow({ label, amount, bold = false }: { label: string; amount: number; bold?: boolean }) {
  return (
    <tr className={`border-t border-gray-200 ${bold ? 'font-bold bg-gray-50' : 'font-semibold'}`}>
      <td className="py-2 pl-4 text-sm text-gray-500"></td>
      <td className="py-2 text-sm text-gray-800">{label}</td>
      <td className={`py-2 pr-4 text-right text-sm tabular-nums ${amount < 0 ? 'text-red-600' : 'text-gray-900'}`}>
        {formatGhs(amount)}
      </td>
    </tr>
  )
}

function GrandTotalRow({ label, amount }: { label: string; amount: number }) {
  return (
    <tr className="border-t-2 border-gray-800 bg-gray-100">
      <td className="py-3 pl-4 text-sm"></td>
      <td className="py-3 text-sm font-bold text-gray-900">{label}</td>
      <td className={`py-3 pr-4 text-right text-sm font-bold tabular-nums ${amount < 0 ? 'text-red-600' : 'text-gray-900'}`}>
        {formatGhs(amount)}
      </td>
    </tr>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BalanceSheetReport({ data }: { data: BalanceSheet }) {
  const [pdfLoading, setPdfLoading] = useState(false)

  const { assets, liabilities, equity } = data

  const totalCurrentAssets = assets.currentAssets.reduce((s, a) => s + a.netBalance, 0)
  const totalCurrentL      = liabilities.currentLiabilities.reduce((s, a) => s + a.netBalance, 0)
  const totalLongTermL     = liabilities.longTermLiabilities.reduce((s, a) => s + a.netBalance, 0)

  // ── CSV export ────────────────────────────────────────────────────────────
  const handleCsv = () => {
    const rows: Record<string, string | number>[] = []

    const section = (label: string) =>
      rows.push({ Section: label, 'Account Code': '', Account: '', 'Amount (GHS)': '' })
    const line = (code: string, name: string, amount: number) =>
      rows.push({ Section: '', 'Account Code': code, Account: name, 'Amount (GHS)': amount.toFixed(2) })
    const subtotal = (label: string, amount: number) =>
      rows.push({ Section: label, 'Account Code': '', Account: '', 'Amount (GHS)': amount.toFixed(2) })

    section('ASSETS')
    section('Current Assets')
    for (const a of assets.currentAssets.filter(a => a.netBalance !== 0)) {
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
    for (const a of liabilities.currentLiabilities.filter(a => a.netBalance !== 0)) {
      line(a.accountCode, a.accountName, a.netBalance)
    }
    subtotal('Total Current Liabilities', totalCurrentL)
    section('Long-term Liabilities')
    for (const a of liabilities.longTermLiabilities.filter(a => a.netBalance !== 0)) {
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
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
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
          ⚠ Balance Sheet does not balance — {formatGhs(data.imbalanceAmount)} discrepancy.
          This indicates a data integrity issue. Run integrity check.
        </div>
      )}

      {/* Export controls */}
      <div className="flex justify-end gap-2">
        <button
          onClick={handleCsv}
          className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Download CSV
        </button>
        <button
          onClick={handlePdf}
          disabled={pdfLoading}
          className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {pdfLoading ? 'Generating…' : 'Download PDF'}
        </button>
      </div>

      {/* Report table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="py-3 pl-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 w-16">Code</th>
              <th className="py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Account</th>
              <th className="py-3 pr-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Amount (GHS)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">

            {/* ── ASSETS ─────────────────────────────────────────────────── */}
            <tr className="bg-green-50">
              <td colSpan={3} className="py-2.5 pl-4 text-sm font-bold uppercase tracking-wider text-green-900">
                Assets
              </td>
            </tr>

            {/* Current Assets */}
            <SectionHeader label="Current Assets" />
            {assets.currentAssets.map(a => <AccountRow key={a.accountId} account={a} />)}
            <SubtotalRow label="Total Current Assets" amount={totalCurrentAssets} />

            {/* Fixed Assets */}
            <SectionHeader label="Fixed Assets" />
            <tr>
              <td className="py-1.5 pl-4 text-sm text-gray-500">1500</td>
              <td className="py-1.5 text-sm text-gray-700">Fixed Assets — Cost</td>
              <td className="py-1.5 pr-4 text-right text-sm font-medium tabular-nums text-gray-900">
                {formatGhs(assets.fixedAssets.cost)}
              </td>
            </tr>
            <tr>
              <td className="py-1.5 pl-4 text-sm text-gray-500">1510</td>
              <td className="py-1.5 text-sm text-gray-500 italic">Less: Accumulated Depreciation</td>
              <td className="py-1.5 pr-4 text-right text-sm tabular-nums text-gray-500">
                ({formatGhs(assets.fixedAssets.accumulatedDepreciation)})
              </td>
            </tr>
            <SubtotalRow label="Net Book Value" amount={assets.fixedAssets.netBookValue} />
            {assets.fixedAssets.accumulatedDepreciation === 0 && (
              <tr>
                <td></td>
                <td colSpan={2} className="py-1 text-xs text-gray-400 italic">
                  Accumulated depreciation tracking will be available after monthly depreciation is processed.
                </td>
              </tr>
            )}

            {/* Total Assets */}
            <GrandTotalRow label="TOTAL ASSETS" amount={assets.totalAssets} />

            {/* ── LIABILITIES ────────────────────────────────────────────── */}
            <tr className="bg-amber-50">
              <td colSpan={3} className="py-2.5 pl-4 text-sm font-bold uppercase tracking-wider text-amber-900">
                Liabilities
              </td>
            </tr>

            {/* Current Liabilities */}
            <SectionHeader label="Current Liabilities" />
            {liabilities.currentLiabilities.length > 0
              ? liabilities.currentLiabilities.map(a => <AccountRow key={a.accountId} account={a} />)
              : <tr><td colSpan={3} className="py-2 pl-4 text-sm text-gray-400 italic">None</td></tr>
            }
            <SubtotalRow label="Total Current Liabilities" amount={totalCurrentL} />

            {/* Long-term Liabilities */}
            <SectionHeader label="Long-term Liabilities" />
            {liabilities.longTermLiabilities.length > 0
              ? liabilities.longTermLiabilities.map(a => <AccountRow key={a.accountId} account={a} />)
              : <tr><td colSpan={3} className="py-2 pl-4 text-sm text-gray-400 italic">None</td></tr>
            }
            <SubtotalRow label="Total Long-term Liabilities" amount={totalLongTermL} />

            {/* Total Liabilities */}
            <GrandTotalRow label="TOTAL LIABILITIES" amount={liabilities.totalLiabilities} />

            {/* ── EQUITY ─────────────────────────────────────────────────── */}
            <tr className="bg-blue-50">
              <td colSpan={3} className="py-2.5 pl-4 text-sm font-bold uppercase tracking-wider text-blue-900">
                Equity
              </td>
            </tr>

            <SectionHeader label="Owner&apos;s Equity" />
            {equity.lines.map(a => <AccountRow key={a.accountId} account={a} />)}
            <tr>
              <td className="py-1.5 pl-4 text-sm text-gray-500"></td>
              <td className="py-1.5 text-sm text-gray-700">Financial Year to Date Profit/(Loss)</td>
              <td className={`py-1.5 pr-4 text-right text-sm font-medium tabular-nums ${
                equity.currentPeriodProfit < 0 ? 'text-red-600' : 'text-gray-900'
              }`}>
                {equity.currentPeriodProfit < 0
                  ? `(${formatGhs(Math.abs(equity.currentPeriodProfit))})`
                  : formatGhs(equity.currentPeriodProfit)
                }
              </td>
            </tr>
            <GrandTotalRow label="TOTAL EQUITY" amount={equity.totalEquity} />

            {/* ── TOTAL L + E ─────────────────────────────────────────────── */}
            <tr className="border-t-4 border-gray-900 bg-gray-100">
              <td className="py-4 pl-4 text-sm"></td>
              <td className="py-4 text-sm font-bold text-gray-900 uppercase tracking-wide">
                Total Liabilities + Equity
              </td>
              <td className={`py-4 pr-4 text-right text-sm font-bold tabular-nums ${
                data.totalLiabilitiesAndEquity < 0 ? 'text-red-600' : 'text-gray-900'
              }`}>
                {formatGhs(data.totalLiabilitiesAndEquity)}
              </td>
            </tr>

          </tbody>
        </table>
      </div>
    </div>
  )
}
