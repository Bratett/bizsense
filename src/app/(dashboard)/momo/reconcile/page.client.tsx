'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { formatGhs } from '@/lib/format'
import { computeVariance } from '@/lib/momo/variance'
import { saveMoMoReconciliationSnapshot } from '@/actions/momoReconciliation'
import type { MoMoAccount } from '@/lib/momo/variance'
import type { SnapshotLine } from '@/actions/momoReconciliation'

// ─── Network colours ──────────────────────────────────────────────────────────

const NETWORK_DOT: Record<string, string> = {
  MTN: 'bg-yellow-400',
  Telecel: 'bg-red-400',
  AirtelTigo: 'bg-orange-400',
  Bank: 'bg-blue-400',
}

const NETWORK_LABEL: Record<string, string> = {
  MTN: 'MTN MoMo',
  Telecel: 'Telecel Cash',
  AirtelTigo: 'AirtelTigo Money',
  Bank: 'Bank / Cash',
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  accounts: MoMoAccount[]
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MoMoReconcileClient({ accounts }: Props) {
  // actualBalances keyed by accountCode; empty string = not yet entered
  const [actualBalances, setActualBalances] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function parseBalance(raw: string | undefined): number | null {
    if (!raw || raw.trim() === '') return null
    const n = parseFloat(raw)
    return isNaN(n) ? null : n
  }

  // Derived per-row variance data
  const rows = accounts.map((acc) => {
    const actual = parseBalance(actualBalances[acc.accountCode])
    return { ...acc, actual, ...computeVariance(acc.bookBalance, actual) }
  })

  // Summary totals (only include rows where user has entered a value)
  const totalBook = accounts.reduce((s, a) => s + a.bookBalance, 0)
  const enteredRows = rows.filter((r) => r.actual !== null)
  const totalActual = enteredRows.reduce((s, r) => s + (r.actual ?? 0), 0)
  const netVariance = enteredRows.length > 0 ? totalActual - totalBook : null

  // Guidance state
  const hasSurplus = rows.some((r) => r.status === 'surplus')
  const hasDeficit = rows.some((r) => r.status === 'deficit')
  const allMatch = enteredRows.length === accounts.length && rows.every((r) => r.status === 'match')

  // At least one actual balance entered to enable "Save Snapshot"
  const canSave = enteredRows.length > 0

  function handleSave() {
    if (!canSave) return
    setSaved(false)
    setSaveError(null)

    const lines: SnapshotLine[] = enteredRows.map((r) => ({
      accountCode: r.accountCode,
      accountName: r.accountName,
      bookBalance: r.bookBalance,
      actualBalance: r.actual!,
      variance: r.variance ?? 0,
    }))

    startTransition(async () => {
      try {
        await saveMoMoReconciliationSnapshot({
          lines,
          totalBookBalance: totalBook,
          totalActualBalance: totalActual,
          netVariance: netVariance ?? 0,
        })
        setSaved(true)
      } catch {
        setSaveError('Could not save snapshot. Please try again.')
      }
    })
  }

  return (
    <div className="space-y-5">
      {/* ── Instructions ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <p className="mb-1 font-semibold">How to use this:</p>
        <ol className="list-decimal space-y-0.5 pl-4">
          <li>
            Check your balance for each MoMo wallet on your phone (dial *170# for MTN, *134# for
            Telecel, *185# for AirtelTigo).
          </li>
          <li>Enter the actual balance you see in the field below.</li>
          <li>
            BizSense will show any difference between what&apos;s in your wallet and your books.
          </li>
          <li>If there&apos;s a difference, record the missing transaction in BizSense.</li>
        </ol>
      </div>

      {/* ── Reconciliation rows ───────────────────────────────────────────── */}
      <div className="space-y-3">
        {rows.map((row) => {
          const { status, variance, varianceLabel } = row
          return (
            <div
              key={row.accountCode}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              {/* Top row */}
              <div className="flex flex-wrap items-start gap-3 md:flex-nowrap md:items-center">
                {/* Account name + network */}
                <div className="flex flex-1 items-center gap-2 min-w-[140px]">
                  <span
                    className={`inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full ${NETWORK_DOT[row.network] ?? 'bg-gray-400'}`}
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{row.accountName}</p>
                    <p className="text-xs text-gray-400">{NETWORK_LABEL[row.network]}</p>
                  </div>
                </div>

                {/* Book balance */}
                <div className="text-right md:w-28">
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">Book</p>
                  <p
                    className={`text-sm font-semibold tabular-nums ${row.bookBalance >= 0 ? 'text-green-700' : 'text-red-600'}`}
                  >
                    {formatGhs(row.bookBalance)}
                  </p>
                </div>

                {/* Actual balance input */}
                <div className="md:w-36">
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">Actual</p>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    placeholder="Enter balance..."
                    value={actualBalances[row.accountCode] ?? ''}
                    onChange={(e) =>
                      setActualBalances((prev) => ({
                        ...prev,
                        [row.accountCode]: e.target.value,
                      }))
                    }
                    className="mt-0.5 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm tabular-nums placeholder-gray-300 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>

                {/* Variance badge */}
                <div className="md:w-32 text-right">
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">Variance</p>
                  {status === 'pending' && <span className="text-sm text-gray-400">—</span>}
                  {status === 'match' && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      ✓ Balanced
                    </span>
                  )}
                  {status === 'surplus' && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                      ↑ {formatGhs(variance ?? 0)}
                    </span>
                  )}
                  {status === 'deficit' && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      ↓ {formatGhs(Math.abs(variance ?? 0))}
                    </span>
                  )}
                </div>
              </div>

              {/* Variance explanation */}
              {(status === 'surplus' || status === 'deficit') && varianceLabel && (
                <p className="mt-2 text-xs text-gray-500">{varianceLabel}</p>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Summary ───────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Summary</p>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Total book balance</span>
            <span className="font-medium tabular-nums text-gray-900">{formatGhs(totalBook)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">
              Total actual balance
              {enteredRows.length < accounts.length && enteredRows.length > 0 && (
                <span className="ml-1 text-gray-400">
                  ({enteredRows.length}/{accounts.length} entered)
                </span>
              )}
            </span>
            <span className="font-medium tabular-nums text-gray-900">
              {enteredRows.length > 0 ? formatGhs(totalActual) : '—'}
            </span>
          </div>
          {netVariance !== null && (
            <div className="flex justify-between border-t border-gray-200 pt-1">
              <span className="font-medium text-gray-700">Net variance</span>
              <span
                className={`font-semibold tabular-nums ${
                  Math.abs(netVariance) < 0.01
                    ? 'text-green-700'
                    : netVariance > 0
                      ? 'text-blue-700'
                      : 'text-red-600'
                }`}
              >
                {Math.abs(netVariance) < 0.01 ? '✓ ' : netVariance > 0 ? '↑ ' : '↓ '}
                {formatGhs(Math.abs(netVariance))}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Guidance cards ────────────────────────────────────────────────── */}
      {allMatch && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          ✓ All your MoMo wallets match your books. Great record-keeping!
        </div>
      )}
      {hasSurplus && !allMatch && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="mb-1">
            You have more money in your wallet than your books show. This may be income you
            haven&apos;t recorded yet.
          </p>
          <Link
            href="/payments/new"
            className="font-medium underline underline-offset-2 hover:text-amber-900"
          >
            Record a payment received →
          </Link>
        </div>
      )}
      {hasDeficit && !allMatch && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="mb-1">
            You have less money than your books show. This may be an expense or MoMo fee you
            haven&apos;t recorded.
          </p>
          <Link
            href="/expenses/new"
            className="font-medium underline underline-offset-2 hover:text-red-900"
          >
            Record an expense →
          </Link>
        </div>
      )}

      {/* ── Save snapshot ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <button
          onClick={handleSave}
          disabled={!canSave || isPending}
          className="w-full rounded-xl bg-green-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? 'Saving…' : 'Save Snapshot'}
        </button>
        {saved && (
          <p className="text-center text-xs text-green-700">
            ✓ Snapshot saved — you can refer back to this later.
          </p>
        )}
        {saveError && <p className="text-center text-xs text-red-600">{saveError}</p>}
        <p className="text-center text-xs text-gray-400">
          Save a snapshot to keep a record of today&apos;s reconciliation.
        </p>
      </div>

      {/* ── Footer links ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-4 border-t border-gray-100 pt-4 text-sm">
        <Link href="/reports/sales" className="text-green-700 hover:underline">
          View MoMo Transactions →
        </Link>
        <Link href="/expenses/new" className="text-green-700 hover:underline">
          Record Missing Transaction →
        </Link>
      </div>
    </div>
  )
}
