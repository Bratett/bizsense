'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useState, useTransition } from 'react'
import { createOpeningBalance, triggerReconciliation } from '@/actions/ledger'
import { seedBusiness } from '@/actions/onboarding'
import type { JournalEntriesResult, JournalEntryRow, TrialBalanceResult } from './queries'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/ui/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table'
import { FileText, BarChart3 } from 'lucide-react'

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
        <div className="max-w-7xl mx-auto">
          <PageHeader
            title="General Ledger"
            subtitle="Double-entry ledger — source of truth for all reports"
            className="mb-0"
            actions={
              isDev ? (
                <div className="flex flex-wrap gap-2 items-center">
                  <Badge variant="outline" className="font-mono text-[10px] border-yellow-300 bg-yellow-100 text-yellow-700">
                    DEV MODE
                  </Badge>

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
                    <Button type="submit" variant="outline" size="sm" className="font-mono border-yellow-400 bg-yellow-50 text-yellow-800 hover:bg-yellow-100">
                      Seed CoA + Tax
                    </Button>
                  </form>

                  {/* Opening balance button */}
                  <form
                    action={async () => {
                      await createOpeningBalance()
                      router.refresh()
                    }}
                  >
                    <Button type="submit" variant="outline" size="sm" className="font-mono">
                      + Opening Balance
                    </Button>
                  </form>

                  {seedStatus && <span className="text-xs text-gray-500 font-mono">{seedStatus}</span>}
                </div>
              ) : undefined
            }
          />
        </div>

        {/* Tab bar */}
        <div className="max-w-7xl mx-auto mt-3">
          <Tabs
            value={tab}
            onValueChange={(val) => navigate({ tab: val as string })}
          >
            <TabsList variant="line">
              <TabsTrigger value="journal">Journal Entries</TabsTrigger>
              <TabsTrigger value="trial-balance">Trial Balance</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-4">
        {isPending && <div className="text-xs text-gray-400 mb-2">Loading...</div>}

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
      <Card className="mb-4">
        <CardContent className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => navigate({ dateFrom: e.target.value, page: undefined })}
              className="w-36"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input
              type="date"
              value={filters.dateTo}
              onChange={(e) => navigate({ dateTo: e.target.value, page: undefined })}
              className="w-36"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Source</Label>
            <select
              value={filters.sourceType ?? ''}
              onChange={(e) => navigate({ sourceType: e.target.value || undefined, page: undefined })}
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none"
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
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer">
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
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer">
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
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <Table className="min-w-[600px]">
          <TableHeader>
            <TableRow>
              {isDev && (
                <TableHead className="text-yellow-700 text-xs font-mono bg-yellow-50">
                  Entry ID
                </TableHead>
              )}
              <TableHead className="text-xs">Date</TableHead>
              <TableHead className="text-xs">Ref</TableHead>
              <TableHead className="text-xs">Description</TableHead>
              <TableHead className="text-xs">Source</TableHead>
              <TableHead className="text-right text-xs font-mono tabular-nums">Dr Total</TableHead>
              <TableHead className="text-right text-xs font-mono tabular-nums">Cr Total</TableHead>
              <TableHead className="text-xs">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={isDev ? 8 : 7} className="px-3 py-12 text-center">
                  <EmptyState
                    icon={<FileText className="h-10 w-10" />}
                    title="No journal entries found"
                    subtitle="Try adjusting your filters or date range."
                    className="py-0"
                  />
                </TableCell>
              </TableRow>
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
          </TableBody>
        </Table>

        {/* Pagination */}
        {(page > 1 || hasMore) && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => navigate({ page: String(page - 1) })}
            >
              &larr; Prev
            </Button>
            <span className="text-sm text-muted-foreground">Page {page}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={!hasMore}
              onClick={() => navigate({ page: String(page + 1) })}
            >
              Next &rarr;
            </Button>
          </div>
        )}
      </Card>
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
      : ''

  const linesDrTotal = entry.lines.reduce((s, l) => s + Number(l.debitAmount), 0)
  const linesCrTotal = entry.lines.reduce((s, l) => s + Number(l.creditAmount), 0)
  const linesBalanced = Math.abs(linesDrTotal - linesCrTotal) < 0.001

  return (
    <>
      {/* Main row */}
      <TableRow className={`cursor-pointer ${rowBg}`} onClick={onToggle}>
        {isDev && (
          <TableCell className="bg-yellow-50">
            <span className="text-[10px] font-mono text-yellow-700 break-all">{entry.id}</span>
          </TableCell>
        )}
        <TableCell className="text-xs text-muted-foreground">
          {formatDate(entry.entryDate)}
        </TableCell>
        <TableCell className="text-xs text-muted-foreground font-mono">{entry.reference ?? '–'}</TableCell>
        <TableCell className="text-xs max-w-[200px] truncate">
          {entry.description ?? '–'}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-xs text-muted-foreground">{sourceLabel(entry.sourceType)}</span>
            {entry.aiGenerated && (
              <StatusBadge variant="ai">AI</StatusBadge>
            )}
            {entry.sourceType === 'reversal' && (
              <StatusBadge variant="reversal">REVERSAL</StatusBadge>
            )}
          </div>
        </TableCell>
        <TableCell className="text-xs font-mono tabular-nums text-right">
          {fmtGHS(entry.drTotal)}
        </TableCell>
        <TableCell className="text-xs font-mono tabular-nums text-right">
          {fmtGHS(entry.crTotal)}
        </TableCell>
        <TableCell className="text-xs">
          {entry.isImbalanced ? (
            <StatusBadge variant="overdue">IMBALANCED</StatusBadge>
          ) : (
            <span className="text-green-700">&#10003;</span>
          )}
          <span className="ml-1 text-gray-400">{isExpanded ? '\u25B2' : '\u25BC'}</span>
        </TableCell>
      </TableRow>

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
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Code</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Account Name</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground font-mono tabular-nums">
                      Debit (GHS)
                    </th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground font-mono tabular-nums">
                      Credit (GHS)
                    </th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Memo</th>
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
                      <td className="px-3 py-1.5 font-mono text-muted-foreground">{line.accountCode}</td>
                      <td className="px-3 py-1.5">{line.accountName}</td>
                      <td className="px-3 py-1.5 font-mono tabular-nums text-right">
                        {fmtGHS(line.debitAmount)}
                      </td>
                      <td className="px-3 py-1.5 font-mono tabular-nums text-right">
                        {fmtGHS(line.creditAmount)}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">{line.memo ?? '–'}</td>
                    </tr>
                  ))}
                  {/* Footer */}
                  <tr className="border-t border-gray-300 bg-gray-50 font-semibold">
                    <td colSpan={isDev ? 3 : 2} className="px-3 py-1.5">
                      TOTAL
                    </td>
                    <td className="px-3 py-1.5 font-mono tabular-nums text-right">
                      {fmtGHS(linesDrTotal)}
                    </td>
                    <td className="px-3 py-1.5 font-mono tabular-nums text-right">
                      {fmtGHS(linesCrTotal)}
                    </td>
                    <td className="px-3 py-1.5">
                      {linesBalanced ? (
                        <span className="text-green-700 font-medium">&#10003; Balanced</span>
                      ) : (
                        <StatusBadge variant="overdue">IMBALANCED</StatusBadge>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Dev: JSON view toggle */}
            {isDev && (
              <div className="mt-2">
                <Button
                  variant="link"
                  size="xs"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowJson((v) => !v)
                  }}
                  className="text-[10px] font-mono text-yellow-700 p-0 h-auto"
                >
                  {showJson ? 'Hide JSON' : 'Show JSON'}
                </Button>
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
      <Card className="mb-4">
        <CardContent className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Period</Label>
            <select
              value={tbPeriod}
              onChange={(e) => applyPeriod(e.target.value)}
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none"
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
                <Label className="text-xs text-muted-foreground">From</Label>
                <Input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => navigate({ dateFrom: e.target.value })}
                  className="w-36"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">To</Label>
                <Input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => navigate({ dateTo: e.target.value })}
                  className="w-36"
                />
              </div>
            </>
          )}
          {tbPeriod !== 'custom' && (
            <span className="text-xs text-muted-foreground">
              {filters.dateFrom} &rarr; {filters.dateTo}
            </span>
          )}
        </CardContent>
      </Card>

      {/* Balance banner */}
      {isBalanced ? (
        <div className="mb-4 flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800 font-medium">
          <span className="text-green-700 text-base">&#10003;</span>
          Trial Balance is balanced
        </div>
      ) : (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="text-sm text-red-800 font-medium">
              <span className="text-red-600">&#10007;</span> Trial Balance does not balance — difference:{' '}
              <span className="font-mono">GHS {fmtGHS(diff)}</span>
            </div>
            <form
              action={async () => {
                await triggerReconciliation()
              }}
            >
              <Button type="submit" variant="destructive" size="sm">
                Run reconciliation
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* Table */}
      <Card className="overflow-hidden">
        <Table className="min-w-[520px]">
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs font-mono">Code</TableHead>
              <TableHead className="text-xs">Account Name</TableHead>
              <TableHead className="text-xs">Type</TableHead>
              <TableHead className="text-right text-xs font-mono tabular-nums">Total Debits</TableHead>
              <TableHead className="text-right text-xs font-mono tabular-nums">Total Credits</TableHead>
              <TableHead className="text-right text-xs font-mono tabular-nums">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {TYPE_ORDER.map((type) => {
              const typeRows = grouped[type]
              if (typeRows.length === 0) return null
              return (
                <TrialBalanceTypeGroup key={type} type={type} typeRows={typeRows} />
              )
            })}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="px-3 py-12 text-center">
                  <EmptyState
                    icon={<BarChart3 className="h-10 w-10" />}
                    title="No transactions in this period"
                    subtitle="Select a different date range to view the trial balance."
                    className="py-0"
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          {rows.length > 0 && (
            <TableFooter>
              <TableRow className="font-semibold">
                <TableCell colSpan={3} className="text-xs">
                  Grand Total
                </TableCell>
                <TableCell className="font-mono tabular-nums text-xs text-right">
                  {fmtGHS(grandTotalDebits)}
                </TableCell>
                <TableCell className="font-mono tabular-nums text-xs text-right">
                  {fmtGHS(grandTotalCredits)}
                </TableCell>
                <TableCell className="font-mono tabular-nums text-xs text-right">
                  {isBalanced ? (
                    <span className="text-green-700">&ndash;</span>
                  ) : (
                    <span className="text-red-600">{fmtGHS(diff)}</span>
                  )}
                </TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </Card>
    </div>
  )
}

// Extracted to avoid the Fragment-key issue in the original code
function TrialBalanceTypeGroup({
  type,
  typeRows,
}: {
  type: string
  typeRows: TrialBalanceResult['rows']
}) {
  return (
    <>
      <TableRow className="bg-muted border-y">
        <TableCell
          colSpan={6}
          className="text-xs font-semibold uppercase tracking-wide"
        >
          {TYPE_LABEL[type]}
        </TableCell>
      </TableRow>
      {typeRows.map((row) => (
        <TableRow key={row.code}>
          <TableCell className="font-mono text-xs text-muted-foreground">{row.code}</TableCell>
          <TableCell className="text-xs">{row.name}</TableCell>
          <TableCell className="text-xs text-muted-foreground capitalize">{row.type}</TableCell>
          <TableCell className="font-mono tabular-nums text-xs text-right">
            {fmtGHS(row.totalDebits)}
          </TableCell>
          <TableCell className="font-mono tabular-nums text-xs text-right">
            {fmtGHS(row.totalCredits)}
          </TableCell>
          <TableCell className="font-mono tabular-nums text-xs text-right">
            {fmtGHS(row.balance)}
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}
