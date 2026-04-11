'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useState, useTransition } from 'react'
import { createOpeningBalance, triggerReconciliation } from '@/actions/ledger'
import { seedBusiness } from '@/actions/onboarding'
import type { JournalEntriesResult, JournalEntryRow, TrialBalanceResult } from './queries'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtGHS(value: string | number): string {
  const n = Number(value)
  if (n === 0) return '–'
  const abs = Math.abs(n)
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return n < 0 ? `(${abs})` : abs
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ]
  return `${d} ${months[Number(m) - 1]} ${y}`
}

function sourceLabel(sourceType: string): string {
  const map: Record<string, string> = {
    order: 'Order',
    expense: 'Expense',
    payment: 'Payment',
    payroll: 'Payroll',
    manual: 'Manual',
    ai_recorded: 'AI',
    reversal: 'Reversal',
    opening_balance: 'OB',
  }
  return map[sourceType] ?? sourceType
}

const TYPE_ORDER = ['asset', 'liability', 'equity', 'revenue', 'cogs', 'expense']
const TYPE_LABEL: Record<string, string> = {
  asset: 'Assets',
  liability: 'Liabilities',
  equity: 'Equity',
  revenue: 'Revenue',
  cogs: 'Cost of Goods Sold',
  expense: 'Expenses',
}

// ─── Props ────────────────────────────────────────────────────────────────────

export type LedgerFilters = {
  dateFrom: string
  dateTo: string
  sourceType?: string
  aiGenerated?: boolean
  unbalancedOnly?: boolean
}

interface LedgerTabsProps {
  tab: string
  entriesResult: JournalEntriesResult
  trialBalance: TrialBalanceResult
  filters: LedgerFilters
  isDev: boolean
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LedgerTabs({
  tab,
  entriesResult,
  trialBalance,
  filters,
  isDev,
}: LedgerTabsProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [seedStatus, setSeedStatus] = useState<string | null>(null)

  // ── URL helpers ─────────────────────────────────────────────────────────────

  const buildUrl = useCallback(
    (overrides: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(overrides)) {
        if (value === undefined || value === '') {
          params.delete(key)
        } else {
          params.set(key, value)
        }
      }
      return `?${params.toString()}`
    },
    [searchParams],
  )

  const navigate = (overrides: Record<string, string | undefined>) => {
    startTransition(() => router.push(buildUrl(overrides)))
  }

  // ── Tab switcher ─────────────────────────────────────────────────────────────

  const tabBase = 'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors'
  const tabActive = `${tabBase} border-green-700 text-green-700`
  const tabInactive = `${tabBase} border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300`

  // ── Period presets for Trial Balance ─────────────────────────────────────────

  const [tbPeriod, setTbPeriod] = useState<string>(() => {
    if (searchParams.get('dateFrom') || searchParams.get('dateTo')) return 'custom'
    return 'current_month'
  })

  function applyPeriod(preset: string) {
    setTbPeriod(preset)
    const now = new Date()
    if (preset === 'current_month') {
      const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
      const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`
      navigate({ dateFrom: from, dateTo: to, page: undefined })
    } else if (preset === 'last_month') {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
      const to = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`
      navigate({ dateFrom: from, dateTo: to, page: undefined })
    } else if (preset === 'ytd') {
      navigate({
        dateFrom: `${now.getFullYear()}-01-01`,
        dateTo: now.toISOString().split('T')[0],
        page: undefined,
      })
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Page header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-7xl mx-auto flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">General Ledger</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Double-entry ledger — source of truth for all reports
            </p>
          </div>

          {/* Dev toolbar — non-production only */}
          {isDev && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 border border-yellow-300 font-semibold">
                DEV MODE
              </span>

              {/* Seed button */}
              <form
                action={async () => {
                  const result = await seedBusiness()
                  setSeedStatus(
                    result.accounts === 0 && result.taxComponents === 0
                      ? 'Already seeded'
                      : `Seeded ${result.accounts} accounts + ${result.taxComponents} tax components`,
                  )
                  router.refresh()
                }}
              >
                <button
                  type="submit"
                  className="text-xs px-3 py-1.5 rounded border border-yellow-400 bg-yellow-50 text-yellow-800 hover:bg-yellow-100 font-mono"
                >
                  Seed CoA + Tax
                </button>
              </form>

              {/* Opening balance button */}
              <form
                action={async () => {
                  await createOpeningBalance()
                  router.refresh()
                }}
              >
                <button
                  type="submit"
                  className="text-xs px-3 py-1.5 rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 font-mono"
                >
                  + Opening Balance
                </button>
              </form>

              {seedStatus && <span className="text-xs text-gray-500 font-mono">{seedStatus}</span>}
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div className="max-w-7xl mx-auto mt-3 flex gap-0 border-b border-gray-200 -mb-px">
          <button
            className={tab === 'journal' ? tabActive : tabInactive}
            onClick={() => navigate({ tab: 'journal' })}
          >
            Journal Entries
          </button>
          <button
            className={tab === 'trial-balance' ? tabActive : tabInactive}
            onClick={() => navigate({ tab: 'trial-balance' })}
          >
            Trial Balance
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-4">
        {isPending && <div className="text-xs text-gray-400 mb-2">Loading…</div>}

        {tab === 'journal' && (
          <JournalEntriesTab
            result={entriesResult}
            filters={filters}
            expandedId={expandedId}
            setExpandedId={setExpandedId}
            navigate={navigate}
            isDev={isDev}
          />
        )}

        {tab === 'trial-balance' && (
          <TrialBalanceTab
            result={trialBalance}
            filters={filters}
            tbPeriod={tbPeriod}
            applyPeriod={applyPeriod}
            navigate={navigate}
          />
        )}
      </div>
    </main>
  )
}

// ─── Journal Entries Tab ─────────────────────────────────────────────────────

interface JournalEntriesTabProps {
  result: JournalEntriesResult
  filters: LedgerFilters
  expandedId: string | null
  setExpandedId: (id: string | null) => void
  navigate: (overrides: Record<string, string | undefined>) => void
  isDev: boolean
}

function JournalEntriesTab({
  result,
  filters,
  expandedId,
  setExpandedId,
  navigate,
  isDev,
}: JournalEntriesTabProps) {
  const { entries, page, hasMore } = result

  return (
    <div>
      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm mb-4 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">From</label>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => navigate({ dateFrom: e.target.value, page: undefined })}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 w-36 focus:border-green-600 focus:ring-2 focus:ring-green-100 focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">To</label>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => navigate({ dateTo: e.target.value, page: undefined })}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 w-36 focus:border-green-600 focus:ring-2 focus:ring-green-100 focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Source</label>
          <select
            value={filters.sourceType ?? ''}
            onChange={(e) => navigate({ sourceType: e.target.value || undefined, page: undefined })}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:border-green-600 focus:ring-2 focus:ring-green-100 focus:outline-none"
          >
            <option value="">All sources</option>
            <option value="order">Order</option>
            <option value="expense">Expense</option>
            <option value="payment">Payment</option>
            <option value="payroll">Payroll</option>
            <option value="manual">Manual</option>
            <option value="ai_recorded">AI Recorded</option>
            <option value="reversal">Reversal</option>
            <option value="opening_balance">Opening Balance</option>
          </select>
        </div>
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={!!filters.aiGenerated}
            onChange={(e) =>
              navigate({ ai: e.target.checked ? 'true' : undefined, page: undefined })
            }
            className="rounded"
          />
          AI only
        </label>
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={!!filters.unbalancedOnly}
            onChange={(e) =>
              navigate({ unbalanced: e.target.checked ? 'true' : undefined, page: undefined })
            }
            className="rounded"
          />
          Unbalanced only
        </label>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {isDev && (
                  <th className="text-left px-3 py-2.5 font-medium text-yellow-700 text-xs font-mono bg-yellow-50">
                    Entry ID
                  </th>
                )}
                <th className="text-left px-3 py-2.5 font-medium text-gray-600 text-xs">Date</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600 text-xs">Ref</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600 text-xs">
                  Description
                </th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600 text-xs">Source</th>
                <th className="text-right px-3 py-2.5 font-medium text-gray-600 text-xs font-mono tabular-nums">
                  Dr Total
                </th>
                <th className="text-right px-3 py-2.5 font-medium text-gray-600 text-xs font-mono tabular-nums">
                  Cr Total
                </th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600 text-xs">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.length === 0 && (
                <tr>
                  <td colSpan={isDev ? 8 : 7} className="px-3 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <svg
                        width="40"
                        height="40"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="#9CA3AF"
                        strokeWidth={1}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                        />
                      </svg>
                      <p className="text-sm font-semibold text-gray-700">
                        No journal entries found
                      </p>
                      <p className="text-sm text-gray-500">
                        Try adjusting your filters or date range.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
              {entries.map((entry) => (
                <JournalEntryRows
                  key={entry.id}
                  entry={entry}
                  isExpanded={expandedId === entry.id}
                  onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                  isDev={isDev}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {(page > 1 || hasMore) && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
            <button
              disabled={page <= 1}
              onClick={() => navigate({ page: String(page - 1) })}
              className="text-sm px-3 py-2 rounded-lg border border-gray-200 bg-white disabled:opacity-50 hover:bg-gray-50"
            >
              &larr; Prev
            </button>
            <span className="text-sm text-gray-500">Page {page}</span>
            <button
              disabled={!hasMore}
              onClick={() => navigate({ page: String(page + 1) })}
              className="text-sm px-3 py-2 rounded-lg border border-gray-200 bg-white disabled:opacity-50 hover:bg-gray-50"
            >
              Next &rarr;
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Journal Entry Row (with expandable lines) ────────────────────────────────

interface JournalEntryRowsProps {
  entry: JournalEntryRow
  isExpanded: boolean
  onToggle: () => void
  isDev: boolean
}

function JournalEntryRows({ entry, isExpanded, onToggle, isDev }: JournalEntryRowsProps) {
  const [showJson, setShowJson] = useState(false)

  const rowBg = entry.isImbalanced
    ? 'bg-red-50 border-l-4 border-l-red-500'
    : entry.sourceType === 'reversal'
      ? 'bg-amber-50'
      : 'hover:bg-gray-50'

  const linesDrTotal = entry.lines.reduce((s, l) => s + Number(l.debitAmount), 0)
  const linesCrTotal = entry.lines.reduce((s, l) => s + Number(l.creditAmount), 0)
  const linesBalanced = Math.abs(linesDrTotal - linesCrTotal) < 0.001

  return (
    <>
      {/* Main row */}
      <tr className={`cursor-pointer transition-colors ${rowBg}`} onClick={onToggle}>
        {isDev && (
          <td className="px-3 py-2.5 bg-yellow-50">
            <span className="text-[10px] font-mono text-yellow-700 break-all">{entry.id}</span>
          </td>
        )}
        <td className="px-3 py-2.5 text-xs text-gray-700 whitespace-nowrap">
          {formatDate(entry.entryDate)}
        </td>
        <td className="px-3 py-2.5 text-xs text-gray-500 font-mono">{entry.reference ?? '–'}</td>
        <td className="px-3 py-2.5 text-xs text-gray-800 max-w-[200px] truncate">
          {entry.description ?? '–'}
        </td>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-xs text-gray-600">{sourceLabel(entry.sourceType)}</span>
            {entry.aiGenerated && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-medium">
                AI
              </span>
            )}
            {entry.sourceType === 'reversal' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                REVERSAL
              </span>
            )}
          </div>
        </td>
        <td className="px-3 py-2.5 text-xs font-mono tabular-nums text-right text-gray-800">
          {fmtGHS(entry.drTotal)}
        </td>
        <td className="px-3 py-2.5 text-xs font-mono tabular-nums text-right text-gray-800">
          {fmtGHS(entry.crTotal)}
        </td>
        <td className="px-3 py-2.5 text-xs">
          {entry.isImbalanced ? (
            <span className="text-red-600 font-semibold">✗ IMBALANCED</span>
          ) : (
            <span className="text-green-700">✓</span>
          )}
          <span className="ml-1 text-gray-400">{isExpanded ? '▲' : '▼'}</span>
        </td>
      </tr>

      {/* Expanded lines */}
      {isExpanded && (
        <tr
          className={
            entry.isImbalanced
              ? 'bg-red-50'
              : entry.sourceType === 'reversal'
                ? 'bg-amber-50'
                : 'bg-gray-50'
          }
        >
          <td colSpan={isDev ? 8 : 7} className="px-6 pb-3 pt-0">
            {/* Dev: entry metadata */}
            {isDev && (
              <div className="mt-2 mb-2 text-[10px] font-mono text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-3 py-2 flex flex-wrap gap-x-4 gap-y-1">
                <span>
                  <span className="opacity-60">entry_id:</span> {entry.id}
                </span>
                {entry.reversalOf && (
                  <span>
                    <span className="opacity-60">reversal_of:</span> {entry.reversalOf}
                  </span>
                )}
                <span>
                  <span className="opacity-60">source_type:</span> {entry.sourceType}
                </span>
                <span>
                  <span className="opacity-60">ai_generated:</span> {String(entry.aiGenerated)}
                </span>
                <span>
                  <span className="opacity-60">sync_status:</span> n/a (Sprint 9)
                </span>
              </div>
            )}

            {/* Lines table */}
            <div className="overflow-x-auto rounded border border-gray-200 mt-1">
              <table className="w-full text-xs min-w-[480px]">
                <thead>
                  <tr className="bg-white border-b border-gray-200">
                    {isDev && (
                      <th className="text-left px-3 py-2 font-medium text-yellow-700 font-mono bg-yellow-50">
                        Account ID
                      </th>
                    )}
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Code</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Account Name</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-500 font-mono tabular-nums">
                      Debit (GHS)
                    </th>
                    <th className="text-right px-3 py-2 font-medium text-gray-500 font-mono tabular-nums">
                      Credit (GHS)
                    </th>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Memo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {entry.lines.map((line, i) => (
                    <tr key={i} className="bg-white">
                      {isDev && (
                        <td className="px-3 py-1.5 bg-yellow-50">
                          <span className="text-[10px] font-mono text-yellow-700 break-all">
                            {line.accountId}
                          </span>
                        </td>
                      )}
                      <td className="px-3 py-1.5 font-mono text-gray-600">{line.accountCode}</td>
                      <td className="px-3 py-1.5 text-gray-800">{line.accountName}</td>
                      <td className="px-3 py-1.5 font-mono tabular-nums text-right text-gray-800">
                        {fmtGHS(line.debitAmount)}
                      </td>
                      <td className="px-3 py-1.5 font-mono tabular-nums text-right text-gray-800">
                        {fmtGHS(line.creditAmount)}
                      </td>
                      <td className="px-3 py-1.5 text-gray-500">{line.memo ?? '–'}</td>
                    </tr>
                  ))}
                  {/* Footer */}
                  <tr className="border-t border-gray-300 bg-gray-50 font-semibold">
                    <td colSpan={isDev ? 3 : 2} className="px-3 py-1.5 text-gray-700">
                      TOTAL
                    </td>
                    <td className="px-3 py-1.5 font-mono tabular-nums text-right text-gray-800">
                      {fmtGHS(linesDrTotal)}
                    </td>
                    <td className="px-3 py-1.5 font-mono tabular-nums text-right text-gray-800">
                      {fmtGHS(linesCrTotal)}
                    </td>
                    <td className="px-3 py-1.5">
                      {linesBalanced ? (
                        <span className="text-green-700 font-medium">✓ Balanced</span>
                      ) : (
                        <span className="text-red-600 font-semibold">✗ IMBALANCED</span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Dev: JSON view toggle */}
            {isDev && (
              <div className="mt-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowJson((v) => !v)
                  }}
                  className="text-[10px] font-mono text-yellow-700 underline"
                >
                  {showJson ? 'Hide JSON' : 'Show JSON'}
                </button>
                {showJson && (
                  <pre className="mt-1 text-[10px] font-mono bg-gray-900 text-green-400 rounded p-3 overflow-x-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(
                      {
                        id: entry.id,
                        entryDate: entry.entryDate,
                        sourceType: entry.sourceType,
                        aiGenerated: entry.aiGenerated,
                        reversalOf: entry.reversalOf,
                        drTotal: entry.drTotal,
                        crTotal: entry.crTotal,
                        lines: entry.lines,
                      },
                      null,
                      2,
                    )}
                  </pre>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Trial Balance Tab ────────────────────────────────────────────────────────

interface TrialBalanceTabProps {
  result: TrialBalanceResult
  filters: LedgerFilters
  tbPeriod: string
  applyPeriod: (preset: string) => void
  navigate: (overrides: Record<string, string | undefined>) => void
}

function TrialBalanceTab({
  result,
  filters,
  tbPeriod,
  applyPeriod,
  navigate,
}: TrialBalanceTabProps) {
  const { rows, grandTotalDebits, grandTotalCredits, isBalanced } = result
  const diff = Math.abs(grandTotalDebits - grandTotalCredits)

  const grouped = TYPE_ORDER.reduce<Record<string, typeof rows>>((acc, type) => {
    acc[type] = rows.filter((r) => r.type === type)
    return acc
  }, {})

  return (
    <div>
      {/* Period selector */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm mb-4 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Period</label>
          <select
            value={tbPeriod}
            onChange={(e) => applyPeriod(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:border-green-600 focus:ring-2 focus:ring-green-100 focus:outline-none"
          >
            <option value="current_month">Current month</option>
            <option value="last_month">Last month</option>
            <option value="ytd">Year to date</option>
            <option value="custom">Custom range</option>
          </select>
        </div>
        {tbPeriod === 'custom' && (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500 font-medium">From</label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => navigate({ dateFrom: e.target.value })}
                className="text-sm border border-gray-300 rounded-lg px-3 py-2 w-36 focus:border-green-600 focus:ring-2 focus:ring-green-100 focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500 font-medium">To</label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => navigate({ dateTo: e.target.value })}
                className="text-sm border border-gray-300 rounded-lg px-3 py-2 w-36 focus:border-green-600 focus:ring-2 focus:ring-green-100 focus:outline-none"
              />
            </div>
          </>
        )}
        {tbPeriod !== 'custom' && (
          <span className="text-xs text-gray-400">
            {filters.dateFrom} → {filters.dateTo}
          </span>
        )}
      </div>

      {/* Balance banner */}
      {isBalanced ? (
        <div className="mb-4 flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800 font-medium">
          <span className="text-green-700 text-base">✓</span>
          Trial Balance is balanced
        </div>
      ) : (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="text-sm text-red-800 font-medium">
              <span className="text-red-600">✗</span> Trial Balance does not balance — difference:{' '}
              <span className="font-mono">GHS {fmtGHS(diff)}</span>
            </div>
            <form
              action={async () => {
                await triggerReconciliation()
              }}
            >
              <button
                type="submit"
                className="text-xs px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 font-medium whitespace-nowrap"
              >
                Run reconciliation
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2.5 font-medium text-gray-600 text-xs font-mono">
                  Code
                </th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600 text-xs">
                  Account Name
                </th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600 text-xs">Type</th>
                <th className="text-right px-3 py-2.5 font-medium text-gray-600 text-xs font-mono tabular-nums">
                  Total Debits
                </th>
                <th className="text-right px-3 py-2.5 font-medium text-gray-600 text-xs font-mono tabular-nums">
                  Total Credits
                </th>
                <th className="text-right px-3 py-2.5 font-medium text-gray-600 text-xs font-mono tabular-nums">
                  Balance
                </th>
              </tr>
            </thead>
            <tbody>
              {TYPE_ORDER.map((type) => {
                const typeRows = grouped[type]
                if (typeRows.length === 0) return null
                return (
                  <>
                    <tr key={`hdr-${type}`} className="bg-gray-100 border-y border-gray-200">
                      <td
                        colSpan={6}
                        className="px-3 py-1.5 text-xs font-semibold text-gray-700 uppercase tracking-wide"
                      >
                        {TYPE_LABEL[type]}
                      </td>
                    </tr>
                    {typeRows.map((row) => (
                      <tr key={row.code} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-xs text-gray-600">{row.code}</td>
                        <td className="px-3 py-2 text-xs text-gray-800">{row.name}</td>
                        <td className="px-3 py-2 text-xs text-gray-500 capitalize">{row.type}</td>
                        <td className="px-3 py-2 font-mono tabular-nums text-xs text-right text-gray-800">
                          {fmtGHS(row.totalDebits)}
                        </td>
                        <td className="px-3 py-2 font-mono tabular-nums text-xs text-right text-gray-800">
                          {fmtGHS(row.totalCredits)}
                        </td>
                        <td className="px-3 py-2 font-mono tabular-nums text-xs text-right text-gray-800">
                          {fmtGHS(row.balance)}
                        </td>
                      </tr>
                    ))}
                  </>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <svg
                        width="40"
                        height="40"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="#9CA3AF"
                        strokeWidth={1}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
                        />
                      </svg>
                      <p className="text-sm font-semibold text-gray-700">
                        No transactions in this period
                      </p>
                      <p className="text-sm text-gray-500">
                        Select a different date range to view the trial balance.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                  <td colSpan={3} className="px-3 py-2.5 text-xs text-gray-700">
                    Grand Total
                  </td>
                  <td className="px-3 py-2.5 font-mono tabular-nums text-xs text-right text-gray-900">
                    {fmtGHS(grandTotalDebits)}
                  </td>
                  <td className="px-3 py-2.5 font-mono tabular-nums text-xs text-right text-gray-900">
                    {fmtGHS(grandTotalCredits)}
                  </td>
                  <td className="px-3 py-2.5 font-mono tabular-nums text-xs text-right">
                    {isBalanced ? (
                      <span className="text-green-700">–</span>
                    ) : (
                      <span className="text-red-600">{fmtGHS(diff)}</span>
                    )}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
